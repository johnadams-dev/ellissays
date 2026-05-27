# Ellis Backend API

> AI-powered home selling platform — backend service

## Stack

- **Runtime**: Node.js 18+ (ESM modules)
- **Framework**: Express
- **AI**: Anthropic Claude (advisor, listing descriptions, offer analysis)
- **MLS Data**: Bridge Interactive (Stellar/Cotality + Zillow) + Spark API (14 Florida MLSs)
- **Notifications**: Twilio (SMS) + Gmail (email)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and add your credentials

# 3. Start the server
npm run dev          # Development (auto-restarts on changes)
npm start            # Production
```

---

## MLS Coverage (Florida)

| MLS | Platform | Key Counties |
|-----|----------|-------------|
| Stellar MLS | Bridge | Orange, Osceola, Seminole, Lake, Polk, Hillsborough, Pinellas, and more |
| Daytona (DMAR) | Spark | Volusia, Flagler |
| Beaches MLS (BMLS) | Spark | Palm Beach, Broward, Martin |
| Naples (NABOR) | Spark | Collier |
| Tallahassee (TALR) | Spark | Leon and surrounding |
| Space Coast (SCBR) | Spark | Brevard |
| Vero Beach (TCBR) | Spark | Indian River, St. Lucie |
| Pensacola (PPAR) | Spark | Escambia, Santa Rosa, Okaloosa |
| Royal Palm Coast (RPCA) | Spark | Lee, Charlotte |
| Florida Keys (FKMLS) | Spark | Monroe |
| NEFMLS / Jacksonville | Spark | Duval, St. Johns, Nassau, Clay |
| New Smyrna (NSBAR) | Spark | Volusia (southern) |
| Navica Flagler | Spark | Flagler |
| Miami MLS | Spark | Miami-Dade, Broward, Monroe |

---

## API Reference

### Health
```
GET /health
```
Returns service status and which credentials are configured.

---

### MLS Registry
```
GET /api/mls
GET /api/mls/county/:county
```

---

### Property Lookup
```
GET /api/property?street=123+Main+St&city=Orlando&county=Orange&zip=32801
```
Returns property facts + full valuation panel.

---

### Valuation Panel
```
POST /api/valuation
Body: { "street": "123 Main St", "city": "Orlando", "county": "Orange", "zip": "32801" }
```
Returns the Ellis multi-AVM panel (Zestimate + MLS comps + tax assessment + Ellis range).

**Zillow display rule**: The Zestimate in the response is marked `displayOnly: true` and must never be stored to a database per Zillow's API terms.

---

### Comparable Sales
```
GET /api/comps?zip=32801&beds=3&sqftMin=1500&sqftMax=2500&days=180
```

---

### Transaction History
```
GET /api/history?street=123+Main+St&zip=32801
```
All recorded sales for a property — useful for FSBO vs. agent history.

---

### AI Path Recommendation
```
POST /api/recommend
Body: {
  "tradeoffs": {
    "speedVsPrice": 60,        // 0=quick sale, 100=highest price
    "effortVsSavings": 40,     // 0=hands-off, 100=do the work
    "certaintyVsRisk": 30,     // 0=guaranteed, 100=tolerate risk
    "timingVsExposure": 70     // 0=30-day urgency, 100=90+ days
  },
  "address": { "street": "...", "city": "...", "county": "...", "zip": "..." },
  "context": { "propertyType": "Residential", "condition": "Good" }
}
```
Returns ranked path recommendations with net proceeds estimates and Ellis commentary.

---

### Listing Description
```
POST /api/listing/description
Body: {
  "propertyFacts": { "beds": 3, "baths": 2, "sqft": 1850, "yearBuilt": 2005, "city": "Daytona Beach", "zip": "32118" },
  "sellerInputs": {
    "highlights": ["Updated kitchen", "Pool", "Corner lot"],
    "recentUpdates": ["New roof 2023", "HVAC 2022"],
    "neighborhood": "Near beachside shopping and restaurants"
  }
}
```

---

### Stale Listing Alert
```
POST /api/listing/stale-alert
Body: {
  "listingData": { "listPrice": 425000, "beds": 3, "baths": 2, "sqft": 1800, "city": "Orlando", "zip": "32801", "showings": 4, "inquiries": 2 },
  "marketStats": { "medianClosePrice": 398000, "avgDaysOnMarket": 28, "avgListToSaleRatio": 0.974 },
  "daysMilestone": 30
}
```

---

### Offer Analysis
```
POST /api/offer/analyze
Body: {
  "offer": { "offerPrice": 390000, "contingencies": ["inspection", "financing"], "closingDate": "2026-07-15", "earnestMoney": 5000, "financing": "Conventional" },
  "listPrice": 415000,
  "marketStats": { "avgListToSaleRatio": 0.974 }
}
```

---

### Waitlist Signup
```
POST /api/waitlist
Body: { "name": "Jane Smith", "email": "jane@example.com", "type": "homeowner", "market": "Daytona Beach" }
```

---

## File Structure

```
ellis-backend/
├── src/
│   ├── server.js                    # Express API server + all routes
│   ├── api/
│   │   ├── bridge-client.js         # Bridge (Stellar + Zillow + public records)
│   │   └── spark-client.js          # Spark (14 remaining Florida MLSs)
│   └── services/
│       ├── valuation-service.js     # Multi-AVM blending + Ellis range
│       └── advisor-service.js       # Claude-powered recommendations
├── config/
│   └── mls-registry.js             # All 14 Florida MLSs mapped to platform + counties
├── tests/                           # (add tests here)
├── .env.example                     # Environment variable template
├── package.json
└── README.md
```

---

## Adding to the Ellis GitHub Repo

This backend lives in a `backend/` subdirectory of the Ellis repo alongside the frontend:

```
ellis/
├── frontend/   (the ellis-site files)
├── backend/    (this directory)
└── README.md
```

**Security**: `.env` is in `.gitignore`. Never commit real credentials. Use `.env.example` as the template.

---

## Next: Wiring to the Frontend

The frontend forms post to this API. When the frontend is hosted on GitHub Pages (static) and the backend is hosted separately (Railway, Render, Fly.io, or a VPS), set:

```
FRONTEND_URL=https://ellissays.com
```

For local development with both running locally:
```
FRONTEND_URL=http://localhost:3000
PORT=3001
```

---

Built for ellissays.com · © 2026 Ellis
