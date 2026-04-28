# swissgroceries-mcp

MCP server for Swiss grocery stores: Migros, Coop, Aldi, Denner, Lidl. Lets an LLM search products, find stores, see promotions, check stock, and plan multi-store shopping routes.

> Not affiliated with any of the chains. Uses publicly accessible app endpoints only.

## What you can ask Claude

- "I want to buy milk, bread, eggs, chicken, and pasta near 8001 Zürich. Where's cheapest?"
- "Show me organic milk options under CHF 3 at Migros and Coop."
- "What's on sale at Aldi this week?"
- "Find Denner stores within 3 km of 8050 Zürich."
- "Which stores near me have product 4389992 in stock?"

## Install

```bash
npm install
npm run build
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swissgroceries": {
      "command": "node",
      "args": ["/absolute/path/to/swissgroceries-mcp/dist/index.js"],
      "env": {
        "DENNER_JWT": "eyJ...optional, enables Denner adapter..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add swissgroceries -- node /absolute/path/to/swissgroceries-mcp/dist/index.js
```

## Available tools

| Tool | Description |
|---|---|
| `find_stores` | Find grocery stores near a location, filtered by chain. |
| `search_products` | Cross-store product search. |
| `get_product` | Get details for a specific product (chain + id). |
| `get_promotions` | List current promotions across chains. |
| `find_stock` | Find stores with a product in stock. |
| `plan_shopping` | Plan a shopping route (cheapest single store, split cart, or absolute cheapest). |

## Configuration

| Env var | Required | Effect |
|---|---|---|
| `DENNER_JWT` | no | Enables the Denner adapter. Extract via Charles from the Denner iOS app's `Authorization: Bearer ...` header. Lasts ~1 year. |
| `LIDL_DEFAULT_STORE` | no | Default Lidl store ID (default `CH0149`). |
| `SWISSGROCERIES_USER_AGENT_COOP` | no | Override the iOS Safari UA used for Coop calls (helps if DataDome blocks the default). |

## Development

```bash
npm test              # all tests except live smoke
RUN_LIVE=1 npm test   # includes live API smoke tests
npm run dev           # tsx watcher, prints to stderr
```

## Status

v1: Migros, Coop, Aldi, Denner (env-gated), Lidl. Spar and Volg are out of scope. Promotions / per-store stock / per-store pricing capabilities vary per chain — see `docs/superpowers/specs/2026-04-28-swissgroceries-mcp-design.md`.
