# Contributing

Thanks for your interest. **This is a personal fun project** maintained by [Nick Thommen](mailto:nick@thommen.it). Issues and pull requests are very welcome — new chains, smarter matchers, bug fixes, doc improvements, anything that makes Swiss grocery shopping a bit smarter.

## A note to the chains

If you represent Migros, Coop, Aldi, Denner, Lidl, or any other Swiss retailer and have concerns about how the project uses your API, please email **nick@thommen.it** directly. We'll work it out — no formal process needed.

## How to contribute

## Opening issues

- For bugs, include the error message, the tool call you made, and which chain was involved.
- For missing ZIP codes, include the PLZ and the canton so it can be cross-checked against swisstopo data.
- For broken chain adapters (API shape changes, auth failures), attach the raw error if possible.

## Running tests

```bash
npm test                          # full unit/integration suite — no network calls
RUN_LIVE=1 npm test -- tests/smoke  # live smoke tests against real chain APIs
SWISSGROCERIES_DISABLE_CACHE=1 RUN_LIVE=1 npm test -- tests/smoke  # same, cache off
```

The test suite uses [Vitest](https://vitest.dev/). Fixture JSON files live under `tests/fixtures/<chain>/`. Capture scripts in `scripts/` show how to refresh them.

## Adding a new chain

### 1. Capture API responses

Use Charles Proxy or mitmproxy on the chain's iOS or Android app. For each endpoint (product search, product detail, store search, promotions), save a representative JSON response to `tests/fixtures/<chain>/`. Look for:

- Product search: a query returning 10–20 items.
- Product detail: a single product with full fields.
- Store search: a lat/lng-based or city-based query.
- Promotions: the current weekly/campaign data.

### 2. Create the adapter directory

```
src/adapters/<chain>/
  client.ts     — HTTP client with auth headers; use httpJson from src/util/http.ts
  tags.ts       — chain-specific label strings → controlled Tag enum mapping
  normalize.ts  — raw API types → NormalizedProduct / NormalizedStore / NormalizedPromotion
  index.ts      — StoreAdapter implementation with capability flags
  schemas.ts    — (optional) Zod schemas for response shape validation
```

Use `src/adapters/aldi/` as the simplest reference implementation.

### 3. Map to normalised types

Adapter outputs **must** conform to `NormalizedProduct`, `NormalizedStore`, and `NormalizedPromotion` (defined in `src/adapters/types.ts`). The matcher and planner never see chain-specific fields.

Key rules:
- `price.current` must be a positive CHF number. Return `AdapterResult.err` if not available.
- `unitPrice` should be derived whenever possible (use `src/util/unit-price.ts`).
- `size` should use `parseSize` from `src/util/multipack.ts` for consistent unit parsing.
- Adapters **never throw** on expected failures — return `AdapterResult.err({ code, reason })`.

### 4. Declare capability flags

Only advertise capabilities the chain actually supports:

```ts
readonly capabilities = {
  productSearch: true,
  productDetail: true,
  storeSearch: true,
  promotions: true,
  perStoreStock: false,   // only true if the chain has a real stock endpoint
  perStorePricing: false, // only true if per-store shelf prices differ from catalog
};
```

### 5. Register in buildRegistry

In `src/index.ts`:

```ts
import { AcmeAdapter } from './adapters/acme/index.js';

export function buildRegistry(): AdapterRegistry {
  // ...
  if (process.env.ACME_JWT) r.register(new AcmeAdapter());  // env-gate if auth required
  // ...
}
```

### 6. Add tests

Create `tests/adapters/<chain>.test.ts` with:
- `parseSize` unit tests for any size strings the chain uses.
- Fixture-based `normalizeProduct` / `normalizeStore` tests that load JSON from `tests/fixtures/<chain>/`.
- Optionally a live smoke test block in `tests/smoke/live.test.ts` (guard with `itLive`).

### 7. Update README

Add a row to the Chain coverage table.

## Code style

- TypeScript strict mode throughout.
- One responsibility per file (client, tags, normalize, adapter).
- Adapters depend on normalised types only — never import chain-specific fields into tools or services.
- New synonym groups for the matcher go in `QUERY_SYNONYMS` in `src/services/matcher.ts`. Prefer a broad synonym group over a hand-curated keyword blacklist.
- `isCanonical` in `src/services/matcher.ts` is the preferred way to drop tangential products — do not add per-chain heuristics outside the adapter.

## Commit messages

[Conventional commits](https://www.conventionalcommits.org/) style:

```
feat(aldi): add per-store stock endpoint
fix(coop): handle empty locations array in store search
docs: update chain coverage table
refactor(matcher): extract synonym expansion
test(lidl): add fixture-based normalize test
chore: bump migros-api-wrapper to 1.1.38
```

Scopes correspond to adapter names, tool names, or service names (`planner`, `matcher`, `geocoding`, `http`).

Do not include AI assistant attribution in commit messages.
