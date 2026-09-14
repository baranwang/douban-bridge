# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-13
**Branch:** cursor/douban-bridge-cloud-first-b4c5

## OVERVIEW

Douban catalogs, metadata, images, and ID mapping for Stremio and Rex. pnpm workspace: `apps/core` (Worker `douban-bridge-core`: web + `/v1` + D1/KV/cron + StremioEntrypoint), `apps/stremio` (original install domain), `apps/rex-widget` (Rslib + @rexnow), `packages/contracts`. Cloudflare Workers with Hono, React SSR/hydration, Tailwind v4/shadcn UI, Drizzle over D1, KV/caches.default for caching.

## STRUCTURE

```text
stremio-addon-douban/
+-- apps/core/                 # Worker douban-bridge-core; public host douban-bridge.baran.wang
|   +-- src/index.tsx         # default fetch + scheduled + StremioEntrypoint
|   +-- src/app.tsx           # web + /v1 (Bearer); no public Stremio catalog/meta/manifest
|   +-- src/cron.ts           # hourly ID-mapping backfill
|   +-- src/client/           # browser hydration entries
|   +-- src/components/       # React UI; see child AGENTS.md
|   +-- src/db/               # Drizzle D1 schema/client
|   +-- src/libs/             # config, sessions, middleware, API clients
|   +-- src/routes/           # web, auth, api-keys, internal-api, internal-stremio
|   +-- drizzle/              # SQL migrations
|   +-- public/               # static assets (icon)
|   +-- wrangler.jsonc        # D1/KV/cron/ASSETS/origins
|   +-- wrangler.test.jsonc  # local-only D1/KV for Node tests
|   `-- vite.config.ts
+-- apps/stremio/              # Worker stremio-addon-douban; original domain
+-- apps/rex-widget/          # Rex Widget (Rslib + @rexnow); npm/unpkg @douban-bridge/rex-widget
+-- packages/contracts/        # shared addon identity and HTTP schemas
+-- scripts/test.mjs          # Node test runner
+-- scripts/smoke.mjs         # local two-Worker HTTP + D1 smoke
+-- turbo.json                # workspace build/test/cf-typegen
+-- docs/deployment/douban-bridge.md
+-- docs/testing/rex-host.md
`-- pnpm-workspace.yaml
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Worker entry/mounts | `apps/core/src/index.tsx`, `apps/core/src/app.tsx` | public web + /v1; StremioEntrypoint for the adapter |
| Cron mapping job | `apps/core/src/cron.ts` | ALS context; only core has scheduled |
| Stremio protocol | `apps/stremio/src/` | catalog/meta/manifest + web allowlist |
| Internal Stremio data | `apps/core/src/routes/internal-stremio.ts` | StremioEntrypoint only |
| Public API | `apps/core/src/routes/internal-api.ts` | mounted on the default fetch; Bearer `sk` only |
| Configure page | `apps/core/src/routes/configure.tsx`, `src/client/configure.tsx`, `src/components/configure/` | install URLs use `STREMIO_ORIGIN` |
| Admin dashboard | `apps/core/src/routes/dash/` | protected SSR mini-app |
| API integrations | `apps/core/src/libs/api/` | context-bound clients |
| Config encoding/storage | `apps/core/src/libs/config.ts` | base64url brotli or user UUID |
| Addon identity | `packages/contracts/src/addon.ts` | root package name/version/displayName/description |
| Sessions/auth | `apps/core/src/libs/session.ts`, `src/routes/auth.ts` | JWT cookie plus GitHub OAuth |
| API keys | `apps/core/src/libs/api-key.ts`, `src/routes/api-keys.ts` | hashes only; session write |
| D1 schema | `apps/core/src/db/schema.ts` | no foreign keys |
| Migrations | `apps/core/drizzle/*.sql` | apply with Wrangler D1 |
| Widget | `apps/rex-widget/src/` | cloud-first + local fallback |
| Local tests | `apps/*/test/` | Node runner; mocks vs live Douban are separate evidence |
| Rollout | `docs/deployment/douban-bridge.md` | ordered deploy/rollback; production not implied |
| Rex host | `docs/testing/rex-host.md` | device steps still 未执行 |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `app` | Hono app | `apps/core/src/app.tsx` | web + `/v1` |
| `StremioEntrypoint` | WorkerEntrypoint | `apps/core/src/index.tsx` | named fetch for the Stremio adapter |
| `scheduled` | Worker handler | `apps/core/src/cron.ts` | hourly unmapped Douban ID calibration |
| `api` | singleton facade | `apps/core/src/libs/api/index.ts` | providers plus ID mapping persistence |
| `configSchema` | Zod schema | `apps/core/src/libs/config.ts` | persisted and encoded config |
| `ADDON` | identity | `packages/contracts/src/addon.ts` | Stremio id/name/version/description |
| `getDrizzle` | DB helper | `apps/core/src/db/index.ts` | D1-bound Drizzle client |
| `doubanMapping` | table | `apps/core/src/db/schema.ts` | Douban to TMDB/IMDb/Trakt mapping cache |
| `withTestContext` | test helper | `apps/core/test/context.ts` | local Wrangler D1/KV + ALS; no remote |

## CONVENTIONS

- TypeScript strict mode; `@/*` in core resolves to `apps/core/src/*`.
- Biome: 2 spaces, double quotes, 120 columns.
- Tailwind v4 in `apps/core/src/style.css`.
- Cloudflare Workers `nodejs_compat`; D1 `STREMIO_ADDON_DOUBAN` and KV `KV` only on core.
- Drizzle schema `apps/core/src/db/schema.ts`; migrations `apps/core/drizzle/`.
- Root `pnpm build` / `test` / `cf-typegen` go through Turbo. `pnpm deploy` deploys **core only** and does not apply remote migrations. `scripts/smoke.mjs` stays a live two-Worker probe.
- Stremio addon identity comes from root `package.json` via `ADDON`.
- Widget version is `apps/rex-widget` `0.1.0`, not root addon `1.1.0`.
- Generated: `apps/*/dist/`, `apps/*/.wrangler/`, `worker-configuration.d.ts`, `drizzle/meta/`.

## ANTI-PATTERNS (THIS PROJECT)

- Do not add Drizzle foreign keys via `.references()`.
- Do not assume `process.env` in deployed Workers; use bindings.
- Do not call context-bound API clients outside request/scheduled ALS.
- Do not enable `remote: true` on local D1/KV or adapter service bindings.
- Do not treat checked-in `dist/` as source of truth or as a published Widget.
- Do not overwrite generated migration snapshots.
- Do not hand-author `worker-configuration.d.ts`.
- Do not deploy all Workers or apply remote D1 migrations from a single root command.

## UNIQUE STYLES

- Stremio endpoints are dual public and `/:config` on the **stremio** Worker.
- Configure UI is SSR-rendered and hydrated by `apps/core/src/client/configure.tsx`; install host is `STREMIO_ORIGIN`.
- Forward compatibility fields (`cacheMaxAge`, `staleRevalidate`, `staleError`) are emitted unconditionally.
- API enrichment failures degrade; catalog/meta still return what they can.
- Config URLs are brotli-compressed base64url JSON unless the path segment is a user UUID.
- Widget `sk` is `globalParams` name `sk`, storage key `douban.bridge.sk`; detail links have no key.

## COMMANDS

```bash
pnpm install
pnpm test
pnpm build
pnpm --filter @douban-bridge/core cf-typegen
pnpm --filter @douban-bridge/stremio cf-typegen
pnpm --filter @douban-bridge/core preview   # 8787, after build
pnpm --filter @douban-bridge/stremio preview # 8788
node scripts/smoke.mjs
pnpm --filter @douban-bridge/core exec drizzle-kit generate
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 migrations apply stremio-addon-douban --local --persist-to ../../.wrangler/bridge-smoke
```

Production cutover: `docs/deployment/douban-bridge.md`. Do not use root `pnpm deploy` as a two-Worker rollout.

## NOTES

- `apps/core` deploy script uses `npm run build && wrangler deploy` even though the project uses pnpm.
- Widget 发版：`.github/workflows/release.yml` + Changesets（对齐 baranwang/rex-widget）。`pnpm changeset` 后合并 `main`，workflow 开版本 PR 或 `changeset publish` 到 npm。core / stremio / contracts 不发布。
- D1 migrations are not part of any deploy script; apply them explicitly.
- `a11y` linting is off in Biome.
- Local tests use `apps/core/wrangler.test.jsonc`. Live Douban in `scripts/smoke.mjs` is not the same evidence as mocked Node tests.
- Rex host verification in `docs/testing/rex-host.md` is 未执行; do not invent device results.
- Widget npm `unpkg.com/@douban-bridge/rex-widget` 在首次 `changeset publish` 前 404；不要把本地 `dist/` 当成已分发。
