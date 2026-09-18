# API CLIENTS KNOWLEDGE BASE

## OVERVIEW

Context-bound network clients for Douban, TMDB, Trakt, Fanart, IMDb, GitHub, and DB-backed ID mapping.

## STRUCTURE

```text
api/
+-- base.ts          # axios fetch adapter, logging, cache, dedupe, DB/KV context access
+-- index.ts         # API facade and Douban-ID mapping workflow
+-- douban/          # Frodo/web Douban client + tolerant schemas
+-- tmdb/            # TMDB client, constants, normalized schemas
+-- fanart/          # Fanart image client + schemas
+-- trakt.ts         # Trakt search and ID helpers
+-- imdb.ts          # IMDb search helper
`-- github.ts        # GitHub OAuth/star checks; not BaseAPI-based
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Shared HTTP policy | `base.ts` | axios fetch adapter, cache, in-flight dedupe |
| ID mapping orchestration | `index.ts` | D1 reads/writes and Trakt/Douban search fallback |
| Douban collection/detail | `douban/index.ts`, `douban/schema.ts` | tolerant parsing and Frodo API key behavior |
| TMDB images/search | `tmdb/index.ts`, `tmdb/schema.ts`, `tmdb/constants.ts` | language constants and result normalization |
| Fanart images | `fanart/index.ts`, `fanart/schema.ts` | image lookups and null-on-error behavior |
| Trakt IDs | `trakt.ts` | search helpers and schema workaround |
| Runtime context | `../middleware/context.ts` | required for BaseAPI env/ctx/db/cache access |

## CONVENTIONS

- BaseAPI clients are request/scheduled-context clients, not standalone libraries.
- Use Cloudflare bindings from `getContext().env`; `process.env` fallbacks are local-dev conveniences only.
- Use caller-supplied cache keys; no cache key means no BaseAPI persistent cache or dedupe.
- Cache types are bit flags: LOCAL is `caches.default`, KV is `env.KV`, and callers can combine them.
- Non-critical enrichments should return `null`/`[]` on provider failure and let Stremio responses degrade gracefully.
- Persist ID mappings through the `api` facade so an existing TMDB tuple is kept intact; establishing TMDB replaces the whole ID tuple instead of coalescing leftover IMDb/Trakt.
- Schema files intentionally use `.catch`, `.nullish`, transforms, and normalization for unstable third-party payloads.
- Use `waitUntil()` for cache/DB writes that should not block the user response.

## ANTI-PATTERNS

- Do not instantiate or call BaseAPI-derived clients when AsyncLocalStorage context is absent; `getContext()` will throw.
- Do not assume deployed Workers can read `process.env`.
- Do not assume all provider IDs exist or are numeric; mapping and image code must tolerate nullish IDs.
- Do not treat one Trakt/Douban search result path as universal; title, original-title, year, and IMDb fallbacks are deliberate.
- Do not make Fanart failures noisy or fatal; missing Fanart assets are expected.
- Do not trust BaseAPI success-interceptor handling for non-2xx retry logic; axios normally rejects those responses first.
- Do not bypass tolerant schemas with raw provider response types.

## NOTES

- `api` is a singleton facade; it reaches DB/KV through the current request/cron context.
- GitHubAPI is explicit-env and OAuth-focused; it is not part of BaseAPI caching.
- Douban headers are reused by `routes/image-proxy.ts` for protected image fetching.
- Trakt package schema lacks some episode shape support, so local workarounds are intentional.
