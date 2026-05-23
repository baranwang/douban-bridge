# COMPONENTS KNOWLEDGE BASE

## OVERVIEW

React UI for the configure page, dashboard fragments, shadcn primitives, and sortable option editors.

## STRUCTURE

```text
components/
+-- ui/                         # shadcn-style primitives; multi-export families allowed
+-- configure/                  # main configure form + local context
+-- image-provider-sortable/    # dnd-kit provider ordering + per-provider config UI
+-- tmdb-language-sortable/     # dnd-kit TMDB language ordering helpers
+-- *-drawer.tsx                # drawer-based catalog pickers
`-- user/star/section wrappers  # small feature components
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Configure form | `configure/index.tsx` | `@tanstack/react-form`, `form.Field`, `form.Subscribe` |
| Configure context | `configure/context.ts` | currently only `isStarredUser` |
| Image provider order | `image-provider-sortable/` | dnd-kit list plus provider registry |
| TMDB language order | `tmdb-language-sortable/` | language/country helpers plus sortable rows |
| Shared item rows | `ui/item.tsx` | preferred row/list composition primitive |
| Form controls | `ui/input-group.tsx`, `ui/native-select.tsx`, `ui/switch.tsx` | use existing wrappers first |
| Drawers | `genre-drawer.tsx`, `yearly-ranking-drawer.tsx`, `ui/drawer.tsx` | Vaul/shadcn drawer composition |

## CONVENTIONS

- Feature files normally export one component per file.
- `src/components/ui/` follows shadcn primitive-family style; multi-export files are allowed there.
- Feature folders use `index.ts` barrels when consumed externally.
- Compose UI from `src/components/ui/` before creating new primitives.
- Use `cn()` for class merging; keep Tailwind class order compatible with Biome sorted-classes.
- Sortable folders split into main sortable component, sortable row item, types/helpers, and barrel export.
- Keep provider/language priority semantics: earlier array items have higher priority.
- Configure-page forms should stay inside `@tanstack/react-form` fields/subscriptions.

## ANTI-PATTERNS

- Do not add browser-only access during SSR render. Guard `window`, `navigator`, and DOM APIs inside effects/events or client-only paths.
- Do not copy the large inline style of `configure/index.tsx` for new complex UI; split new subcomponents into separate files.
- Do not add new mixed config-plus-render registries like `image-provider-sortable/provider-configs.tsx` unless the registry is the actual extension point.
- Do not move shadcn primitive families into one-component-per-file just to satisfy the root rule; they are the exception.
- Do not change sortable ordering without preserving drag/drop item identity and priority ordering.

## NOTES

- `StarBanner` and `UserMenu` use imperative browser/form side effects; keep that pattern isolated.
- `provider-configs.tsx` contains an embedded helper component; prefer extracting future helpers if they grow.
- UI text is primarily Chinese; preserve existing locale unless the surrounding component is already English.
