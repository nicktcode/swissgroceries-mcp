# swissgroceries-mcp

An MCP server that gives Claude real-time access to Swiss grocery chain catalogs — search products, compare prices across stores, see weekly promotions, and generate optimised multi-store shopping plans. Not affiliated with Migros, Coop, Aldi, Denner, or Lidl.

## What you can ask Claude

**Price comparison**
- "Where is milk cheapest near 8001 Zürich right now?"
- "Compare pasta prices across Migros and Coop."
- "Show me organic milk options under CHF 3."

**Shopping planning**
- "I need milk, bread, eggs, chicken, and pasta near 8050. Where should I shop to keep costs down?"
- "Plan my weekly shop for 5 items near 4052 Basel — one stop only."
- "Split my cart across stores for the absolute lowest total, but add a 2 CHF penalty per extra trip."

**Promotions & deals**
- "What's on sale at Aldi this week?"
- "Any Migros deals on cheese ending this week?"
- "Show me all promotions across chains for pasta."

**Stores & stock**
- "Find Coop stores within 3 km of Bern Hauptbahnhof."
- "Which Migros near me has product 4389992 in stock?"
- "List Denner branches near 8050."

## Install

### Prerequisites

```bash
node --version   # requires Node.js >=18
git clone https://github.com/youruser/swissgroceries-mcp
cd swissgroceries-mcp
npm install
npm run build
```

### Claude Desktop (one-click)

Download `swissgroceries-mcp.mcpb` from the Releases page and:

- macOS: double-click or drag onto the Claude Desktop app icon
- Windows: Settings → Extensions → Advanced → Install Extension → select the file

To build the bundle locally:
```bash
npm run build
npx tsx scripts/build-mcpb.ts
```

### npx (after publish)

```bash
npx -y swissgroceries-mcp
```

Or in Claude Code:

```bash
claude mcp add swissgroceries -- npx -y swissgroceries-mcp
```

### Claude Desktop (manual config)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the Windows equivalent:

```json
{
  "mcpServers": {
    "swissgroceries": {
      "command": "node",
      "args": ["/absolute/path/to/swissgroceries-mcp/dist/index.js"],
      "env": {
        "DENNER_JWT": "eyJ...optional, enables Denner adapter...",
        "SWISSGROCERIES_LOG_LEVEL": "info"
      }
    }
  }
}
```

Replace `/absolute/path/to/swissgroceries-mcp` with the real path. `DENNER_JWT` is optional — omit it if you do not need Denner.

### Claude Code (one-liner)

```bash
claude mcp add swissgroceries -- node /absolute/path/to/swissgroceries-mcp/dist/index.js
```

To include Denner:

```bash
claude mcp add swissgroceries \
  -e DENNER_JWT="eyJ..." \
  -- node /absolute/path/to/swissgroceries-mcp/dist/index.js
```

## Tools

| Tool | Description | Key parameters | Example call |
|---|---|---|---|
| `find_stores` | Find grocery stores near a location, filtered by chain and radius. Returns name, address, and opening hours. | `near` (zip/lat-lng/address — address geocoded via Nominatim), `chains?`, `radiusKm?` (default 5) | `find_stores({ near: { zip: "8001" }, radiusKm: 3 })` |
| `search_products` | Search products by keyword across chains in parallel. Results grouped by chain with normalised price, unit price, size, and tags. | `query` (string), `chains?`, `filters?` (tags, maxPrice, sizeRange), `limit?` (max 50) | `search_products({ query: "milch", chains: ["migros","coop"], filters: { maxPrice: 2.5 } })` |
| `get_product` | Fetch full product details for a chain + product ID pair. Use after `search_products` to drill into a result. | `chain` (enum), `id` (string) | `get_product({ chain: "migros", id: "4389992" })` |
| `get_promotions` | List current promotional deals. Filterable by chain, keyword, store IDs, or days until expiry. | `chains?`, `query?`, `endingWithinDays?` (1–60), `storeIds?` | `get_promotions({ chains: ["aldi"], endingWithinDays: 7 })` |
| `find_stock` | Check which stores of a chain have a product in stock. Only available for chains with `perStoreStock` capability (Migros, Coop). | `chain`, `productId`, `near?` (lat/lng), `storeId?` | `find_stock({ chain: "migros", productId: "4389992", near: { lat: 47.37, lng: 8.54 } })` |
| `plan_shopping` | Plan a multi-store trip for a shopping list near a location. Returns a primary plan and two alternatives. | `items` (array of queries), `near` (zip/lat-lng/address — address geocoded via Nominatim), `strategy` (single_store / split_cart / absolute_cheapest), `radiusKm?`, `splitPenaltyChf?` | `plan_shopping({ items: [{ query: "milch" }, { query: "brot" }], near: { zip: "8001" }, strategy: "split_cart" })` |

