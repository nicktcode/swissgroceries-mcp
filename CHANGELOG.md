# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-04-29

### Fixed
- Entrypoint guard now resolves real paths on both sides (symlink-safe), so the bundled server actually starts under Claude Desktop on macOS where /tmp is a symlink to /private/tmp.

## [0.1.5] - 2026-04-29

### Fixed
- Server entrypoint now starts reliably under all spawn patterns (Claude Desktop, npx, direct node). Previous `import.meta.url === \`file://\undefined\`` guard was too brittle (string mismatch on URL encoding) and left main() un-invoked when launched by Claude Desktop, surfacing as 'Unable to connect to extension server'.

## [0.1.4] - 2026-04-29

### Fixed
- `.mcpb` manifest `repository` field is now an object `{type, url}` as the manifest schema requires (was a bare string in 0.1.3, causing 'Failed to preview extension' in Claude Desktop).

## [0.1.3] - 2026-04-29

### Fixed
- `.mcpb` bundle now embeds the project icon (icon.png) and references it in manifest.json.
- Bundle manifest now uses the scoped npm name and propagates user_config to the spawned server's environment, so DENNER_JWT and LIDL_DEFAULT_STORE work when set in Claude Desktop's extension settings.

## [0.1.2] - 2026-04-29

### Added
- `mcpName` field in package.json (`io.github.nicktcode/swissgroceries-mcp`) for ownership verification by the official MCP Registry.
- `server.json` manifest at the repo root for MCP Registry submission.

## [0.1.1] - 2026-04-29

### Changed
- README: project icon, shield badges (npm, CI, license, MCP), and clearer framing as a generic MCP server (works with Claude Desktop, Claude Code, Cursor, Cline, Continue, VS Code, custom clients).
- npm package description updated to mention all supported MCP clients.

### Fixed
- Release workflow now tolerates re-tagging an already-published version (no longer reports false-failure on force-re-tag).

## [0.1.0] - 2026-04-29

### Added
- Address-string geocoding via OpenStreetMap Nominatim (rate-limited per their usage policy, cached 30 days)
- Initial public release.
- Five chain adapters: Migros, Coop, Aldi, Denner (env-gated via `DENNER_JWT`), Lidl.
- Six MCP tools: `find_stores`, `search_products`, `get_product`, `get_promotions`, `find_stock`, `plan_shopping`.
- Cross-store shopping plan optimizer with three strategies: `single_store`, `split_cart`, `absolute_cheapest`.
- Category-text canonicality cross-chain filter - when any chain returns a product whose category matches the query, tangential results (e.g. Apfelschorle for "apfel") are dropped from cross-chain comparisons for that item.
- Multipack detection - every `NormalizedProduct` exposes per-unit price/size derived from pack patterns (`6x1.5l`, `12 x 50cl`, `4er Pack`). Multipacks are de-prioritized by default; users opt in via explicit query patterns or pinned SKUs.
- Synonym expansion for common Swiss food category queries (`pasta`, `milch`, `käse`, `eier`, `brot`, `poulet`, `butter`, `mehl`, etc.) in German, French, Italian, and English variants.
- 3,190 Swiss ZIP codes with WGS84 coordinates from official swisstopo data (`src/data/swiss-zips.json`).
- HTTP infrastructure in `src/util/http.ts`: in-memory response caching (5-minute TTL), retry with exponential backoff (3 attempts, 250 ms base), per-host rate limiting (~10 req/sec), per-host circuit breaker (opens after 5 failures, resets after 60 s).
- Zod response schema validation for Coop (`src/adapters/coop/schemas.ts`) and Migros (`src/adapters/migros/schemas.ts`) - API drift is caught via `schema_mismatch` error code.
- Rich tool descriptions for LLM consumption: each tool carries a 3–4 sentence description plus per-field `.describe()` annotations on every Zod schema field.
- Structured tool errors (`ToolError` in `src/tools/errors.ts`) with `code`, `message`, and `hint` fields, returned via MCP `isError` content so Claude can surface actionable guidance.
- Graceful shutdown on `SIGINT` and `SIGTERM`.
- Debug logging via `SWISSGROCERIES_LOG_LEVEL=debug` (logs cache hits, retries, circuit-breaker state to stderr).
- `SWISSGROCERIES_DISABLE_CACHE=1` to bypass in-memory HTTP cache for debugging.
- `SWISSGROCERIES_USER_AGENT_COOP` override for Coop's DataDome bot protection.
- Fixture-based unit tests for all five chain adapters under `tests/fixtures/<chain>/`.
- Live smoke tests under `tests/smoke/live.test.ts` (skipped by default; activated via `RUN_LIVE=1`).
- Capture scripts for all five chains under `scripts/capture-<chain>-fixtures.*`.
