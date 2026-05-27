// ─────────────────────────────────────────────────────────────────────────────
// Bridge API Client
// Handles all requests to api.bridgedataoutput.com
// Covers: Stellar MLS, Zillow Zestimate v2, Public Records, Tax Assessments
//
// Auth: Bearer token in Authorization header
// Base: https://api.bridgedataoutput.com/api/v2/
// ─────────────────────────────────────────────────────────────────────────────

import fetch from 'node-fetch';

const BRIDGE_BASE    = 'https://api.bridgedataoutput.com/api/v2';
const ZESTIMATE_BASE = `${BRIDGE_BASE}/zestimates_v2/zestimate`;
const TOKEN          = process.env.BRIDGE_ACCESS_TOKEN;
const DATASET        = process.env.BRIDGE_DATA_SYSTEM_KEY || 'stellar';

if (!TOKEN) {
  console.warn('[Bridge] WARNING: BRIDGE_ACCESS_TOKEN not set — Bridge calls will fail');
}

// ── Core request helper ───────────────────────────────────────────────────────

async function bridgeGet(path, params = {}) {
  const url = new URL(`${BRIDGE_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bridge API ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Zestimate ─────────────────────────────────────────────────────────────────

/**
 * Fetch Zillow Zestimate for an address via Bridge.
 * Returns the Zestimate value, rental Zestimate, high/low range,
 * and 30-day historical value.
 *
 * Zillow terms: display only, attribution required, no local storage.
 */
export async function getZestimate({ street, city, state = 'FL', zip }) {
  const params = {
    address: street,
    citystatezip: `${city} ${state} ${zip}`,
  };

  const data = await bridgeGet('zestimates_v2/zestimate', params);
  const z = data?.bundle?.[0];

  if (!z) return null;

  return {
    source: 'Zillow Zestimate',
    attribution: 'Zestimate® provided by Zillow. For informational purposes only.',
    value: z.zestimate,
    lowValue: z.zestimate
      ? Math.round(z.zestimate * (1 - (z.valuationRangeLow || 0.05)))
      : null,
    highValue: z.zestimate
      ? Math.round(z.zestimate * (1 + (z.valuationRangeHigh || 0.05)))
      : null,
    rentalEstimate: z.rentzestimate || null,
    lastUpdated: z.lastUpdatedDate || null,
    priorMonth: z.minus30 || null,         // 30-day historical value
    zpid: z.zpid || null,
    displayOnly: true,                     // Zillow terms: never store this value
  };
}

// ── Property search (Stellar MLS via Bridge) ──────────────────────────────────

/**
 * Search for a property by address in the Stellar MLS dataset.
 * Returns the matching listing(s) with full RESO fields.
 */
export async function searchByAddress({ street, city, state = 'FL', zip }, dataset = DATASET) {
  // RESO Web API OData filter syntax
  const filter = [
    `contains(UnparsedAddress, '${street.replace(/'/g, "''")}')`,
    city   ? `City eq '${city}'` : null,
    zip    ? `PostalCode eq '${zip}'` : null,
  ].filter(Boolean).join(' and ');

  const data = await bridgeGet(`OData/${dataset}/Property`, {
    '$filter': filter,
    '$top': 5,
    '$select': PROPERTY_FIELDS.join(','),
    '$expand': 'Media',
  });

  return data?.value || [];
}

/**
 * Fetch a single property by MLS number
 */
export async function getByListingId(listingId, dataset = DATASET) {
  const data = await bridgeGet(`OData/${dataset}/Property`, {
    '$filter': `ListingId eq '${listingId}'`,
    '$top': 1,
    '$select': PROPERTY_FIELDS.join(','),
    '$expand': 'Media',
  });
  return data?.value?.[0] || null;
}

// ── Comparable sales ──────────────────────────────────────────────────────────

/**
 * Pull recent closed sales near a location for CMA purposes.
 * Returns sold listings within approximate radius, filtered by property type.
 *
 * Note: Bridge/RESO doesn't support geo-radius natively — we filter by
 * PostalCode and nearby zip codes as a practical approximation.
 */
