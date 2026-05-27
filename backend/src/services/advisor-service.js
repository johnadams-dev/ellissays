// ─────────────────────────────────────────────────────────────────────────────
// Ellis AI Advisor Service
// Uses Claude (Anthropic) to generate the path recommendation,
// net proceeds comparison, listing descriptions, and stale listing alerts.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

// ── Path recommendation ───────────────────────────────────────────────────────

/**
 * Generate Ellis's path recommendation based on the seller's trade-off
 * profile and the property valuation data.
 *
 * @param {object} tradeoffs - slider values (0-100) for each dimension
 * @param {object} valuation - the ValuationPanel object from valuation-service
 * @param {object} context   - { propertyType, condition, techComfort, marketHeat }
 * @returns {object} recommendation with path rankings and net proceeds estimates
 */
export async function getPathRecommendation(tradeoffs, valuation, context = {}) {
  const {
    speedVsPrice    = 50,    // 0 = quick sale, 100 = highest price
    effortVsSavings = 50,    // 0 = hands-off, 100 = do the work
    certaintyVsRisk = 50,    // 0 = guaranteed, 100 = tolerate risk
    timingVsExposure = 50,   // 0 = 30-day urgency, 100 = 90+ days
  } = tradeoffs;

  const midpoint  = valuation?.ellisRange?.midpoint || 0;
  const marketStats = valuation?.comparableSales?.marketStats;

  const systemPrompt = `You are Ellis, an AI home selling advisor. You help homeowners make the most informed selling decision possible. You are honest even when the truth is inconvenient. You never push a single approach. You present trade-offs clearly.

Your tone: warm and intelligent. A knowledgeable friend, not a software product. A little wit when appropriate. Never silly about something serious.

Respond ONLY with a valid JSON object. No markdown, no preamble, no explanation outside the JSON.`;

  const userPrompt = `A homeowner has completed the Ellis trade-off advisor. Generate a path recommendation.

PROPERTY:
- Estimated value range: ${valuation?.ellisRange?.formattedLow} – ${valuation?.ellisRange?.formattedHigh}
- Midpoint: ${valuation?.ellisRange?.formattedMid}
- Property type: ${context.propertyType || 'Residential'}
- Condition: ${context.condition || 'Good'}
- County: ${valuation?.address?.county || 'Not specified'}

TRADE-OFF PROFILE (0 = left end, 100 = right end):
- Speed vs. Price: ${speedVsPrice}/100 (${speedVsPrice < 40 ? 'wants quick sale' : speedVsPrice > 60 ? 'wants highest price' : 'balanced'})
- Effort vs. Savings: ${effortVsSavings}/100 (${effortVsSavings < 40 ? 'wants hands-off' : effortVsSavings > 60 ? 'willing to do the work' : 'balanced'})
- Certainty vs. Risk: ${certaintyVsRisk}/100 (${certaintyVsRisk < 40 ? 'needs certainty' : certaintyVsRisk > 60 ? 'tolerates risk' : 'balanced'})
- Timing vs. Exposure: ${timingVsExposure}/100 (${timingVsExposure < 30 ? 'needs to move in 30 days' : timingVsExposure > 70 ? 'has 90+ days' : 'moderate timeline'})

MARKET CONTEXT:
- Median close price in area: ${marketStats?.medianClosePrice ? '$' + marketStats.medianClosePrice.toLocaleString() : 'Unknown'}
- Average days on market: ${marketStats?.avgDaysOnMarket || 'Unknown'}
- Avg list-to-sale ratio: ${marketStats?.avgListToSaleRatio ? (marketStats.avgListToSaleRatio * 100).toFixed(1) + '%' : 'Unknown'}

Generate a JSON response with this exact structure:
{
  "recommendedPath": "ai_listing" | "traditional_agent" | "discount_broker" | "fsbo" | "ibuyer",
  "recommendationReason": "2-3 sentence plain-language explanation of why this path fits this seller's profile. Mention the most important trade-off driving the recommendation.",
  "honestyNote": "One sentence of honest context the seller should know — even if it's inconvenient. E.g. agent-assisted sales typically produce higher prices, or FSBO requires significant time investment.",
  "paths": [
    {
      "id": "ai_listing",
      "name": "AI-Assisted Listing (Ellis as Broker)",
      "rank": 1,
      "estimatedNetProceeds": <number — midpoint minus 1.75% commission>,
      "estimatedCommission": <number — 1.75% of midpoint>,
      "timeToClose": "45-75 days typical",
      "effortLevel": "Low-Medium",
      "certaintyLevel": "Medium",
      "pros": ["string", "string"],
      "cons": ["string"],
      "ellisNote": "One sentence of Ellis-voice commentary on this path for this seller specifically."
    },
    {
      "id": "traditional_agent",
      "name": "Traditional Full-Service Agent",
      "rank": 2,
      "estimatedNetProceeds": <number — midpoint minus 3% commission>,
      "estimatedCommission": <number — 3% of midpoint>,
      "timeToClose": "45-90 days typical",
      "effortLevel": "Low",
      "certaintyLevel": "High",
      "pros": ["string", "string"],
      "cons": ["string"],
      "ellisNote": "One sentence Ellis-voice commentary."
    },
    {
      "id": "discount_broker",
      "name": "Discount Broker",
      "rank": 3,
      "estimatedNetProceeds": <number — midpoint minus 1.5% commission>,
      "estimatedCommission": <number — 1.5% of midpoint>,
      "timeToClose": "45-90 days typical",
      "effortLevel": "Low-Medium",
      "certaintyLevel": "High",
      "pros": ["string"],
      "cons": ["string"],
      "ellisNote": "One sentence Ellis-voice commentary."
    },
    {
      "id": "fsbo",
      "name": "For Sale By Owner",
      "rank": 4,
      "estimatedNetProceeds": <number — midpoint minus $799 flat fee>,
      "estimatedCost": 799,
      "timeToClose": "60-120 days typical",
      "effortLevel": "High",
      "certaintyLevel": "Low",
      "pros": ["string"],
      "cons": ["string"],
      "ellisNote": "One sentence Ellis-voice commentary. Be honest: NAR data shows FSBO homes sell for median $65K less."
    },
    {
      "id": "ibuyer",
      "name": "Cash Offer / iBuyer",
      "rank": 5,
      "estimatedNetProceeds": <number — midpoint minus 8% for fees and discount>,
      "estimatedDiscount": <number — 8% of midpoint>,
      "timeToClose": "7-21 days",
      "effortLevel": "Very Low",
      "certaintyLevel": "Very High",
      "availabilityNote": "Geographic availability varies. Ellis checks Opendoor for your specific address.",
      "pros": ["string"],
      "cons": ["string"],
      "ellisNote": "One sentence Ellis-voice commentary."
    }
  ]
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(clean);
}

// ── Listing description generator ─────────────────────────────────────────────

/**
 * Generate an MLS-ready listing description for the AI-assisted path.
 */
export async function generateListingDescription(propertyFacts, sellerInputs = {}) {
  const { beds, baths, sqft, yearBuilt, city, zip } = { ...propertyFacts, ...sellerInputs };
  const { highlights = [], recentUpdates = [], neighborhood = '' } = sellerInputs;

  const prompt = `Write a compelling, MLS-ready property listing description for a home with these details:

- Location: ${city || 'Florida'}, FL ${zip || ''}
- Beds: ${beds || 'N/A'}, Baths: ${baths || 'N/A'}
- Square footage: ${sqft ? sqft.toLocaleString() : 'N/A'} sqft
- Year built: ${yearBuilt || 'N/A'}
- Seller highlights: ${highlights.join(', ') || 'None provided'}
- Recent updates: ${recentUpdates.join(', ') || 'None provided'}
- Neighborhood context: ${neighborhood || 'None provided'}

Write 3-4 sentences. Use active voice. Lead with the most compelling feature. Avoid clichés like "must see," "gem," "charming." Do not include price. Be specific where possible. Do not use exclamation points.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

// ── Stale listing alert ───────────────────────────────────────────────────────

/**
 * Generate a plain-language stale listing analysis and action options.
 * Called when a listing reaches 14, 30, or 45 days without offers.
 */
export async function generateStaleListingAlert(listingData, marketStats, daysMilestone) {
  const { listPrice, beds, baths, sqft, city, zip, showings = 0, inquiries = 0 } = listingData;
  const { medianClosePrice, avgDaysOnMarket, avgListToSaleRatio } = marketStats || {};

  const systemPrompt = `You are Ellis, an AI home selling advisor. A seller's listing has stalled on market. Your job is to give them the honest picture — with warmth, not alarm — and present clear options. Respond ONLY with valid JSON.`;

  const userPrompt = `A listing has been on market ${daysMilestone} days with no offers.

LISTING:
- List price: $${listPrice?.toLocaleString() || 'Unknown'}
- Beds/Baths/Sqft: ${beds}/${baths}/${sqft?.toLocaleString()}
- Location: ${city}, FL ${zip}
- Showings in period: ${showings}
- Inquiries in period: ${inquiries}

LOCAL MARKET BENCHMARKS:
- Median close price: ${medianClosePrice ? '$' + medianClosePrice.toLocaleString() : 'Unknown'}
- Avg days on market: ${avgDaysOnMarket || 'Unknown'} days
- Avg list-to-sale ratio: ${avgListToSaleRatio ? (avgListToSaleRatio * 100).toFixed(1) + '%' : 'Unknown'}

Generate a JSON response:
{
  "diagnosis": "2-3 sentences. What is the market telling them? Be honest but warm. If list price appears above market, say so clearly.",
  "showingContext": "One sentence putting their showing count in market context.",
  "options": [
    {
      "id": "price_reduction",
      "action": "Reduce price by X%",
      "suggestedReduction": <percentage as number, e.g. 4>,
      "suggestedNewPrice": <calculated price>,
      "rationale": "One sentence why this reduction, based on list-to-sale ratio data.",
      "expectedOutcome": "One sentence on likely effect on days-on-market."
    },
    {
      "id": "agent_referral",
      "action": "Switch to full-service agent",
      "rationale": "One sentence. Agent brings buyer network and negotiation expertise.",
      "expectedOutcome": "One sentence."
    },
    {
      "id": "investor_match",
      "action": "Open to investor / cash offer",
      "rationale": "One sentence. Certainty over maximum price.",
      "expectedOutcome": "Close in 7-21 days. Offer likely 5-10% below market."
    }
  ],
  "ellisMessage": "A 2-sentence message from Ellis to the seller. Warm, honest, not alarming. The tone of a knowledgeable friend who is telling them the truth."
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].text.trim();
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(clean);
}

// ── Offer analysis ────────────────────────────────────────────────────────────

/**
 * Analyze an incoming offer and explain it in plain language.
 */
export async function analyzeOffer(offer, listPrice, marketStats) {
  const { offerPrice, contingencies = [], closingDate, earnestMoney, financing } = offer;
  const pct = ((offerPrice / listPrice) * 100).toFixed(1);

  const prompt = `Analyze this real estate offer and explain it in plain language to a homeowner.

LIST PRICE: $${listPrice?.toLocaleString()}
OFFER PRICE: $${offerPrice?.toLocaleString()} (${pct}% of list price)
CONTINGENCIES: ${contingencies.join(', ') || 'None stated'}
CLOSING DATE: ${closingDate || 'Not specified'}
EARNEST MONEY: ${earnestMoney ? '$' + earnestMoney.toLocaleString() : 'Not specified'}
FINANCING: ${financing || 'Not specified'}
LOCAL AVG LIST-TO-SALE RATIO: ${marketStats?.avgListToSaleRatio ? (marketStats.avgListToSaleRatio * 100).toFixed(1) + '%' : 'Unknown'}

Explain in 3-4 sentences:
1. Is this a strong, fair, or weak offer relative to market?
2. What do the contingencies mean in plain English?
3. What is the risk level and what should the seller consider?

Use the Ellis voice — warm, honest, knowledgeable friend. No jargon.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  return {
    analysis: response.content[0].text.trim(),
    offerPct: parseFloat(pct),
    vsMarketRatio: marketStats?.avgListToSaleRatio
      ? parseFloat(pct) / 100 / marketStats.avgListToSaleRatio
      : null,
  };
}

export default {
  getPathRecommendation,
  generateListingDescription,
  generateStaleListingAlert,
  analyzeOffer,
};
