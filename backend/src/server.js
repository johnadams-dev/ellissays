// ─────────────────────────────────────────────────────────────────────────────
// Ellis Backend API Server
// Express REST API consumed by the Ellis frontend
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import valuation from './services/valuation-service.js';
import advisor   from './services/advisor-service.js';
import bridge    from './api/bridge-client.js';
import { getMlsByCounty, MLS_REGISTRY } from '../config/mls-registry.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Simple request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Ellis API',
    version: '0.1.0',
    mlsCoverage: MLS_REGISTRY.length + ' Florida MLSs',
    timestamp: new Date().toISOString(),
    env: {
      bridge:   !!process.env.BRIDGE_ACCESS_TOKEN,
      spark:    !!process.env.SPARK_ACCESS_TOKEN,
      ai:       !!process.env.ANTHROPIC_API_KEY,
      twilio:   !!process.env.TWILIO_ACCOUNT_SID,
      email:    !!process.env.GMAIL_USER,
    },
  });
});

// ── MLS coverage ──────────────────────────────────────────────────────────────

/**
 * GET /api/mls
 * Returns all MLS systems Ellis covers in Florida
 */
app.get('/api/mls', (_req, res) => {
  res.json({
    count: MLS_REGISTRY.length,
    systems: MLS_REGISTRY.map(m => ({
      id: m.id,
      name: m.name,
      platform: m.platform,
      coverage: m.coverage,
      counties: m.counties,
    })),
  });
});

/**
 * GET /api/mls/county/:county
 * Which MLS(es) cover a given Florida county?
 */
app.get('/api/mls/county/:county', (req, res) => {
  const matches = getMlsByCounty(req.params.county);
  if (!matches.length) {
    return res.status(404).json({ error: `No MLS coverage found for county: ${req.params.county}` });
  }
  res.json({ county: req.params.county, systems: matches });
});

// ── Property lookup ───────────────────────────────────────────────────────────

/**
 * GET /api/property?street=&city=&county=&zip=
 * Find a property in the MLS and return its basic facts
 */
