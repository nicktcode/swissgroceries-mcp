# Security

## Reporting

This is a personal fun project. There is no formal security disclosure process.

- For non-sensitive bugs or broken endpoints, open a GitHub issue.
- For sensitive issues (anything that could affect upstream chain infrastructure, or concerns from a chain about API usage), reach out to the maintainer through GitHub privately before opening a public issue.

## Threat model

This MCP server runs locally on your machine and connects to public Swiss grocery chain APIs. It does **not**:

- Store user credentials on disk
- Persist any data to disk beyond the static ZIP lookup table (`src/data/swiss-zips.json`)
- Make outbound calls to any host other than the grocery chain APIs and the `migros-api-wrapper` library's endpoints

It **does**:

- Cache API responses in memory for approximately 5 minutes (configurable)
- Send device fingerprint headers (User-Agent, Accept-Language, etc.) designed to resemble mobile app traffic
- Optionally carry a bearer JWT in HTTP headers if `DENNER_JWT` is set

## Auth tokens

The Denner adapter accepts a bearer JWT via the `DENNER_JWT` environment variable. **This JWT may contain personal information** - depending on how you obtained it, it can include your name, email address, and Denner account identifiers.

- Never commit `DENNER_JWT` to git. Use `.env` files or shell-level env vars only.
- Never share the raw JWT in issues or bug reports.
- The token is valid for approximately one year from issue date. Regenerate it if compromised by re-capturing traffic from the Denner iOS app.

## Unofficial APIs

The grocery chain APIs used by this project are unofficial. They are reverse-engineered from iOS/Android app traffic. This means:

- Endpoint URLs, request parameters, and response shapes can change at any time without notice. **The maintainer is not responsible for failures caused by upstream API changes.** When an adapter breaks you will typically see a `schema_mismatch`, `unavailable`, or `auth_expired` error code. Please [open an adapter-broken issue](https://github.com/nicktcode/swissgroceries-mcp/issues/new?labels=adapter-broken&template=adapter-broken.yml) and include the raw response sample so the adapter can be updated quickly.
- Rate limiting and bot protection (e.g. DataDome on coop.ch) may block requests. This project mitigates the issue with realistic User-Agent headers and per-host rate limits, but continued access is not guaranteed.
- Using these APIs may technically violate each chain's terms of service. Use at your own risk and do not use this project for commercial purposes or high-volume scraping.

## Caveats

- The in-memory cache means stale pricing data may be served for up to 5 minutes. Disable with `SWISSGROCERIES_DISABLE_CACHE=1` when you need guaranteed freshness.
- This project has no backend. All chain API calls originate from your local machine's IP address.
