// ─────────────────────────────────────────────────────────────────────────────
// Spark API Client
// Handles all requests to sparkapi.com/v1/
// Covers: Daytona, Beaches, Naples, Tallahassee, Space Coast, Vero Beach,
//         Pensacola, Florida Keys, NEFMLS, New Smyrna, Navica Flagler,
//         Miami MLS, Royal Palm Coast
//
// Auth: Non-expiring Bearer token (SPARK_ACCESS_TOKEN)
// Base: https://sparkapi.com/v1/
// Rate limited — HTTP 429 returned when exceeded
// ─────────────────────────────────────────────────────────────────────────────

import fetch from 'node-fetch';

const SPARK_BASE = 'https://sparkapi.com/v1';
const TOKEN      = process.env.SPARK_ACCESS_TOKEN;

if (!TOKEN) {
  console.warn('[Spark] WARNING: SPARK_ACCESS_TOKEN not set — Spark calls will fail');
}

// Simple in-memory rate limit tracker
const rateLimitState = { retryAfter: 0 };

// ── Core request helper ───────────────────────────────────────────────────────

async function sparkGet(path, params = {}) {
  // Respect rate limit
  if (Date.now() < rateLimitState.retryAfter) {
    const wait = rateLimitState.retryAfter - Date.now();
    await new Promise(r => setTimeout(r, wait));
  }

  const url = new URL(`${SPARK_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/json',
      'X-SparkApi-User-Agent': 'Ellis/0.1',
    },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
    rateLimitState.retryAfter = Date.now() + retryAfter * 1000;
    throw new Error(`[Spark] Rate limited — retry after ${retryAfter}s`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spark API ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return json?.D || json;   // Spark wraps responses in { D: { ... } }
}

// ── Property search ───────────────────────────────────────────────────────────

/**
 * Search for a property by address across a specific Spark MLS.
 * mlsId corresponds to the datasetKey in the MLS registry.
 */
export async function searchByAddress({ street, city, state = 'FL', zip }, mlsId) {
  const filters = [
    `UnparsedAddress Eq '${street.replace(/'/g, "\\'")}'`,
    city ? `City Eq '${city}'` : null,
    zip  ? `PostalCode Eq '${zip}'` : null,
    mlsId ? `MlsId Eq '${mlsId}'` : null,
  ].filter(Boolean).join(' And ');

  const data = await sparkGet('/listings', {
    '_filter': filters,
    '_limit': 5,
    '_select': PROPERTY_FIELDS.join(','),
    '_expand': 'Photos',
  });

  return data?.Results || [];
}

/**
 * Fetch a single listing by its Spark ListingId
 */
export async function getByListingId(listingId) {
  const data = await sparkGet(`/listings/${listingId}`, {
    '_select': PROPERTY_FIELDS.join(','),
  });
  return data?.Results?.[0] || null;
}

// ── Comparable sales ──────────────────────────────────────────────────────────

/**
 * Pull recent sold listings for CMA.
 * Spark uses OData-style _filter with its own field names.
 */
export async function getComparableSales({
  zip,
  mlsId,
  propertyType = 'A',      // Spark: 'A' = Residential
  bedsMin,
  bedsMax,
  sqftMin,
  sqftMax,
  daysBack = 180,
  limit = 20,
} = {}) {
  const cutoff = new Date(Date.now() - daysBack * 86400000)
    .toISOString()
    .split('T')[0];

  const filters = [
    `PostalCode Eq '${zip}'`,
    `MlsStatus Eq 'Closed'`,
    `CloseDate Ge ${cutoff}`,
    mlsId      ? `MlsId Eq '${mlsId}'` : null,
    bedsMin    ? `BedsTotal Ge ${bedsMin}` : null,
    bedsMax    ? `BedsTotal Le ${bedsMax}` : null,
    sqftMin    ? `BuildingAreaTotal Ge ${sqftMin}` : null,
    sqftMax    ? `BuildingAreaTotal Le ${sqftMax}` : null,
  ].filter(Boolean).join(' And ');

  const data = await sparkGet('/listings', {
    '_filter': filters,
    '_limit': limit,
    '_orderby': 'CloseDate Desc',
    '_select': COMP_FIELDS.join(','),
  });

  return data?.Results || [];
}

// ── Active listings near address ──────────────────────────────────────────────

/**
 * Get active listings in a zip code (for market activity context)
 */
export async function getActiveListings({ zip, mlsId, limit = 10 } = {}) {
  const filters = [
    `PostalCode Eq '${zip}'`,
    `MlsStatus Eq 'Active'`,
    mlsId ? `MlsId Eq '${mlsId}'` : null,
  ].filter(Boolean).join(' And ');

  const data = await sparkGet('/listings', {
    '_filter': filters,
    '_limit': limit,
    '_orderby': 'ListingDate Desc',
    '_select': ACTIVE_FIELDS.join(','),
  });

  return data?.Results || [];
}

// ── Market stats ──────────────────────────────────────────────────────────────

/**
 * Calculate basic market stats from a batch of comps.
 * Returns median price, avg DOM, list-to-sale ratio.
 * Used to populate the Ellis advisor with local market context.
 */
export function calculateMarketStats(comps) {
  if (!comps.length) return null;

  const prices = comps
    .map(c => c.ClosePrice || c.ListPrice)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const doms = comps.map(c => c.DaysOnMarket).filter(v => v != null);
  const ratios = comps
    .filter(c => c.ClosePrice && c.ListPrice)
    .map(c => c.ClosePrice / c.ListPrice);

  const median = arr => {
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2
      ? arr[mid]
      : (arr[mid - 1] + arr[mid]) / 2;
  };

  const avg = arr => arr.length
    ? arr.reduce((s, v) => s + v, 0) / arr.length
    : null;

  return {
    sampleSize: comps.length,
    medianClosePrice: Math.round(median(prices)),
    avgDaysOnMarket: Math.round(avg(doms)),
    avgListToSaleRatio: ratios.length
      ? Math.round(avg(ratios) * 1000) / 1000
      : null,
    pricePerSqft: null,  // Calculated downstream when sqft is available
  };
}

// ── Field lists ───────────────────────────────────────────────────────────────

const PROPERTY_FIELDS = [
  'ListingId', 'ListingKey', 'MlsId', 'MlsStatus',
  'UnparsedAddress', 'StreetNumber', 'StreetName', 'City', 'StateOrProvince', 'PostalCode',
  'ListPrice', 'ClosePrice', 'CloseDate', 'DaysOnMarket',
  'BedsTotal', 'BathsTotal', 'BuildingAreaTotal', 'LotSizeArea',
  'PropertyType', 'PropertySubType', 'YearBuilt',
  'ListAgentName', 'ListOfficeName',
  'PublicRemarks',
  'Latitude', 'Longitude',
  'ModificationTimestamp', 'ListingDate',
];

const COMP_FIELDS = [
  'ListingId', 'UnparsedAddress', 'City', 'PostalCode', 'MlsId',
  'ListPrice', 'ClosePrice', 'CloseDate', 'DaysOnMarket',
  'BedsTotal', 'BathsTotal', 'BuildingAreaTotal', 'YearBuilt',
  'Latitude', 'Longitude',
];

const ACTIVE_FIELDS = [
  'ListingId', 'UnparsedAddress', 'City', 'PostalCode',
  'ListPrice', 'DaysOnMarket', 'BedsTotal', 'BathsTotal',
  'BuildingAreaTotal', 'MlsStatus', 'ListingDate',
];

export default {
  searchByAddress,
  getByListingId,
  getComparableSales,
  getActiveListings,
  calculateMarketStats,
};
