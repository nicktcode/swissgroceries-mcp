<p align="center">
  <img src="assets/icon.png" alt="swissgroceries-mcp" width="180">
</p>

<h1 align="center">swissgroceries-mcp</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@nicktcode/swissgroceries-mcp"><img src="https://img.shields.io/npm/v/@nicktcode/swissgroceries-mcp.svg?label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@nicktcode/swissgroceries-mcp"><img src="https://img.shields.io/npm/dm/@nicktcode/swissgroceries-mcp.svg" alt="npm downloads"></a>
  <a href="https://github.com/nicktcode/swissgroceries-mcp/actions/workflows/ci.yml"><img src="https://github.com/nicktcode/swissgroceries-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@nicktcode/swissgroceries-mcp" alt="Node"></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-8A2BE2" alt="MCP compatible"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

Real-time Swiss grocery shopping over the [Model Context Protocol](https://modelcontextprotocol.io/). Search products, compare prices across Migros, Coop, Aldi, Denner, Lidl, Farmy, and Volgshop, see weekly promotions, and plan multi-store shopping trips. Works with any MCP-compatible client (Claude Desktop, Claude Code, Cursor, Cline, Continue, VS Code MCP extensions, custom clients).

> **Disclaimer**
>
> This is a personal fun project. It is not affiliated with, endorsed by, or sponsored by Migros, Coop, Aldi, Denner, Lidl, Farmy, Volg, or any other retailer. It uses publicly accessible mobile-app endpoints to make Swiss grocery shopping a bit smarter for end users.
>
> If you represent any of these stores and have concerns (about API usage, branding, scraping rate, or anything else), please reach out to the maintainer through GitHub and we will work it out. No need to escalate.
>
> **API stability**: the chain APIs used here are unofficial and can change at any time. The maintainer is not responsible for failures caused by upstream changes; please open an issue with the response sample so the affected adapter can be updated.
>
> **PRs welcome.** New chains, better matchers, smarter strategies, bug fixes, doc improvements; all encouraged. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Install

No accounts, no tokens, no API keys required. The Denner adapter self-registers an anonymous client on first use; everything else uses public endpoints.

### Claude Desktop (one-click)

Download `swissgroceries-mcp.mcpb` from the [Releases page](https://github.com/nicktcode/swissgroceries-mcp/releases) and:

- macOS: double-click or drag onto the Claude Desktop app icon.
- Windows: Settings → Extensions → Advanced → Install Extension → select the file.

### Claude Code (one-liner)

```bash
claude mcp add swissgroceries -- npx -y @nicktcode/swissgroceries-mcp
```

### Cursor / Cline / Continue / VS Code / Claude Desktop (manual config)

Most MCP-compatible clients accept the same JSON server entry. Add it to your client's MCP config file (paths vary, see your client's docs):

```json
{
  "mcpServers": {
    "swissgroceries": {
      "command": "npx",
      "args": ["-y", "@nicktcode/swissgroceries-mcp"]
    }
  }
}
```

Common config paths:

- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
- **Cursor**: `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally.
- **Cline / Continue / VS Code**: see each client's MCP documentation.
- **Custom clients**: any stdio-based MCP client can spawn `npx -y @nicktcode/swissgroceries-mcp` directly.

## What you can ask

**Price comparison**
- "Where is milk cheapest near 8001 Zürich right now?"
- "Compare pasta prices across Migros and Coop."
- "Show me organic milk options under CHF 3."

**Shopping planning**
- "I need milk, bread, eggs, chicken, and pasta near 8050. Where should I shop to keep costs down?"
- "Plan my weekly shop for 5 items near 4052 Basel, one stop only."
- "Split my cart across stores for the absolute lowest total, but add a 2 CHF penalty per extra trip."

**Promotions and deals**
- "What is on sale at Aldi this week?"
- "Any Migros deals on cheese ending this week?"
- "Show me all promotions across chains for pasta."

**Stores and stock**
- "Find Coop stores within 3 km of Bern Hauptbahnhof."
- "Which Migros near me has product 4389992 in stock?"
- "List Denner branches near 8050."

## Tools

| Tool | What it does |
|---|---|
| `find_stores` | Find grocery stores near a location, filtered by chain and radius. |
| `search_products` | Cross-chain product search with normalised price, unit price, size, and tags. |
| `get_product` | Full product details for a chain plus product ID pair. |
| `get_promotions` | Current promotional deals, filterable by chain, keyword, store, or expiry. |
| `find_stock` | Stores of a chain that have a given product in stock. |
| `plan_shopping` | Plan a multi-store trip for a shopping list near a location. |
| `health_check` | Probe each registered chain adapter and report status, latency, and capabilities. |

Each tool exposes rich JSON Schema with field-level descriptions, so the LLM knows when and how to call it.

## Chain coverage

| Chain | Product search | Promotions | Per-store stock | Auth |
|---|---|---|---|---|
| Migros | Full catalog | Yes | Yes | Guest token (auto, rotated on expiry) |
| Coop | Full catalog (coopathome) | Yes | Yes (geo) | None |
| Aldi | Full catalog | Yes | No | None |
| Denner | Full catalog | Yes | No | Anonymous self-auth (signup + signin, rotated) |
| Lidl | Weekly leaflet only | Yes | No | None |
| Farmy | Full catalog (organic delivery) | Yes (strikeout-price filter) | No (delivery-only) | None |
| Volgshop | Full catalog | Yes (`on_sale` filter) | No (delivery-only) | None |

---

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `DENNER_JWT` | _(unset)_ | Optional pre-supplied Denner Bearer JWT. Without it, the adapter self-registers anonymously on first use and rotates the token automatically. |
| `LIDL_DEFAULT_STORE` | `CH0149` | Default Lidl store ID used when no `storeIds` are passed. |
| `SWISSGROCERIES_USER_AGENT_COOP` | _(default iOS Safari UA)_ | Override the User-Agent for Coop calls if DataDome ever blocks the default. |
| `SWISSGROCERIES_LOG_LEVEL` | `info` | `silent`, `info`, or `debug`. |
| `SWISSGROCERIES_DISABLE_CACHE` | _(unset)_ | Set to `1` to bypass the in-memory HTTP cache (useful for debugging). |

## How it works

Each grocery chain is wrapped in an independent adapter (`src/adapters/<chain>/`) that handles authentication, HTTP calls, and raw-to-normalised mapping. Adapters all produce the same `NormalizedProduct`, `NormalizedStore`, and `NormalizedPromotion` shapes (defined in `src/adapters/types.ts`), so the rest of the system never has to know which chain it is talking to.

The HTTP utility (`src/util/http.ts`) underpins every adapter except Migros (which delegates to the `migros-api-wrapper` library): in-memory response caching with a 5-minute TTL, retry with exponential backoff (3 attempts, 250 ms base), per-host rate limiting (~10 requests per second), and a per-host circuit breaker that opens after 5 consecutive failures and resets after 60 seconds.

The shopping planner (`src/services/planner.ts`) fans out store and product searches in parallel across all active adapters, then feeds results into a strategy solver (`src/services/strategy.ts`) that supports three modes:

- `single_store`: minimise the number of stops.
- `split_cart`: cheapest split across chains, with a configurable per-stop penalty.
- `absolute_cheapest`: cheapest split, ignoring stop count.

Cross-chain comparisons are kept fair by a category-text canonicality filter (`src/services/matcher.ts`, `isCanonical`). When at least one chain returns a product whose category text matches the query, results from chains that only returned tangential products (for example, Apfelschorle when searching for "apfel") are dropped from the comparison matrix for that item.

```
MCP client (any LLM)
    │
    │ MCP tool call
    ▼
src/index.ts ── buildRegistry() ────────────────────────────────────────┐
    │                                                                     │
    │ routes to tool handler                                              │
    ▼                                                                     ▼
src/tools/                                                  src/adapters/
  find_stores.ts    ──► geocoding ──► adapter.searchStores     migros/
  search_products.ts ──────────────► adapter.searchProducts    coop/
  get_product.ts    ──────────────► adapter.getProduct         aldi/
  get_promotions.ts ──────────────► adapter.getPromotions      denner/  (auto-auth)
  find_stock.ts     ──────────────► adapter.findStoresWithStock lidl/
  plan_shopping.ts  ──► geocoding ──► planner ──► strategy solver
                                                     │
                                            NormalizedProduct
                                            NormalizedStore
                                            NormalizedPromotion
```

## Build from source

```bash
node --version   # requires Node.js >=20
git clone https://github.com/nicktcode/swissgroceries-mcp
cd swissgroceries-mcp
npm install
npm run build
```

To also build the `.mcpb` bundle locally:

```bash
npx tsx scripts/build-mcpb.ts
```

## Troubleshooting

**Coop "DataDome challenge" error**

You hit Coop's bot protection. Set `SWISSGROCERIES_USER_AGENT_COOP` to a freshly captured iOS Safari User-Agent string and try again.

**Denner "auth_expired" error**

Rare, since the adapter rotates its token automatically. If it persists, unset any custom `DENNER_JWT` and let the adapter re-bootstrap from scratch.

**Lidl returns 0 results**

Lidl only indexes products from the current weekly campaign leaflet. If your search term is not in this week's campaigns, you will get 0 results. This is expected.

**ZIP unknown error**

The static lookup table covers all 3,190 official Swiss postcodes. If yours is missing, pass `{ lat, lng }` directly or open an issue with the missing PLZ.

**Migros stores nowhere near my location**

The Migros store-search API caps at ~10 results per query. The adapter passes a city hint derived from your ZIP. If you call the adapter directly without ZIP-based geocoding, pass `cityHint` explicitly.

## Development

```bash
npm test              # full test suite, no network calls
RUN_LIVE=1 npm test   # also runs live smoke tests against real chain APIs
npm run dev           # tsx watcher for local iteration
SWISSGROCERIES_DISABLE_CACHE=1 RUN_LIVE=1 npm test  # cache off, useful for debugging
SWISSGROCERIES_LOG_LEVEL=debug npm run dev          # verbose logging
```

The test suite uses [Vitest](https://vitest.dev/). Fixture JSON files live under `tests/fixtures/<chain>/`. Capture scripts in `scripts/` show how to refresh them.

## Adding a new chain

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick version:

1. Capture API responses with Charles Proxy or mitmproxy on the chain's iOS or Android app.
2. Create `src/adapters/<chain>/{client,tags,normalize,index}.ts` following the existing patterns. Use `src/adapters/aldi/` as the simplest reference.
3. Map raw responses to `NormalizedProduct`, `NormalizedStore`, and `NormalizedPromotion`.
4. Declare capability flags accurately.
5. Register the adapter in `src/index.ts`'s `buildRegistry()`.
6. Add fixture-based tests under `tests/adapters/`.

## License

MIT, see [LICENSE](LICENSE).