export async function getComparableSales({
  zip,
  propertyType = 'Residential',
  bedsMin,
  bedsMax,
  sqftMin,
  sqftMax,
  daysBack = 180,
  limit = 20,
  dataset = DATASET,
} = {}) {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const filters = [
    `PostalCode eq '${zip}'`,
    `StandardStatus eq 'Closed'`,
    `CloseDate gt ${cutoff}`,
    propertyType ? `PropertyType eq '${propertyType}'` : null,
    bedsMin ? `BedroomsTotal ge ${bedsMin}` : null,
    bedsMax ? `BedroomsTotal le ${bedsMax}` : null,
    sqftMin ? `LivingArea ge ${sqftMin}` : null,
    sqftMax ? `LivingArea le ${sqftMax}` : null,
  ].filter(Boolean).join(' and ');

  const data = await bridgeGet(`OData/${dataset}/Property`, {
    '$filter': filters,
    '$top': limit,
    '$orderby': 'CloseDate desc',
    '$select': COMP_FIELDS.join(','),
  });

  return data?.value || [];
}

// ── Public records / tax assessments ─────────────────────────────────────────

/**
 * Fetch public records for a property (ownership, tax assessment, lot data).
 * Uses Bridge's public records dataset — separate from MLS listing data.
 */
export async function getPublicRecord({ street, city, state = 'FL', zip }) {
  // Bridge public records use the Assessments resource
  const filter = [
    `contains(SitusAddress, '${street.replace(/'/g, "''")}')`,
    zip ? `SitusPostalCode eq '${zip}'` : null,
  ].filter(Boolean).join(' and ');

  const data = await bridgeGet('OData/pub/Assessments', {
    '$filter': filter,
    '$top': 3,
    '$select': PUBLIC_RECORD_FIELDS.join(','),
  });

  return data?.value?.[0] || null;
}

/**
 * Fetch transaction history for a property (all recorded sales).
 * Useful for understanding FSBO vs. agent-listed history and price trends.
 */
export async function getTransactionHistory({ street, zip }) {
  const filter = [
    `contains(SitusAddress, '${street.replace(/'/g, "''")}')`,
    zip ? `SitusPostalCode eq '${zip}'` : null,
  ].filter(Boolean).join(' and ');

  const data = await bridgeGet('OData/pub/Transactions', {
    '$filter': filter,
    '$top': 10,
    '$orderby': 'RecordingDate desc',
    '$select': TRANSACTION_FIELDS.join(','),
  });

  return data?.value || [];
}

// ── Field lists ───────────────────────────────────────────────────────────────
// Select only what Ellis needs to avoid oversized payloads

const PROPERTY_FIELDS = [
  'ListingId', 'ListingKey', 'MlsStatus', 'StandardStatus',
  'UnparsedAddress', 'StreetNumber', 'StreetName', 'City', 'StateOrProvince', 'PostalCode',
  'ListPrice', 'ClosePrice', 'CloseDate', 'DaysOnMarket',
  'BedroomsTotal', 'BathroomsTotalInteger', 'LivingArea', 'LotSizeAcres',
  'PropertyType', 'PropertySubType', 'YearBuilt',
  'ListAgentFullName', 'ListOfficeName',
  'PublicRemarks', 'PrivateRemarks',
  'Latitude', 'Longitude',
  'ModificationTimestamp', 'ListingContractDate',
];

const COMP_FIELDS = [
  'ListingId', 'UnparsedAddress', 'City', 'PostalCode',
  'ListPrice', 'ClosePrice', 'CloseDate', 'DaysOnMarket',
  'BedroomsTotal', 'BathroomsTotalInteger', 'LivingArea', 'YearBuilt',
  'PropertyType', 'Latitude', 'Longitude',
];

const PUBLIC_RECORD_FIELDS = [
  'SitusAddress', 'SitusCity', 'SitusPostalCode',
  'AssessedValue', 'MarketValue', 'LandValue', 'ImprovementValue',
  'TaxYear', 'AnnualTaxAmount',
  'LotSizeAcres', 'LotSizeSquareFeet',
  'LegalDescription', 'ParcelNumber',
  'OwnerName1', 'OwnerName2',
  'YearBuilt', 'GrossArea', 'LivingArea',
  'Bedrooms', 'Bathrooms',
  'PropertyUseCode',
];

const TRANSACTION_FIELDS = [
  'SitusAddress', 'SitusPostalCode',
  'RecordingDate', 'SalePrice',
  'DocumentType',               // Deed type — indicates FSBO vs. MLS-assisted
  'BuyerName', 'SellerName',
  'LoanAmount', 'LoanType',
  'TransferTax',
];

export default {
  getZestimate,
  searchByAddress,
  getByListingId,
  getComparableSales,
  getPublicRecord,
  getTransactionHistory,
};
