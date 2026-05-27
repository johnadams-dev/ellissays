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
    coverage: 'Central Florida — Orlando metro, Tampa Bay, and surrounding regions',
    counties: [
      'Orange', 'Osceola', 'Seminole', 'Lake', 'Polk', 'Volusia',
      'Brevard', 'Hillsborough', 'Pinellas', 'Pasco', 'Hernando',
      'Citrus', 'Marion', 'Sumter', 'Alachua',
    ],
  },

  // ── Spark platform ──────────────────────────────────────────────────────
  {
    id: 'daytona',
    platform: PLATFORMS.SPARK,
    datasetKey: 'DMAR',
    name: 'Daytona Beach Area Association of Realtors MLS',
    coverage: 'Daytona Beach and Volusia County',
    counties: ['Volusia', 'Flagler'],
  },
  {
    id: 'beaches',
    platform: PLATFORMS.SPARK,
    datasetKey: 'BMLS',
    name: 'Beaches MLS',
    coverage: 'Palm Beach, Broward, and Martin counties',
    counties: ['Palm Beach', 'Broward', 'Martin'],
  },
  {
    id: 'naples',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NABOR',
    name: 'Naples Area Board of Realtors MLS',
    coverage: 'Collier County and Naples area',
    counties: ['Collier'],
  },
  {
    id: 'tallahassee',
    platform: PLATFORMS.SPARK,
    datasetKey: 'TALR',
    name: 'Tallahassee Board of Realtors MLS',
    coverage: 'Tallahassee and Leon County',
    counties: ['Leon', 'Jefferson', 'Wakulla', 'Gadsden'],
  },
  {
    id: 'spacecoast',
    platform: PLATFORMS.SPARK,
    datasetKey: 'SCBR',
    name: 'Space Coast Association of Realtors MLS',
    coverage: 'Brevard County and Space Coast',
    counties: ['Brevard'],
  },
  {
    id: 'verobeach',
    platform: PLATFORMS.SPARK,
    datasetKey: 'TCBR',
    name: 'Treasure Coast Board of Realtors (Vero Beach) MLS',
    coverage: 'Indian River, St. Lucie, Okeechobee counties',
    counties: ['Indian River', 'St. Lucie', 'Okeechobee'],
  },
  {
    id: 'pensacola',
    platform: PLATFORMS.SPARK,
    datasetKey: 'PPAR',
    name: 'Pensacola Association of Realtors MLS',
    coverage: 'Escambia, Santa Rosa, and Okaloosa counties',
    counties: ['Escambia', 'Santa Rosa', 'Okaloosa', 'Walton'],
  },
  {
    id: 'royalpalmcoast',
    platform: PLATFORMS.SPARK,
    datasetKey: 'RPCA',
    name: 'Royal Palm Coast Realtor Association (SW Florida)',
    coverage: 'Lee and Charlotte counties (Fort Myers, Cape Coral)',
    counties: ['Lee', 'Charlotte'],
  },
  {
    id: 'floridakeys',
    platform: PLATFORMS.SPARK,
    datasetKey: 'FKMLS',
    name: 'Florida Keys MLS',
    coverage: 'Monroe County and Florida Keys',
    counties: ['Monroe'],
  },
  {
    id: 'jacksonville',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NEFMLS',
    name: 'Northeast Florida MLS (Jacksonville)',
    coverage: 'Duval, St. Johns, Nassau, Clay, Putnam counties',
    counties: ['Duval', 'St. Johns', 'Nassau', 'Clay', 'Putnam', 'Baker'],
  },
  {
    id: 'newsmyrna',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NSBAR',
    name: 'New Smyrna Beach Board of Realtors MLS',
    coverage: 'New Smyrna Beach and southern Volusia County',
    counties: ['Volusia'],
  },
  {
    id: 'flagler',
    platform: PLATFORMS.SPARK,
    datasetKey: 'NAVICA',
    name: 'Navica Flagler MLS',
    coverage: 'Flagler County (Palm Coast area)',
    counties: ['Flagler'],
  },
  {
    id: 'miami',
    platform: PLATFORMS.SPARK,
    datasetKey: 'MIAMI',
    name: 'Miami Association of Realtors MLS (MIAMI MLS)',
    coverage: 'Miami-Dade, Broward, and Monroe counties',
    counties: ['Miami-Dade', 'Broward', 'Monroe'],
  },
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