## How it works

Each grocery chain is wrapped in an independent adapter (`src/adapters/<chain>/`) that handles authentication, HTTP calls, and raw-to-normalised mapping. All adapters produce the same `NormalizedProduct`, `NormalizedStore`, and `NormalizedPromotion` shapes defined in `src/adapters/types.ts`, so the rest of the system never has to know which chain it is talking to.

The HTTP utility (`src/util/http.ts`) underpins all adapters (except Migros, which delegates to the `migros-api-wrapper` library): it provides in-memory response caching (5-minute TTL by default), retry with exponential backoff (3 attempts, 250 ms base), per-host rate limiting (~10 req/sec), and a per-host circuit breaker that opens after 5 consecutive failures and resets after 60 seconds.

The shopping planner (`src/services/planner.ts`) fans out store and product searches in parallel across all active adapters, then feeds the results into a solver (`src/services/strategy.ts`). The solver supports three strategies: `single_store` (minimise stops), `split_cart` (cheapest split with a configurable per-stop penalty), and `absolute_cheapest` (ignore stop count). A canonicality filter (`src/services/matcher.ts`, `isCanonical`) ensures cross-chain comparisons are fair — if any chain returns a product whose category text matches the query, results from chains that only returned tangential products (e.g. Apfelschorle when searching "apfel") are dropped from the comparison matrix for that item.

```
Claude (LLM)
    │
    │ MCP tool call
    ▼
src/index.ts  ──── buildRegistry() ─────────────────────────────────────┐
    │                                                                     │
    │ routes to tool handler                                              │
    ▼                                                                     ▼
src/tools/                                                  src/adapters/
  find_stores.ts    ──► geocoding ──► adapter.searchStores     migros/
  search_products.ts ──────────────► adapter.searchProducts    coop/
  get_product.ts   ──────────────► adapter.getProduct          aldi/
  get_promotions.ts ─────────────► adapter.getPromotions       denner/  (env-gated)
  find_stock.ts    ──────────────► adapter.findStoresWithStock  lidl/
  plan_shopping.ts ──► geocoding ──► planner ──► strategy solver
                                                     │
                                            NormalizedProduct
                                            NormalizedStore
                                            NormalizedPromotion
```

See `docs/superpowers/specs/2026-04-28-swissgroceries-mcp-design.md` for the full design spec.

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `DENNER_JWT` | _(unset)_ | Bearer JWT for the Denner adapter. When unset, Denner is not registered. Extract via Charles Proxy from the Denner iOS app's `Authorization: Bearer ...` header. Tokens typically last ~1 year. |
| `LIDL_DEFAULT_STORE` | `CH0149` | Default Lidl store ID used when no `storeIds` are passed. |
| `SWISSGROCERIES_USER_AGENT_COOP` | _(built-in iOS UA)_ | Override the User-Agent sent to coop.ch endpoints. Set to a freshly captured iOS Safari UA string if DataDome blocks requests. |
| `SWISSGROCERIES_LOG_LEVEL` | `info` | Log verbosity. Set to `debug` to see cache hits, retries, and circuit-breaker events on stderr. |
| `SWISSGROCERIES_DISABLE_CACHE` | _(unset)_ | Set to `1` to disable the in-memory HTTP cache. Useful when debugging stale responses. |

## Chain coverage

| Chain | Product search | Promotions | Per-store stock | Auth required | Notes |
|---|---|---|---|---|---|
| Migros | Full catalog | Yes | Yes | Guest token (auto) | Uses `migros-api-wrapper`. Zod schema validation catches API drift. |
| Coop | Full catalog (Hybris) | Yes (limited) | Yes (geo) | None | Catalog and prices match physical Coop stores; coopathome adds an availability layer. DataDome bot protection may trigger if you exceed reasonable rates. |
| Aldi | Full catalog | Yes | No | None | Well-structured REST API; reliable. |
| Denner | Full catalog (content API) | Yes | No | `DENNER_JWT` (Bearer) | JWT extracted from iOS app via Charles. Set `DENNER_JWT` env var to enable. |
| Lidl | Weekly leaflet only | Yes | No | None | Only products in the current weekly campaign are visible; not the full catalog. |

## Troubleshooting

