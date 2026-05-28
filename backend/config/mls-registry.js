// ─────────────────────────────────────────────────────────────────────────────
// Ellis MLS Registry
// Maps every Florida MLS to its platform (Bridge or Spark) and dataset key.
// Used by the data layer to route property lookups to the right API.
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORMS = {
  BRIDGE: 'bridge',
  SPARK:  'spark',
};

// Each entry:
//   platform   — which API handles this MLS
//   datasetKey — Bridge dataset_id OR Spark MlsId
//   name       — human-readable name
//   coverage   — geographic description (for routing by address)
//   counties   — Florida counties served (used for geo-routing)

export const MLS_REGISTRY = [
  // ── Bridge platform ─────────────────────────────────────────────────────
  {
    id: 'stellar',
    platform: PLATFORMS.BRIDGE,
    datasetKey: process.env.BRIDGE_DATA_SYSTEM_KEY || 'stellar',
    name: 'Stellar MLS',
    coverage: 'Central and West Florida — Orlando, Tampa Bay, Space Coast corridor, and SW Florida',
    counties: [
      // Central
      'Orange', 'Osceola', 'Seminole', 'Lake', 'Polk', 'Sumter',
      // North/Central
      'Alachua', 'Marion', 'Citrus', 'Hernando',
      // East Coast
      'Volusia', 'Flagler',
      // Tampa Bay / West
      'Hillsborough', 'Pinellas', 'Pasco',
      // SW Florida
      'Sarasota', 'Manatee', 'Charlotte', 'Lee',
      // Interior
      'Highlands', 'Okeechobee',
    ],
  },
  {
    id: 'miami',
    platform: PLATFORMS.BRIDGE,
    datasetKey: 'miamire',
    name: 'Miami Association of Realtors MLS (incl. Beaches MLS)',
    coverage: 'South Florida — Miami-Dade, Broward, Palm Beach, and Monroe counties',
    counties: ['Miami-Dade', 'Broward', 'Palm Beach', 'Monroe'],
  },

  // ── Spark platform ──────────────────────────────────────────────────────
  {
    id: 'daytona',
    platform: PLATFORMS.SPARK,
    datasetKey: 'DBAR',
    name: 'Daytona Beach Area Realtors MLS',
    coverage: 'Volusia County (Daytona Beach area) — also covered by Stellar',
    counties: ['Volusia'],
  },
  {
    id: 'spacecoast',
    platform: PLATFORMS.SPARK,
    datasetKey: 'SCBR',
    name: 'Space Coast Association of Realtors MLS',
    coverage: 'Brevard County',
    counties: ['Brevard'],
  },
  {
    id: 'verobeach',
    platform: PLATFORMS.SPARK,
    datasetKey: 'TCBR',
    name: 'Treasure Coast Board of Realtors MLS',
    coverage: 'Indian River and St. Lucie counties',
    counties: ['Indian River', 'St. Lucie'],
  },
  {
    id: 'naples',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NABOR',
    name: 'Naples Area Board of Realtors MLS',
    coverage: 'Collier County',
    counties: ['Collier'],
  },
  {
    id: 'jacksonville',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NEFMLS',
    name: 'Northeast Florida MLS (Jacksonville)',
    coverage: 'NE Florida — Duval, St. Johns, Nassau, Clay, Putnam, Baker, Union, Bradford, Columbia',
    counties: ['Duval', 'St. Johns', 'Nassau', 'Clay', 'Putnam', 'Baker', 'Union', 'Bradford', 'Columbia'],
  },
  {
    id: 'pensacola',
    platform: PLATFORMS.SPARK,
    datasetKey: 'PPAR',
    name: 'Pensacola Association of Realtors MLS',
    coverage: 'NW Florida Panhandle — Escambia, Santa Rosa, Okaloosa, Walton counties',
    counties: ['Escambia', 'Santa Rosa', 'Okaloosa', 'Walton'],
  },
  {
    id: 'floridakeys',
    platform: PLATFORMS.SPARK,
    datasetKey: 'FKMLS',
    name: 'Florida Keys MLS',
    coverage: 'Monroe County — also covered by Miami (miamire)',
    counties: ['Monroe'],
  },

  // ── Paragon (Black Knight) — no client yet ───────────────────────────────
  // Tallahassee Board of Realtors: Leon, Jefferson, Wakulla, Gadsden
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Find which MLS(es) serve a given Florida county.
 * Returns array — some counties have multiple MLS coverage.
 */
export function getMlsByCounty(county) {
  const normalized = county.trim().toLowerCase();
  return MLS_REGISTRY.filter(mls =>
    mls.counties.some(c => c.toLowerCase() === normalized)
  );
}

/**
 * Get the primary MLS for a county — prefers Bridge (Stellar) when available
 * since it also provides Zestimate and public records in the same call.
 */
export function getPrimaryMlsByCounty(county) {
  const matches = getMlsByCounty(county);
  if (!matches.length) return null;
  const bridgeMatch = matches.find(m => m.platform === PLATFORMS.BRIDGE);
  return bridgeMatch || matches[0];
}

/**
 * Get all Bridge-platform MLSs
 */
export function getBridgeMls() {
  return MLS_REGISTRY.filter(m => m.platform === PLATFORMS.BRIDGE);
}

/**
 * Get all Spark-platform MLSs
 */
export function getSparkMls() {
  return MLS_REGISTRY.filter(m => m.platform === PLATFORMS.SPARK);
}

export default MLS_REGISTRY;
