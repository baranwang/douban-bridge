# COMPONENTS KNOWLEDGE BASE

## OVERVIEW

React UI for the configure page and dashboard fragments. Shared primitives and sortable image settings live in
`packages/ui`.

## STRUCTURE

```text
components/
+-- configure/                  # main configure form + local context
+-- *-drawer.tsx                # drawer-based catalog pickers
`-- user/star/section wrappers  # small feature components
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Configure form | `configure/index.tsx` | `@tanstack/react-form`, `form.Field`, `form.Subscribe` |
| Configure context | `configure/context.ts` | currently only `isStarredUser` |
| Image provider order | `packages/ui/src/image-provider-sortable/` | shared dnd-kit list plus provider registry |
| TMDB language order | `packages/ui/src/tmdb-language-sortable/` | shared language/country helpers plus sortable rows |
| Shared primitives | `packages/ui/src/components/` | import through `@douban-bridge/ui/components/*` |
| Drawers | `genre-drawer.tsx`, `yearly-ranking-drawer.tsx` | compose the shared drawer and item primitives |

## CONVENTIONS

- Feature files normally export one component per file.
- `packages/ui/src/components/` follows shadcn primitive-family style; multi-export files are allowed there.
- Feature folders use `index.ts` barrels when consumed externally.
- Compose UI from `@douban-bridge/ui/components/*` before creating new primitives.
- Use `cn()` for class merging; keep Tailwind class order compatible with Biome sorted-classes.
- Sortable folders split into main sortable component, sortable row item, types/helpers, and barrel export.
- Keep provider/language priority semantics: earlier array items have higher priority.
- Configure-page forms should stay inside `@tanstack/react-form` fields/subscriptions.

## ANTI-PATTERNS

- Do not add browser-only access during SSR render. Guard `window`, `navigator`, and DOM APIs inside effects/events or client-only paths.
- Do not copy the large inline style of `configure/index.tsx` for new complex UI; split new subcomponents into separate files.
- Do not add provider registries in Core; `packages/ui/src/image-provider-sortable/provider-configs.tsx` is the shared
  extension point.
- Do not copy shared primitives or sortable image configuration back into Core; extend `packages/ui` instead.
- Do not change sortable ordering without preserving drag/drop item identity and priority ordering.

## NOTES

- `StarBanner` and `UserMenu` use imperative browser/form side effects; keep that pattern isolated.
- `provider-configs.tsx` contains an embedded helper component; prefer extracting future helpers if they grow.
- UI text is primarily Chinese; preserve existing locale unless the surrounding component is already English.