**"DataDome challenge" error from Coop**
Coop uses DataDome bot protection. Set `SWISSGROCERIES_USER_AGENT_COOP` to a fresh iOS Safari User-Agent string captured from an actual device or simulator request to coop.ch. Example:
```
SWISSGROCERIES_USER_AGENT_COOP="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
```

**"adapter_not_registered" for Denner**
The Denner adapter is only registered when `DENNER_JWT` is set. Extract the token: open Charles Proxy, connect your iPhone, open the Denner app, capture any API request, and copy the `Authorization: Bearer eyJ...` value. Set it in the MCP server's `env` block.

**Lidl returns 0 results**
Lidl only indexes products from the current weekly campaign leaflet. If your search term does not appear in the active campaigns, you will get 0 results. This is expected — it is not a bug.

**"unknown_zip" error**
The static ZIP table covers 3,190 Swiss PLZ codes from swisstopo data. If your ZIP is missing, pass `{ lat, lng }` coordinates directly instead. You can also open an issue with the missing ZIP.

**Migros store search returns Zürich-area stores only**
`searchStores` passes a `cityHint` to the Migros API. With an empty hint the API defaults to Zürich results. The geocoding layer now derives the city name from the ZIP lookup and forwards it as `cityHint`. If you are calling the adapter directly (e.g. in tests), pass `cityHint` explicitly.

**"schema_mismatch" error**
Migros and Coop responses are validated with Zod schemas. A `schema_mismatch` means the chain's API changed shape. Check `src/adapters/migros/schemas.ts` or `src/adapters/coop/schemas.ts` and update the schema to match the new response.

## Development

```bash
npm run build          # tsc → dist/
npm test               # full test suite (no live API calls)
npm run smoke          # live smoke tests — requires internet (RUN_LIVE=1 npm test -- tests/smoke)
npm run dev            # run with tsx watcher (hot-reload, output on stderr)
```

**Live tests**: set `RUN_LIVE=1` to include tests that hit real chain APIs:

```bash
RUN_LIVE=1 npm test -- tests/smoke
```

**Disable cache for debugging**:

```bash
SWISSGROCERIES_DISABLE_CACHE=1 RUN_LIVE=1 npm test -- tests/smoke
```

**Verbose logging**:

```bash
SWISSGROCERIES_LOG_LEVEL=debug npm run dev
```

## Adding a new chain

See `docs/superpowers/specs/2026-04-28-swissgroceries-mcp-design.md` for the full design context.

1. **Capture API responses** — use Charles Proxy or mitmproxy on the chain's iOS/Android app. Save product search, product detail, store search, and promotions endpoints as JSON fixtures under `tests/fixtures/<chain>/`.

2. **Create the adapter directory** at `src/adapters/<chain>/`:
   - `client.ts` — HTTP client with auth headers; use `httpJson` from `src/util/http.ts`
   - `tags.ts` — chain-specific label → controlled `Tag` mapping
   - `normalize.ts` — raw API response → `NormalizedProduct` / `NormalizedStore` / `NormalizedPromotion`
   - `index.ts` — `StoreAdapter` implementation
   - `schemas.ts` (optional) — Zod schemas for response validation

3. **Declare capability flags** in the `StoreAdapter` implementation. Only advertise what the chain actually supports (`perStoreStock: false` if the chain API has no stock endpoint).

4. **Register** the adapter in `src/index.ts` inside `buildRegistry()`. Use an env-var guard if the adapter requires a secret (see the Denner pattern).

5. **Add tests** — `tests/adapters/<chain>.test.ts` with `parseSize` unit tests and a fixture-based normalise test. Update the chain coverage table in this README.

## Status

v0.1.0: Migros (full catalog), Coop (full catalog via coopathome), Aldi (full), Denner (env-gated, full), Lidl (weekly leaflet only).

Known limitations:
- Free-text addresses geocoded via OpenStreetMap Nominatim (rate-limited, cached for 30 days)
- Cross-chain price comparison uses catalog prices; per-store shelf-level pricing variations (rare in CH) are not modeled
- Lidl and Aldi catalogs are limited (weekly campaigns / walk-in service point)
- Coop's online catalog (coopathome) is the same data as the physical-store assortment; it just adds availability/inventory info per store
- Migros `migros-api-wrapper` is a third-party library; if it diverges from the real API, update the adapter

See `docs/superpowers/specs/2026-04-28-swissgroceries-mcp-design.md` for the full design.

## License

MIT — see [LICENSE](LICENSE).
