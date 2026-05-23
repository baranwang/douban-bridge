# ROUTES KNOWLEDGE BASE

## OVERVIEW

Hono route modules for Stremio addon endpoints, GitHub auth, SSR configure UI, image proxy, and dashboard pages.

## STRUCTURE

```text
routes/
+-- manifest.ts       # Stremio manifest and configure redirect
+-- catalog.ts        # catalog resource handler
+-- meta.ts           # metadata resource handler
+-- configure.tsx     # SSR configure page + POST save/encode
+-- auth.ts           # GitHub OAuth/session endpoints
+-- image-proxy.ts    # protected image proxy
`-- dash/             # basic-auth SSR admin mini-app
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Mount order | `../index.tsx` | middleware and route registration |
| Resource parsing | `../libs/router.ts` | shared Stremio path matcher |
| Config resolution | `../libs/config.ts` | UUID user config vs encoded config |
| Auth/session | `auth.ts`, `../libs/session.ts` | GitHub OAuth and JWT cookie |
| Configure SSR | `configure.tsx`, `../client/configure.tsx` | server render plus hydration script |
| Dashboard | `dash/` | separate SSR shell with basic auth |
| ID/image enrichment | `catalog.ts`, `meta.ts` | API facade plus async DB persistence |

## CONVENTIONS

- `src/index.tsx` middleware order is `logger -> cors -> rateLimit -> contextStorage -> authMiddleware`.
- Public addon handlers usually mount both direct and `/:config` variants.
- `catalog` and `meta` handlers must use `matchResourceRoute()` rather than ad hoc path splitting.
- Stremio cache fields (`cacheMaxAge`, `staleRevalidate`, `staleError`) belong in route JSON responses where supported.
- `Forward` user-agent compatibility changes ID fields; preserve `isForwardUserAgent()` branches.
- Use `c.executionCtx.waitUntil()` for non-blocking DB/cache writes after response-critical data is ready.
- SSR routes use `reactRenderer`; hydrated pages must include `ViteClient`, initial data, and a matching client entry.
- `dash/` is admin-only and separate from public Stremio endpoint behavior.

## ANTI-PATTERNS

- Do not add a Stremio resource route without mounting it in `src/index.tsx` and teaching `libs/router.ts` if it uses resource-style paths.
- Do not assume `/manifest.json` has config; unconfigured manifest requests redirect to an encoded default config.
- Do not accept non-`douban:` IDs in `meta.ts` unless the ID-prefix contract changes everywhere.
- Do not make enrichment failures fatal unless the requested resource itself is unavailable.
- Do not use API clients before `contextStorage` has established async-local env/ctx.
- Do not hydrate dashboard pages by accident; currently only configure has an explicit client entry.

## NOTES

- `libs/router.ts` reserves `stream` and `subtitles` shapes, but no stream/subtitle route is mounted yet.
- `rateLimit` keys user-scoped requests differently when a user UUID and User-Agent are present.
- `authMiddleware` makes `c.get("user")` available globally; routes decide whether anonymous access is allowed.
