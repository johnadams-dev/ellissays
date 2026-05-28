// ─────────────────────────────────────────────────────────────────────────────
// Ellis Valuation Service
// Orchestrates all data sources to produce the multi-AVM valuation panel.
//
// For a given address this service:
//   1. Routes to the correct MLS via the registry
//   2. Pulls Zestimate from Bridge (display only, with attribution)
//   3. Pulls comparable sales from Bridge (Stellar) or Spark (other MLSs)
//   4. Derives an ATTOM-style AVM from comps (price/sqft model)
//   5. Pulls public record data for property facts
//   6. Blends everything into the Ellis range
//   7. Returns the full valuation panel object
// ─────────────────────────────────────────────────────────────────────────────

import bridge from '../api/bridge-client.js';
import spark, { calculateMarketStats } from '../api/spark-client.js';
import { getPrimaryMlsByCounty, PLATFORMS } from '../../config/mls-registry.js';

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generate the full Ellis valuation panel for a given address.
 *
 * @param {object} address - { street, city, county, state, zip }
 * @returns {object} ValuationPanel — the data structure the frontend renders
 */
export async function getValuationPanel(address) {
  const { street, city, county, state = 'FL', zip } = address;

  // Route to correct MLS based on county
  const mlsEntry = county
    ? getPrimaryMlsByCounty(county)
    : null;

  // Run all data fetches in parallel — fail gracefully on each
  const [zestimateResult, compsResult, publicRecordResult, propertyResult] =
    await Promise.allSettled([
      fetchZestimate(address),
      fetchComps(address, mlsEntry),
      fetchPublicRecord(address),
      fetchPropertyListing(address, mlsEntry),
    ]);

  const zestimate    = zestimateResult.status    === 'fulfilled' ? zestimateResult.value    : null;
  const comps        = compsResult.status        === 'fulfilled' ? compsResult.value        : [];
  const publicRecord = publicRecordResult.status === 'fulfilled' ? publicRecordResult.value : null;
  const listing      = propertyResult.status     === 'fulfilled' ? propertyResult.value     : null;

  // Build property facts (merge listing + public record)
  const propertyFacts = buildPropertyFacts(listing, publicRecord);

  // Build AVM estimates
  const compAvm  = buildCompAvm(comps, propertyFacts);
  const marketStats = calculateMarketStats(comps);

  // Assemble valuation sources array
  const sources = buildValuationSources(zestimate, compAvm, publicRecord);

  // Calculate Ellis blended range
  const ellisRange = buildEllisRange(sources);

  return {
    address: {
      street,
      city,
      state,
      zip,
      county,
      formatted: `${street}, ${city}, ${state} ${zip}`,
    },
    propertyFacts,
    valuationSources: sources,
    ellisRange,
    comparableSales: {
      count: comps.length,
      marketStats,
      samples: comps.slice(0, 5).map(formatComp),
    },
    transactionHistory: [],    // Populated separately if requested
    mlsCoverage: mlsEntry
      ? { name: mlsEntry.name, platform: mlsEntry.platform, id: mlsEntry.id }
      : { name: 'Not determined', platform: null, id: null },
    generatedAt: new Date().toISOString(),
  };
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchZestimate(address) {
  if (process.env.ENABLE_ZESTIMATE !== 'true') return null;
  return bridge.getZestimate(address);
}

async function fetchComps(address, mlsEntry) {
  const { zip } = address;
  if (!zip) return [];

  if (!mlsEntry || mlsEntry.platform === PLATFORMS.BRIDGE) {
    return bridge.getComparableSales({ zip, daysBack: 180, limit: 25 });
  }
  return spark.getComparableSales({ zip, mlsId: mlsEntry.datasetKey, daysBack: 180, limit: 25 });
}

async function fetchPublicRecord(address) {
  if (process.env.ENABLE_BRIDGE !== 'true') return null;
  return bridge.getPublicRecord(address);
}

async function fetchPropertyListing(address, mlsEntry) {
  if (!mlsEntry) return null;

  if (mlsEntry.platform === PLATFORMS.BRIDGE) {
    const results = await bridge.searchByAddress(address, mlsEntry.datasetKey);
    return results?.[0] || null;
  }
  const results = await spark.searchByAddress(address, mlsEntry.datasetKey);
  return results?.[0] || null;
}

// ── AVM builder from comps ────────────────────────────────────────────────────

function buildCompAvm(comps, propertyFacts) {
  if (!comps.length) return null;

  const closedComps = comps.filter(c => c.ClosePrice && c.LivingArea || c.BuildingAreaTotal);

  if (!closedComps.length || !propertyFacts?.sqft) return null;

  // Calculate median price per sqft from comps
  const pricesPerSqft = closedComps
    .map(c => {
      const sqft = c.LivingArea || c.BuildingAreaTotal;
      const price = c.ClosePrice;
      return sqft > 0 ? price / sqft : null;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!pricesPerSqft.length) return null;

  const medianPpsf = median(pricesPerSqft);
  const estimatedValue = Math.round(medianPpsf * propertyFacts.sqft);

  // Confidence range: ±8% based on comp variance
  const variance = stdDev(pricesPerSqft) / medianPpsf;
  const confidenceRange = Math.min(Math.max(variance, 0.04), 0.12);

  return {
    source: 'Comparable Sales (MLS)',
    value: estimatedValue,
    lowValue: Math.round(estimatedValue * (1 - confidenceRange)),
    highValue: Math.round(estimatedValue * (1 + confidenceRange)),
    confidence: confidenceRange < 0.06 ? 'high' : confidenceRange < 0.09 ? 'medium' : 'low',
    methodology: `Median price/sqft of ${closedComps.length} closed sales × ${propertyFacts.sqft} sqft`,
    compsUsed: closedComps.length,
    medianPricePerSqft: Math.round(medianPpsf),
  };
}

// ── Valuation sources array ───────────────────────────────────────────────────

function buildValuationSources(zestimate, compAvm, publicRecord) {
  const sources = [];

  if (zestimate?.value) {
    sources.push({
      id: 'zillow',
      name: 'Zillow Zestimate®',
      value: zestimate.value,
      lowValue: zestimate.lowValue,
      highValue: zestimate.highValue,
      attribution: zestimate.attribution,
      displayOnly: true,                 // Zillow terms — never store
      accuracy: '94% on-market accuracy (Zillow 2025)',
      lastUpdated: zestimate.lastUpdated,
    });
  }

  if (compAvm?.value) {
    sources.push({
      id: 'comp_avm',
      name: 'Comparable Sales Model (MLS)',
      value: compAvm.value,
      lowValue: compAvm.lowValue,
      highValue: compAvm.highValue,
      attribution: null,
      displayOnly: false,
      accuracy: `Based on ${compAvm.compsUsed} closed sales · ${compAvm.confidence} confidence`,
      methodology: compAvm.methodology,
    });
  }

  if (publicRecord?.MarketValue) {
    sources.push({
      id: 'tax_assessment',
      name: 'County Tax Assessment',
      value: publicRecord.MarketValue,
      lowValue: Math.round(publicRecord.MarketValue * 0.9),
      highValue: Math.round(publicRecord.MarketValue * 1.15),
      attribution: null,
      displayOnly: false,
      accuracy: 'County assessor market value — typically lags 12–18 months behind market',
      taxYear: publicRecord.TaxYear,
    });
  }

  return sources;
}

// ── Ellis blended range ───────────────────────────────────────────────────────

function buildEllisRange(sources) {
  const values = sources.map(s => s.value).filter(Boolean);
  if (!values.length) return null;

  // Weight: comp AVM most, Zestimate second, tax assessment least
  const weights = { comp_avm: 0.5, zillow: 0.35, tax_assessment: 0.15 };
  let weightedSum = 0;
  let totalWeight = 0;

  for (const source of sources) {
    const w = weights[source.id] || 0.25;
    weightedSum += source.value * w;
    totalWeight += w;
  }

  const midpoint = Math.round(weightedSum / totalWeight);
  const allLows  = sources.map(s => s.lowValue).filter(Boolean);
  const allHighs = sources.map(s => s.highValue).filter(Boolean);

  const rangeLow  = allLows.length  ? Math.min(...allLows)  : Math.round(midpoint * 0.95);
  const rangeHigh = allHighs.length ? Math.max(...allHighs) : Math.round(midpoint * 1.05);

  const spread     = rangeHigh - rangeLow;
  const spreadPct  = Math.round((spread / midpoint) * 100);

  return {
    midpoint,
    low: rangeLow,
    high: rangeHigh,
    spread,
    spreadPercent: spreadPct,
    formattedLow:  formatCurrency(rangeLow),
    formattedHigh: formatCurrency(rangeHigh),
    formattedMid:  formatCurrency(midpoint),
    interpretation: interpretSpread(spreadPct),
    sourcesUsed: sources.length,
  };
}

// ── Property facts ────────────────────────────────────────────────────────────

function buildPropertyFacts(listing, publicRecord) {
  const l = listing || {};
  const p = publicRecord || {};

  return {
    beds:      l.BedroomsTotal || l.BedsTotal || p.Bedrooms || null,
    baths:     l.BathroomsTotalInteger || l.BathsTotal || p.Bathrooms || null,
    sqft:      l.LivingArea || l.BuildingAreaTotal || p.LivingArea || p.GrossArea || null,
    lotAcres:  l.LotSizeAcres || l.LotSizeArea || null,
    yearBuilt: l.YearBuilt || p.YearBuilt || null,
    parcel:    p.ParcelNumber || null,
    annualTax: p.AnnualTaxAmount || null,
    assessedValue: p.AssessedValue || null,
    ownerName: p.OwnerName1 || null,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatComp(comp) {
  return {
    address: comp.UnparsedAddress || comp.StreetName,
    city: comp.City,
    closePrice: comp.ClosePrice,
    listPrice: comp.ListPrice,
    closeDate: comp.CloseDate,
    daysOnMarket: comp.DaysOnMarket,
    beds: comp.BedroomsTotal || comp.BedsTotal,
    baths: comp.BathroomsTotalInteger || comp.BathsTotal,
    sqft: comp.LivingArea || comp.BuildingAreaTotal,
  };
}

function formatCurrency(n) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

function interpretSpread(spreadPct) {
  if (spreadPct <= 8)  return 'Tight spread — high data confidence in this market.';
  if (spreadPct <= 15) return 'Moderate spread — typical for this market. Price within the range for fastest sale.';
  return 'Wide spread — models disagree. Pricing strategy is especially important here. Ellis recommends an agent-assisted or AI-assisted listing.';
}

// ── Math utils ────────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export default { getValuationPanel };