app.get('/api/property', async (req, res) => {
  try {
    const { street, city, county, state = 'FL', zip } = req.query;
    if (!street || !zip) {
      return res.status(400).json({ error: 'street and zip are required' });
    }

    const address = { street, city, county, state, zip };
    const panel = await valuation.getValuationPanel(address);
    res.json({ success: true, data: panel });
  } catch (err) {
    console.error('[/api/property]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Valuation panel ───────────────────────────────────────────────────────────

/**
 * POST /api/valuation
 * Generate the full multi-AVM valuation panel for an address
 * Body: { street, city, county, state, zip }
 */
app.post('/api/valuation', async (req, res) => {
  try {
    const { street, city, county, state = 'FL', zip } = req.body;
    if (!street || !zip) {
      return res.status(400).json({ error: 'street and zip are required' });
    }

    const panel = await valuation.getValuationPanel({ street, city, county, state, zip });
    res.json({ success: true, data: panel });
  } catch (err) {
    console.error('[/api/valuation]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Zestimate (display only) ──────────────────────────────────────────────────

/**
 * GET /api/zestimate?street=&city=&zip=
 * Returns Zillow Zestimate for display purposes only (not stored)
 */
app.get('/api/zestimate', async (req, res) => {
  try {
    const { street, city, zip } = req.query;
    if (!street || !zip) {
      return res.status(400).json({ error: 'street and zip are required' });
    }

    const z = await bridge.getZestimate({ street, city, zip });
    if (!z) return res.status(404).json({ error: 'Zestimate not available for this address' });

    res.json({
      success: true,
      data: z,
      disclaimer: 'Zestimate® is provided by Zillow for informational purposes only and may not be stored.',
    });
  } catch (err) {
    console.error('[/api/zestimate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Comparable sales ──────────────────────────────────────────────────────────

/**
 * GET /api/comps?zip=&beds=&baths=&sqft=&days=
 * Pull recent closed sales for CMA
 */
app.get('/api/comps', async (req, res) => {
  try {
    const { zip, beds, sqftMin, sqftMax, days = 180, limit = 20 } = req.query;
    if (!zip) return res.status(400).json({ error: 'zip is required' });

    const comps = await bridge.getComparableSales({
      zip,
      bedsMin: beds ? parseInt(beds) - 1 : undefined,
      bedsMax: beds ? parseInt(beds) + 1 : undefined,
      sqftMin: sqftMin ? parseInt(sqftMin) : undefined,
      sqftMax: sqftMax ? parseInt(sqftMax) : undefined,
      daysBack: parseInt(days),
      limit: parseInt(limit),
    });

    res.json({ success: true, count: comps.length, data: comps });
  } catch (err) {
    console.error('[/api/comps]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Transaction history ───────────────────────────────────────────────────────

/**
 * GET /api/history?street=&zip=
 * All recorded transactions for a property (sale history)
 */
app.get('/api/history', async (req, res) => {
  try {
    const { street, zip } = req.query;
    if (!street || !zip) return res.status(400).json({ error: 'street and zip are required' });

    const history = await bridge.getTransactionHistory({ street, zip });
    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    console.error('[/api/history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Path Recommendation ────────────────────────────────────────────────────

/**
 * POST /api/recommend
 * Generate Ellis's path recommendation from trade-off sliders + valuation
 * Body: { tradeoffs: { speedVsPrice, effortVsSavings, certaintyVsRisk, timingVsExposure },
 *         address: { street, city, county, zip },
 *         context: { propertyType, condition, techComfort } }
 */
app.post('/api/recommend', async (req, res) => {
  try {
    const { tradeoffs, address, context, valuationData } = req.body;

    if (!tradeoffs) {
      return res.status(400).json({ error: 'tradeoffs object is required' });
    }

    // If valuation data not passed, fetch it
    let vData = valuationData;
    if (!vData && address?.zip) {
      vData = await valuation.getValuationPanel(address);
    }

    const recommendation = await advisor.getPathRecommendation(tradeoffs, vData, context || {});
    res.json({ success: true, data: recommendation });
  } catch (err) {
    console.error('[/api/recommend]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Listing description generator ─────────────────────────────────────────────

/**
 * POST /api/listing/description
 * Generate AI listing description
 * Body: { propertyFacts, sellerInputs: { highlights, recentUpdates, neighborhood } }
 */
app.post('/api/listing/description', async (req, res) => {
  try {
    const { propertyFacts, sellerInputs } = req.body;
    const description = await advisor.generateListingDescription(propertyFacts, sellerInputs);
    res.json({ success: true, data: { description } });
  } catch (err) {
    console.error('[/api/listing/description]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Stale listing alert ───────────────────────────────────────────────────────

/**
 * POST /api/listing/stale-alert
 * Generate a stale listing analysis and action plan
 * Body: { listingData, marketStats, daysMilestone }
 */
app.post('/api/listing/stale-alert', async (req, res) => {
  try {
    const { listingData, marketStats, daysMilestone } = req.body;
    if (!listingData || !daysMilestone) {
      return res.status(400).json({ error: 'listingData and daysMilestone are required' });
    }

    const alert = await advisor.generateStaleListingAlert(listingData, marketStats, daysMilestone);
    res.json({ success: true, data: alert });
  } catch (err) {
    console.error('[/api/listing/stale-alert]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Offer analysis ────────────────────────────────────────────────────────────

/**
 * POST /api/offer/analyze
 * Body: { offer: { offerPrice, contingencies, closingDate, earnestMoney, financing },
 *         listPrice, marketStats }
 */
app.post('/api/offer/analyze', async (req, res) => {
  try {
    const { offer, listPrice, marketStats } = req.body;
    if (!offer?.offerPrice || !listPrice) {
      return res.status(400).json({ error: 'offer.offerPrice and listPrice are required' });
    }

    const analysis = await advisor.analyzeOffer(offer, listPrice, marketStats);
    res.json({ success: true, data: analysis });
  } catch (err) {
    console.error('[/api/offer/analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Waitlist / email capture ──────────────────────────────────────────────────

/**
 * POST /api/waitlist
 * Capture a waitlist signup (stored to file until ESP is wired up)
 * Body: { name, email, type, market }
 */
app.post('/api/waitlist', async (req, res) => {
  try {
    const { name, email, type, market } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const entry = {
      timestamp: new Date().toISOString(),
      name: name || '',
      email,
      type: type || 'homeowner',
      market: market || '',
      source: req.headers.referer || 'direct',
    };

    // Log the entry — replace with ESP webhook or DB write when ready
    console.log('[WAITLIST]', JSON.stringify(entry));

    // TODO: Send confirmation email via Gmail / wire to Mailchimp / ConvertKit

    res.json({ success: true, message: 'Added to waitlist' });
  } catch (err) {
    console.error('[/api/waitlist]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏠 Ellis API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   MLS coverage: http://localhost:${PORT}/api/mls`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
