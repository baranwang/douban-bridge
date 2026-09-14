# Task 2 Report: Shared Base UI primitives

## Status

Implemented and verified on `codex/core-entry-base-ui`, ready for the task commit.

## What changed

- Added the private `@douban-bridge/ui` workspace package with the requested wildcard component export and shared stylesheet export.
- Added the complete 17-family Base UI primitive set: avatar, badge, button-group, button, card, drawer, dropdown-menu, input-group, input, item, native-select, separator, sonner, spinner, switch, table, and textarea.
- Mirrored the `base-nova` / Mist / Emerald / Lucide / Inter preset configuration and theme into the shared package.
- Pointed Core at `@douban-bridge/ui`, imported the shared stylesheet, and removed its duplicate theme/base declarations and local `cn` implementation.
- Migrated every Core primitive import and composition site from Radix-style `asChild` to Base UI `render`.
- Removed `repositionInputs`, all `data-vaul-*` attributes, and the Safari-only native-switch branch and CSS variant.
- Made the account-menu trigger an explicitly labelled button and logout a real menu item.
- Removed Core's 17 local primitive files, its old `components.json`, and the obsolete Radix, Vaul, CVA, `clsx`, `next-themes`, and `tailwind-merge` dependencies. Core retains `lucide-react` and `sonner` because feature code imports them directly.
- Extended the repository test runner to discover `.test.tsx` files so the new package-level export test runs through the standard package script.

## Generator provenance and fallback

Created the disposable workspace with the exact required command:

```bash
rtk mktemp -d /tmp/douban-shadcn-baseui.XXXXXX
```

Output:

```text
/tmp/douban-shadcn-baseui.VHNCgl
```

Attempted the exact preset initialization from that directory:

```bash
rtk proxy pnpm dlx shadcn@latest init --preset b7BFbw9b8 --template vite --monorepo
```

The CLI failed with `Socket closed`. Per the task's prescribed fallback, the exact read-only registry loop was then run for all 17 names against `https://ui.shadcn.com/r/styles/base-nova/<name>.json`; all 17 records were returned successfully. Registry-only `IconPlaceholder` references were replaced with their specified Lucide equivalents when mirrored into the repository.

`rtk proxy pnpm install` subsequently succeeded normally. The task's official-registry retry was therefore unnecessary.

## RED

The required package command initially failed before any component implementation:

```bash
rtk proxy pnpm --filter @douban-bridge/ui test
```

The first failure exposed a repository-runner gap: `scripts/test.mjs` only discovered `.test.ts` and `.test.mjs`, so it ignored `primitives.test.tsx`. The runner expression was changed from `ts|mjs` to `tsx?|mjs`.

Running the export test directly then produced the intended missing-implementation failure:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../packages/ui/src/components/avatar.tsx'
tests 1
pass 0
fail 1
```

This demonstrated that the public-path test was active and failed because the first requested primitive did not yet exist.

## GREEN

Package export test:

```bash
rtk proxy pnpm --filter @douban-bridge/ui test
```

Relevant output:

```text
tests 1
pass 1
fail 0
```

The first full workspace run then revealed `React is not defined` in Core SSR. The generated primitives are consumed as TypeScript source by the repository's Node test loader, and `drawer.tsx` uses the `React` namespace at runtime. Preserving runtime React imports at the shared source boundary fixed that loader/runtime mismatch. The focused Core SSR set then passed 17/17.

Fresh full workspace suite after the fix:

```bash
rtk proxy pnpm test
```

Relevant output:

```text
Core:      40 passed
Rex:       43 passed
Stremio:   11 passed
Contracts:  5 passed
UI:         1 passed
Total:    100 passed, 0 failed
```

The existing non-fatal Rex `WidgetMetadata` warning remains unchanged.

Fresh required Core production build:

```bash
rtk proxy pnpm --filter @douban-bridge/core build
```

Relevant output:

```text
client: 2569 modules transformed; built successfully
worker: 3356 modules transformed; built successfully
dist/client/assets/style-IiwuNYwR.css: 93.43 kB
Exit status 0
```

The client bundle also emitted Inter font assets, confirming that the shared stylesheet and package source were included in the production graph.

Additional checks:

```bash
rtk proxy pnpm exec tsc --noEmit --ignoreDeprecations 6.0 --types node -p packages/ui/tsconfig.json
rtk proxy pnpm exec biome check packages/ui <all touched Core TypeScript/TSX files>
rtk rg -n '@radix-ui|from "vaul"|asChild|repositionInputs|data-vaul-|@/components/ui|\.\.?/ui/' apps/core packages/ui --glob '*.ts' --glob '*.tsx'
rtk git diff --check
```

Relevant output:

```text
UI TypeScript: exit 0
Biome: exit 0; no error-level diagnostics (generated class-order/type-import notices only)
Legacy scan: exit 1 with no output, the expected no-match result
git diff --check: exit 0
```

## Self-review

- Counted exactly 17 files under `packages/ui/src/components`, matching the 17 requested public primitive families.
- Confirmed `packages/ui/package.json`, `tsconfig.json`, and the export test match the requested package interface.
- Confirmed the shared stylesheet begins with the required Tailwind, Inter, animation, shadcn, source, and dark-variant declarations and includes the complete preset theme values.
- Confirmed all Core callers use `@douban-bridge/ui/components/*`; the exact legacy scan finds no Radix, Vaul, `asChild`, local UI-path, or removed drawer-attribute residue.
- Confirmed the old Core component directory and `components.json` are deleted and generated `dist` output is not part of the diff.
- Confirmed account-menu and link/button composition preserve semantic elements through Base UI's `render` API.
- Reviewed the scoped diff and dependency lockfile update; no schema, migration, Worker binding, API, or deployment change was introduced.

## Concerns

- `rtk proxy pnpm --filter @douban-bridge/core exec tsc --noEmit` still fails on unrelated existing types in `src/app.tsx`, `src/cron.ts`, `src/libs/api/github.ts`, `src/libs/api/index.ts`, and `src/libs/config.ts`. The new UI package's standalone strict typecheck passes, all tests pass, and the required Core Vite production build passes.
- The successful Core build retains existing warnings about Vite's future native config loader (`__dirname`) and a client chunk over 500 kB. Neither warning was introduced by this migration.
- The canonical shadcn preset initializer was unavailable because its socket closed; the task-authorized deterministic registry fallback supplied the component source instead.
