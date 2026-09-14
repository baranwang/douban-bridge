# Core Entry and Shared Base UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Core 首页改成 Rex 优先的双产品入口，把 Stremio 配置留在 Stremio 域名，并以共享 Base UI 包向 Rex 与 Stremio 提供同一套图片来源配置。

**Architecture:** `packages/contracts` 提供图片来源 schema、类型和默认值，私有源码包 `packages/ui` 提供 shadcn Base UI primitives 与纯受控图片配置组件。Core 继续渲染两个产品网页：`/` 与 `/rex` 属于 Core，Stremio 域名通过现有 Service Binding 渲染 `/configure`；两边保存同一个账号级 `imageProviders`，路由、会话和数据库写入都留在 Core。

**Tech Stack:** pnpm 10 workspace、TypeScript、React 19、Hono、Vite、Tailwind CSS 4、shadcn 4、Base UI、Zod 4、Drizzle D1、Node 内置 test runner、Wrangler 本地运行时。

**Spec:** [2026-09-14-core-entry-product-routing-design.md](../specs/2026-09-14-core-entry-product-routing-design.md)

## Global Constraints

- Core 公开域名是 `https://douban-bridge.baran.wang`；Stremio 公开域名是 `https://stremio-addon-douban.baran.wang`。
- Core 首页只有 Rex 与 Stremio 两个产品入口；Rex 卡片在上，Stremio 卡片在下；`/v1` 不作为第三个产品展示。
- 桌面端卡片内部横向排列；窄屏保持 Rex 在前并让卡片内容纵向回流，键盘焦点顺序与视觉顺序一致。
- shadcn 初始化必须以 `pnpm dlx shadcn@latest init --preset b7BFbw9b8 --template vite --monorepo` 在临时目录运行；preset 固定为 Base UI、Nova、Mist、Emerald、Inter、Lucide。
- `@douban-bridge/ui` 是私有 workspace 源码包，不增加独立发布、独立构建、Storybook、组件注册表、主题框架或文档站。
- `apps/core/src/components/ui/` 的 17 个 primitives 全部替换为 preset 的 Base UI 版本；完成后不得残留 Radix 或 Vaul UI 依赖。
- Base UI 使用 `render` 组合元素；不得保留 Radix 风格的 `asChild`，不得保留 Vaul 的 `repositionInputs` 或 `data-vaul-*` 属性。
- Rex 与 Stremio 共用同一个账号级 `imageProviders` 字段；不新增表、migration 或产品级图片配置字段。
- `packages/ui` 只接受受控 props，不得导入 Core 的 Worker、路由、数据库、session 或 `@/libs/config`。
- `apps/stremio` 继续只做代理与 Stremio 协议，不增加 React 或 `@douban-bridge/ui` 依赖。
- 匿名 URL 配置和非拥有者 SSR 不得包含 Fanart.tv/TMDB 私密凭据；Rex 图片设置写入必须校验 session、Star 权益、同源 Origin 和 Zod payload。
- `/v1`、Stremio manifest/catalog/meta、Rex Widget 参数、数据库 schema 和部署配置保持不变。
- 不执行生产部署、远端 D1 migration、OAuth App 修改或 Widget Release。
- 所有 shell 命令以 `rtk` 开头；仓库文件编辑使用 `apply_patch`；每个提交附带 `Co-authored-by: Codex <noreply@openai.com>`。

---

## 阅读顺序、边界与最终文件归属

规划基线为设计提交 `9be67f6`。这些变化组成单向依赖链，因此使用一份计划：契约先稳定类型，UI 包再替换 primitives，共享图片控件随后迁入，最后才接产品路由和持久化。执行前使用 `superpowers:using-git-worktrees` 建立隔离工作区，建议分支名 `codex/core-entry-base-ui`。

| 最终路径 | 职责 |
| --- | --- |
| `packages/contracts/src/image-providers.ts` | `imageProviderSchema`、`imageProvidersSchema`、`ImageProvider`、`TMDB_IMAGE_LANGUAGE` |
| `packages/ui/package.json`、`components.json`、`tsconfig.json` | 私有源码包、shadcn Base UI 配置和 TypeScript 别名 |
| `packages/ui/src/styles.css` | preset 字体、Tailwind imports、Base UI token 和 UI 源码扫描 |
| `packages/ui/src/components/*.tsx` | 17 个由指定 preset 生成的 primitive family |
| `packages/ui/src/image-provider-sortable/` | 图片来源开关、排序、provider extra 和受测状态转换 |
| `packages/ui/src/tmdb-language-sortable/` | TMDB 图片语言选择与排序 |
| `apps/core/src/routes/web-renderer.tsx` | Core 网页共同的 HTML、Vite client 和共享 stylesheet |
| `apps/core/src/components/portal.tsx`、`routes/portal.tsx` | 无 hydration 的 Core 双产品入口页 |
| `apps/core/src/components/rex/`、`client/rex.tsx`、`routes/rex.tsx` | Rex 密钥与共享图片设置的 SSR/hydration/写入 |
| `apps/core/src/libs/public-origins.ts` | Core/Stremio 页面表面判断、受控 Stremio URL 和固定 auth 返回路径 |
| `apps/core/src/libs/require-web-session.ts` | `/api-keys` 与 Rex 图片写入共用的 session/Origin/Star 守卫 |
| `apps/core/src/routes/configure.tsx`、`components/configure/index.tsx` | 只负责 Stremio 配置、Manifest 与安装 |
| `apps/core/src/routes/auth.ts`、`components/star-banner.tsx` | 根据当前产品表面返回 Rex 或 Stremio |
| `apps/stremio/src/libs/web-proxy.ts` | 只代理 Stremio 网页所需 allowlist，不再代理 Rex API key 路由 |

---

### Task 1: 将图片来源契约移到 `packages/contracts`

**Files:**
- Create: `packages/contracts/src/image-providers.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `apps/core/src/libs/config.ts`
- Modify: `apps/core/src/libs/images.ts`
- Modify: `apps/core/src/libs/api/tmdb/index.ts`
- Modify: `apps/core/src/components/image-provider-sortable/provider-configs.tsx`
- Delete: `apps/core/src/libs/api/tmdb/constants.ts`

**Interfaces:**
- Consumes: Zod 4 and the current three providers: `douban`, `fanart`, `tmdb`.
- Produces: `imageProviderSchema`, `imageProvidersSchema`, generic `ImageProvider<T>`, and mutable `TMDB_IMAGE_LANGUAGE: string[]` from `@douban-bridge/contracts/image-providers`.

- [ ] **Step 1: Add a failing contract test for all provider variants and defaults.**

Append these imports and assertions to `packages/contracts/test/contracts.test.ts`:

```ts
import {
  imageProviderSchema,
  imageProvidersSchema,
  TMDB_IMAGE_LANGUAGE,
} from "../src/image-providers";

test("image provider contract accepts supported providers and rejects unknown providers", () => {
  assert.deepEqual(TMDB_IMAGE_LANGUAGE, ["zh", "en", "ja", "ko", "null"]);
  assert.equal(imageProviderSchema.safeParse({ provider: "douban", extra: {} }).success, true);
  assert.equal(imageProviderSchema.safeParse({ provider: "fanart", extra: { apiKey: "fanart-key" } }).success, true);
  assert.equal(
    imageProviderSchema.safeParse({
      provider: "tmdb",
      extra: { apiKey: "tmdb-token", imageLanguages: ["zh", "en", "null"] },
    }).success,
    true,
  );
  assert.equal(imageProviderSchema.safeParse({ provider: "unknown", extra: {} }).success, false);
  assert.equal(imageProvidersSchema.safeParse([]).success, true);
});
```

- [ ] **Step 2: Run the contracts test and verify the missing module failure.**

Run:

```bash
rtk proxy pnpm --filter @douban-bridge/contracts test
```

Expected: FAIL because `packages/contracts/src/image-providers.ts` does not exist.

- [ ] **Step 3: Add the shared schema and type.**

Create `packages/contracts/src/image-providers.ts` with:

```ts
import { z } from "zod/v4";

export const TMDB_IMAGE_LANGUAGE = ["zh", "en", "ja", "ko", "null"];

const imageProviderDoubanSchema = z.object({
  provider: z.literal("douban"),
  extra: z.object({}),
});

const imageProviderFanartSchema = z.object({
  provider: z.literal("fanart"),
  extra: z.object({ apiKey: z.string().optional() }),
});

const imageProviderTmdbSchema = z.object({
  provider: z.literal("tmdb"),
  extra: z.object({
    apiKey: z.string().optional(),
    imageLanguages: z.array(z.string()).optional(),
  }),
});

export const imageProviderSchema = z.union([
  imageProviderDoubanSchema,
  imageProviderFanartSchema,
  imageProviderTmdbSchema,
]);

export const imageProvidersSchema = imageProviderSchema.array();

type ImageProviderBase = z.output<typeof imageProviderSchema>;

export type ImageProvider<T extends ImageProviderBase["provider"] = ImageProviderBase["provider"]> = Extract<
  ImageProviderBase,
  { provider: T }
>;
```

Export it from both package entry points:

```ts
// packages/contracts/src/index.ts
export * from "./image-providers";
```

```json
// packages/contracts/package.json, inside exports
"./image-providers": "./src/image-providers.ts"
```

- [ ] **Step 4: Replace Core-owned provider declarations with contract imports.**

At the top of `apps/core/src/libs/config.ts`, import and re-export the shared type:

```ts
import { imageProviderSchema } from "@douban-bridge/contracts/image-providers";
export type { ImageProvider } from "@douban-bridge/contracts/image-providers";
```

Delete the three local provider schemas and local `ImageProviderBase`/`ImageProvider` declarations. Keep the existing `configSchema` shape and use the imported schema:

```ts
export const configSchema = z.object({
  catalogIds: z.array(z.string()).default(DEFAULT_COLLECTION_IDS),
  dynamicCollections: z.boolean().default(false).catch(false),
  imageProviders: imageProviderSchema.array().default([{ provider: "douban", extra: {} }]),
});
```

Replace all imports of `apps/core/src/libs/api/tmdb/constants.ts` with:

```ts
import { TMDB_IMAGE_LANGUAGE } from "@douban-bridge/contracts/image-providers";
```

Delete `apps/core/src/libs/api/tmdb/constants.ts` only after `rtk rg -n "api/tmdb/constants|./constants" apps/core/src` returns no callers.

- [ ] **Step 5: Run contract and Core config tests.**

Run:

```bash
rtk proxy pnpm --filter @douban-bridge/contracts test
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/config.test.ts test/api-keys.test.ts
```

Expected: both commands PASS; encoded config output and DB parsing remain unchanged.

- [ ] **Step 6: Commit the shared contract.**

```bash
rtk git add packages/contracts apps/core/src/libs/config.ts apps/core/src/libs/images.ts apps/core/src/libs/api/tmdb apps/core/src/components/image-provider-sortable/provider-configs.tsx
rtk git commit -m "refactor: share image provider contract" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 2: Create `@douban-bridge/ui` and replace every shadcn primitive with Base UI

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/styles.css`
- Create: `packages/ui/src/components/avatar.tsx`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/button-group.tsx`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Create: `packages/ui/src/components/drawer.tsx`
- Create: `packages/ui/src/components/dropdown-menu.tsx`
- Create: `packages/ui/src/components/input-group.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/item.tsx`
- Create: `packages/ui/src/components/native-select.tsx`
- Create: `packages/ui/src/components/separator.tsx`
- Create: `packages/ui/src/components/sonner.tsx`
- Create: `packages/ui/src/components/spinner.tsx`
- Create: `packages/ui/src/components/switch.tsx`
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/components/textarea.tsx`
- Create: `packages/ui/test/primitives.test.tsx`
- Modify: `apps/core/package.json`
- Modify: `apps/core/src/style.css`
- Modify: `apps/core/src/libs/utils.ts`
- Modify: every Core caller returned by `rtk rg -l "components/ui|/ui/" apps/core/src --glob '*.tsx'`
- Delete: `apps/core/components.json`
- Delete: `apps/core/src/components/ui/*.tsx`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the exact output of preset `b7BFbw9b8`; React 19 and Tailwind 4 from the existing Core app.
- Produces: the `@douban-bridge/ui/components/*` subpaths for all 17 primitive families and `@douban-bridge/ui/styles.css`.

- [ ] **Step 1: Add the private package shell and a failing export test.**

Create `packages/ui/package.json`:

```json
{
  "name": "@douban-bridge/ui",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node ../../scripts/test.mjs"
  },
  "exports": {
    "./components/*": "./src/components/*.tsx",
    "./styles.css": "./src/styles.css"
  },
  "dependencies": {
    "@base-ui/react": "^1.8.0",
    "@fontsource-variable/inter": "^5.3.0",
    "class-variance-authority": "^0.7.1",
    "cn": "^0.3.0",
    "lucide-react": "^1.45.0",
    "next-themes": "^0.4.6",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "shadcn": "^4.21.0",
    "sonner": "^2.0.8",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "tsx": "^4.23.13"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ESNext", "DOM"],
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": {
      "@douban-bridge/ui/*": ["./src/*"]
    }
  },
  "include": ["src", "test"]
}
```

Create `packages/ui/test/primitives.test.tsx` with one import per public path:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { Avatar } from "@douban-bridge/ui/components/avatar";
import { Badge } from "@douban-bridge/ui/components/badge";
import { ButtonGroup } from "@douban-bridge/ui/components/button-group";
import { Button } from "@douban-bridge/ui/components/button";
import { Card } from "@douban-bridge/ui/components/card";
import { Drawer } from "@douban-bridge/ui/components/drawer";
import { DropdownMenu } from "@douban-bridge/ui/components/dropdown-menu";
import { InputGroup } from "@douban-bridge/ui/components/input-group";
import { Input } from "@douban-bridge/ui/components/input";
import { Item } from "@douban-bridge/ui/components/item";
import { NativeSelect } from "@douban-bridge/ui/components/native-select";
import { Separator } from "@douban-bridge/ui/components/separator";
import { Toaster } from "@douban-bridge/ui/components/sonner";
import { Spinner } from "@douban-bridge/ui/components/spinner";
import { Switch } from "@douban-bridge/ui/components/switch";
import { Table } from "@douban-bridge/ui/components/table";
import { Textarea } from "@douban-bridge/ui/components/textarea";

test("exports every shared primitive family", () => {
  for (const component of [
    Avatar,
    Badge,
    ButtonGroup,
    Button,
    Card,
    Drawer,
    DropdownMenu,
    InputGroup,
    Input,
    Item,
    NativeSelect,
    Separator,
    Toaster,
    Spinner,
    Switch,
    Table,
    Textarea,
  ]) {
    assert.equal(typeof component, "function");
  }
});
```

- [ ] **Step 2: Install the package shell and verify the primitive test fails.**

Run:

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/ui test
```

Expected: FAIL because `packages/ui/src/components/*.tsx` do not exist.

- [ ] **Step 3: Generate the canonical preset in a disposable directory.**

Run exactly:

```bash
rtk mktemp -d /tmp/douban-shadcn-baseui.XXXXXX
```

Change into the printed directory, then run:

```bash
rtk proxy pnpm dlx shadcn@latest init --preset b7BFbw9b8 --template vite --monorepo
```

In the generated workspace, add the complete incumbent primitive set:

```bash
rtk proxy pnpm dlx shadcn@latest add avatar badge button-group button card drawer dropdown-menu input-group input item native-select separator sonner spinner switch table textarea
```

If the CLI again reports `Socket closed`, use the preset URL below as the source of truth and fetch the 17 component records with this exact read-only command; do not copy registry-only `IconPlaceholder` imports into the repository:

```text
https://ui.shadcn.com/init?base=base&style=nova&baseColor=mist&theme=emerald&iconLibrary=lucide&font=inter&rtl=false&menuAccent=subtle&menuColor=default-translucent&radius=default&chartColor=mist&preset=b7BFbw9b8&template=vite&track=1
```

```bash
rtk node -e '(async()=>{for(const name of ["avatar","badge","button-group","button","card","drawer","dropdown-menu","input-group","input","item","native-select","separator","sonner","spinner","switch","table","textarea"]){const response=await fetch(`https://ui.shadcn.com/r/styles/base-nova/${name}.json`);if(!response.ok)throw new Error(`${name}: ${response.status}`);const item=await response.json();console.log(`\n### ${name}\n${item.files.map((file)=>file.content).join("\n")}`)}})()'
```

- [ ] **Step 4: Mirror the generated Base UI configuration and components into `packages/ui`.**

Use `apply_patch` to add the generated `components.json`, `src/styles.css`, and 17 component files. Preserve the generated Base UI imports such as:

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
```

Resolve internal registry imports to public package paths:

```tsx
import { Button } from "@douban-bridge/ui/components/button";
import { Separator } from "@douban-bridge/ui/components/separator";
```

Replace any registry `IconPlaceholder` with its Lucide equivalent (`CheckIcon`, `ChevronDownIcon`, `ChevronRightIcon`, `CircleIcon`, `CircleCheckIcon`, `InfoIcon`, `Loader2Icon`, `OctagonXIcon`, `TriangleAlertIcon`).

The shared stylesheet must start with these imports/source declarations, followed by the preset's complete `@theme inline`, `:root`, and `.dark` values:

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@source "./";

@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 5: Point Core at the source package and shared stylesheet.**

Add `"@douban-bridge/ui": "workspace:*"` to `apps/core/package.json`. Replace the start of `apps/core/src/style.css` and remove duplicated theme/base declarations so only Core-specific utilities remain:

```css
@import "@douban-bridge/ui/styles.css";
@source "./";

@utility h-safe-b {
  height: env(safe-area-inset-bottom);
}

@utility page-container {
  @apply container mx-auto max-w-3xl;
}
```

In `apps/core/src/libs/utils.ts`, delete the `clsx`, `tailwind-merge`, and `cn` declarations; keep only `isNumeric`.

- [ ] **Step 6: Migrate every primitive import and Base UI composition API.**

Change imports to their matching `@douban-bridge/ui/components/*` subpath, for example `@douban-bridge/ui/components/button`. Replace each polymorphic composition using these exact forms:

```tsx
<Button render={<a href="/auth/github" />}>GitHub 登录</Button>

<Item size="sm" render={<label />}>...</Item>

<DrawerTrigger render={<Item size="sm" />}>...</DrawerTrigger>

<DropdownMenuTrigger render={<Button variant="outline" size="lg" className="flex-1" />}>
  安装
</DropdownMenuTrigger>

<DropdownMenuItem render={<a href={manifestUrlConfigs.stremio} />} onClick={handleImport}>
  导入 Stremio
</DropdownMenuItem>

<InputGroupButton render={<a href="https://fanart.tv/get-an-api-key/" target="_blank" rel="noreferrer" />}>
  获取 API 密钥
</InputGroupButton>
```

For the account menu, make the trigger an explicitly labelled button and make logout a menu item rather than a clickable label:

```tsx
<DropdownMenuTrigger
  aria-label="打开账号菜单"
  render={<button type="button" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}
>
  <Avatar>...</Avatar>
</DropdownMenuTrigger>

<DropdownMenuItem onClick={submitLogout}>退出登录</DropdownMenuItem>
```

Remove `repositionInputs={false}` and every `data-vaul-*` attribute. Remove the Safari-only native switch branch and the now-unused `safari` CSS variant; Base UI owns the switch implementation.

- [ ] **Step 7: Remove the old primitives and dependencies, then update the lockfile.**

After all imports resolve, delete `apps/core/src/components/ui/` and `apps/core/components.json`. Remove these Core dependencies: all `@radix-ui/*`, `vaul`, `class-variance-authority`, `clsx`, `next-themes`, and `tailwind-merge`. Keep `lucide-react` and `sonner` in Core because feature components import them directly.

Run:

```bash
rtk proxy pnpm install
rtk rg -n "@radix-ui|from \"vaul\"|asChild|repositionInputs|data-vaul-|@/components/ui|\.\.?/ui/" apps/core packages/ui --glob '*.ts' --glob '*.tsx'
```

Expected: the search returns no matches.

- [ ] **Step 8: Run package tests and the Core build.**

```bash
rtk proxy pnpm --filter @douban-bridge/ui test
rtk proxy pnpm --filter @douban-bridge/core build
```

Expected: both commands PASS; the build contains CSS for classes used by `packages/ui/src`.

- [ ] **Step 9: Commit the Base UI migration.**

```bash
rtk git add packages/ui apps/core/package.json apps/core/src/style.css apps/core/src/libs/utils.ts apps/core/src/components apps/core/src/routes/dash pnpm-lock.yaml
rtk git commit -m "refactor: migrate shared primitives to Base UI" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 3: Move the shared image provider editor into `packages/ui`

**Files:**
- Create: `packages/ui/src/image-provider-sortable/image-provider-state.ts`
- Create: `packages/ui/src/image-provider-sortable/image-provider-sortable.tsx`
- Create: `packages/ui/src/image-provider-sortable/provider-configs.tsx`
- Create: `packages/ui/src/image-provider-sortable/sortable-provider-item.tsx`
- Create: `packages/ui/src/image-provider-sortable/types.ts`
- Create: `packages/ui/src/image-provider-sortable/index.ts`
- Create: `packages/ui/src/tmdb-language-sortable/language-utils.ts`
- Create: `packages/ui/src/tmdb-language-sortable/sortable-language-item.tsx`
- Create: `packages/ui/src/tmdb-language-sortable/tmdb-language-sortable.tsx`
- Create: `packages/ui/src/tmdb-language-sortable/index.ts`
- Create: `packages/ui/test/image-provider-state.test.ts`
- Modify: `packages/ui/package.json`
- Modify: `apps/core/package.json`
- Modify: `apps/core/src/components/configure/index.tsx`
- Modify: `apps/core/src/components/AGENTS.md`
- Delete: `apps/core/src/components/image-provider-sortable/`
- Delete: `apps/core/src/components/tmdb-language-sortable/`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ImageProvider` and `TMDB_IMAGE_LANGUAGE` from Task 1; Base UI primitives from Task 2.
- Produces: `ImageProviderSortable({ value, onChange, disabled })` from `@douban-bridge/ui/image-providers`; the package remains unaware of Core persistence.

- [ ] **Step 1: Add failing state-transition tests.**

Create `packages/ui/test/image-provider-state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { reorderImageProviders, toggleImageProvider } from "../src/image-provider-sortable/image-provider-state";

const douban = { provider: "douban", extra: {} } satisfies ImageProvider;
const tmdb = { provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } } satisfies ImageProvider;

test("reorders enabled providers by display order", () => {
  assert.deepEqual(reorderImageProviders([douban, tmdb], ["tmdb", "fanart", "douban"]), [tmdb, douban]);
});

test("keeps one provider enabled and appends a newly enabled provider", () => {
  assert.deepEqual(toggleImageProvider([douban], douban, false), [douban]);
  assert.deepEqual(toggleImageProvider([douban], tmdb, true), [douban, tmdb]);
  assert.deepEqual(toggleImageProvider([douban, tmdb], tmdb, false), [douban]);
});
```

- [ ] **Step 2: Run the UI test and verify the missing helper failure.**

```bash
rtk proxy pnpm --filter @douban-bridge/ui test
```

Expected: FAIL because `image-provider-state.ts` does not exist.

- [ ] **Step 3: Implement the minimal provider state helpers.**

Create `packages/ui/src/image-provider-sortable/image-provider-state.ts`:

```ts
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";

export function reorderImageProviders(value: ImageProvider[], displayOrder: string[]): ImageProvider[] {
  const byId = new Map(value.map((provider) => [provider.provider, provider]));
  return displayOrder.flatMap((id) => {
    const provider = byId.get(id);
    return provider ? [provider] : [];
  });
}

export function toggleImageProvider(
  value: ImageProvider[],
  provider: ImageProvider,
  enabled: boolean,
): ImageProvider[] {
  if (enabled) {
    return value.some((item) => item.provider === provider.provider) ? value : [...value, provider];
  }
  return value.length <= 1 ? value : value.filter((item) => item.provider !== provider.provider);
}
```

- [ ] **Step 4: Move the two existing sortable component families and sever Core imports.**

Move the existing component source into the paths listed above. Apply these import rules everywhere in the moved code:

```ts
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { TMDB_IMAGE_LANGUAGE } from "@douban-bridge/contracts/image-providers";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@douban-bridge/ui/components/drawer";
import { Item, ItemActions, ItemContent, ItemSeparator, ItemTitle } from "@douban-bridge/ui/components/item";
```

Use `reorderImageProviders` in `handleDragEnd` and `toggleImageProvider` in `handleToggle`. Keep the current controlled props exactly:

```ts
export interface ImageProviderSortableProps {
  value: ImageProvider[];
  onChange: (providers: ImageProvider[]) => void;
  disabled?: boolean;
}
```

Remove `data-vaul-no-drag`; interactive form controls already stop pointer gesture ownership in Base UI. Use `sortableKeyboardCoordinates` for both `KeyboardSensor` instances, pass `disabled` into each provider row's `useSortable`, add an `调整 ${config.name} 优先级` accessible name to provider drag handles, add an `启用 ${config.name}` accessible name to provider switches, and add an `调整 ${getLanguageDisplayName(code)} 优先级` accessible name to language drag handles. Keep provider order, at-least-one behavior, password reveal-on-focus, TMDB language ordering, and SSR guards unchanged.

```tsx
useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });

const sortable = useSortable({ id: config.id, disabled });

<button type="button" aria-label={`调整 ${config.name} 优先级`} {...attributes} {...listeners} />
<Switch aria-label={`启用 ${config.name}`} checked={isEnabled} disabled={disabled} onCheckedChange={onToggle} />

<button type="button" aria-label={`调整 ${getLanguageDisplayName(code)} 优先级`} {...attributes} {...listeners} />
```

- [ ] **Step 5: Export the shared editor and relocate feature dependencies.**

Add this package export:

```json
"./image-providers": "./src/image-provider-sortable/index.ts"
```

Add these exact dependencies to `packages/ui/package.json`:

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2",
"@douban-bridge/contracts": "workspace:*",
"countries-list": "^3.4.1"
```

Remove `@dnd-kit/*` and `countries-list` from `apps/core/package.json` after Core has no direct imports.

Change the Stremio configure form import to:

```ts
import { ImageProviderSortable } from "@douban-bridge/ui/image-providers";
```

Delete the two old Core directories and update `apps/core/src/components/AGENTS.md` so it points shared primitives and sortable image configuration to `packages/ui`.

- [ ] **Step 6: Run focused tests and prove package isolation.**

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/ui test
rtk proxy pnpm --filter @douban-bridge/core build
rtk rg -n "@/|apps/core|libs/config|CloudflareBindings|hono|drizzle|session" packages/ui/src
```

Expected: tests and build PASS; the final search returns no Core/runtime coupling.

- [ ] **Step 7: Commit the shared image editor.**

```bash
rtk git add packages/ui apps/core/package.json apps/core/src/components/configure/index.tsx apps/core/src/components/AGENTS.md apps/core/src/components/image-provider-sortable apps/core/src/components/tmdb-language-sortable pnpm-lock.yaml
rtk git commit -m "refactor: share image provider settings UI" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 4: Add origin-aware routing and the Rex-first Core portal

**Files:**
- Create: `apps/core/src/routes/web-renderer.tsx`
- Create: `apps/core/src/components/portal.tsx`
- Create: `apps/core/src/routes/portal.tsx`
- Create: `apps/core/test/portal-routing.test.ts`
- Modify: `apps/core/src/libs/public-origins.ts`
- Modify: `apps/core/src/routes/configure.tsx`
- Modify: `apps/core/src/app.tsx`
- Modify: `apps/core/test/oauth-origins.test.ts`

**Interfaces:**
- Consumes: `Card` and `Button` from `@douban-bridge/ui`; `PublicUser` and the current request URL.
- Produces: `isStremioWebRequest(env, requestUrl)`, `toStremioWebUrl(env, requestUrl)`, `portalRoute`, and a reusable `webRenderer`.

- [ ] **Step 1: Add failing portal and redirect tests.**

Create `apps/core/test/portal-routing.test.ts` with the existing `withTestContext` helper and these assertions:

```ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { app } from "../src/app";
import { isStremioWebRequest, toStremioWebUrl } from "../src/libs/public-origins";
import { withTestContext } from "./context";

const CORE = "https://douban-bridge.baran.wang";
const STREMIO = "https://stremio-addon-douban.baran.wang";

function withOrigins(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    DASH_ORIGIN: CORE,
    STREMIO_ORIGIN: STREMIO,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
}

describe("product entry routing", { concurrency: false }, () => {
  test("Core root renders Rex before Stremio without advertising v1", async () => {
    await withTestContext(async (env, ctx) => {
      const response = await app.fetch(new Request(`${CORE}/`), withOrigins(env), ctx);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      const body = await response.text();
      assert.ok(body.indexOf('data-product="rex"') < body.indexOf('data-product="stremio"'));
      assert.equal(body.includes("/v1"), false);
      assert.ok(body.includes('href="/rex"'));
      assert.ok(body.includes(`${STREMIO}/configure`));
    });
  });

  test("Stremio root and Core configure paths redirect to the Stremio domain", async () => {
    await withTestContext(async (env, ctx) => {
      const bindings = withOrigins(env);
      const stremioRoot = await app.fetch(new Request(`${STREMIO}/`), bindings, ctx);
      assert.equal(stremioRoot.status, 307);
      assert.equal(stremioRoot.headers.get("location"), `${STREMIO}/configure`);

      const legacy = await app.fetch(new Request(`${CORE}/abc/configure?from=bookmark`), bindings, ctx);
      assert.equal(legacy.status, 307);
      assert.equal(legacy.headers.get("location"), `${STREMIO}/abc/configure?from=bookmark`);
    });
  });

  test("local ports distinguish Core and Stremio surfaces", () => {
    const env = { DASH_ORIGIN: CORE, STREMIO_ORIGIN: STREMIO };
    assert.equal(isStremioWebRequest(env, "http://localhost:8787/configure"), false);
    assert.equal(isStremioWebRequest(env, "http://localhost:8788/configure"), true);
    assert.equal(toStremioWebUrl(env, "http://localhost:8787/a/configure?q=1"), "http://localhost:8788/a/configure?q=1");
  });
});
```

- [ ] **Step 2: Run the routing test and verify it fails against the current redirect-to-configure behavior.**

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/portal-routing.test.ts
```

Expected: FAIL because Core `/` returns `/configure` and the new helpers do not exist.

- [ ] **Step 3: Implement controlled surface and redirect helpers.**

Add to `apps/core/src/libs/public-origins.ts`:

```ts
type WebOriginEnv = { STREMIO_ORIGIN: string; DASH_ORIGIN: string };

function isLoopback(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function isStremioWebRequest(env: WebOriginEnv, requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return url.origin === env.STREMIO_ORIGIN || (isLoopback(url) && url.port === "8788");
}

export function toStremioWebUrl(env: WebOriginEnv, requestUrl: string): string {
  const request = new URL(requestUrl);
  const origin = isLoopback(request)
    ? `${request.protocol}//${request.hostname}:8788`
    : env.STREMIO_ORIGIN;
  return new URL(`${request.pathname}${request.search}`, origin).toString();
}
```

Only `env.STREMIO_ORIGIN` or the fixed local port may become a redirect target; never read a target origin from a query parameter.

- [ ] **Step 4: Extract the common SSR document renderer.**

Create `apps/core/src/routes/web-renderer.tsx`:

```tsx
import { reactRenderer } from "@hono/react-renderer";
import { Link, ViteClient } from "vite-ssr-components/react";

export const webRenderer = reactRenderer(({ children }) => (
  <html lang="zh">
    <head>
      <ViteClient />
      <Link rel="stylesheet" href="/src/style.css" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
      />
      <link rel="icon" href="/icon.png" />
    </head>
    <body>{children}</body>
  </html>
));
```

Replace the inline renderer in `routes/configure.tsx` with `configureRoute.get("*", webRenderer)`.

- [ ] **Step 5: Build the explicit two-card portal and route.**

Create `Portal` with this public contract and copy; write the Rex card before the Stremio card in JSX rather than generating a product registry:

```ts
export interface PortalProps {
  user?: PublicUser;
  stremioConfigureUrl: string;
}
```

```tsx
<Card data-product="rex" className="flex flex-col gap-5 sm:flex-row sm:items-center">
  <div className="mx-6 mt-6 flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mr-0 sm:mb-6">
    <PanelsTopLeft aria-hidden="true" />
  </div>
  <CardHeader className="min-w-0 flex-1">
    <CardTitle>Rex</CardTitle>
    <CardDescription>
      在 Rex 中浏览豆瓣完整列表与详情。基础模式可直接使用，登录后可启用云端能力。
    </CardDescription>
  </CardHeader>
  <CardFooter className="shrink-0 sm:pl-0">
    <Button className="w-full sm:w-auto" render={<a href="/rex" />}>设置 Rex</Button>
  </CardFooter>
</Card>

<Card data-product="stremio" className="flex flex-col gap-5 sm:flex-row sm:items-center">
  <div className="mx-6 mt-6 flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sm:mr-0 sm:mb-6">
    <Tv aria-hidden="true" />
  </div>
  <CardHeader className="min-w-0 flex-1">
    <CardTitle>Stremio</CardTitle>
    <CardDescription>选择目录并生成 Manifest，然后导入 Stremio 或 Forward。</CardDescription>
  </CardHeader>
  <CardFooter className="shrink-0 sm:pl-0">
    <Button className="w-full sm:w-auto" variant="outline" render={<a href={stremioConfigureUrl} />}>
      配置 Stremio
    </Button>
  </CardFooter>
</Card>
```

Import `PanelsTopLeft` and `Tv` from the existing `lucide-react` dependency. The page header is `Douban Bridge`; the subheading is `把豆瓣目录接入你正在使用的播放器`; the header also links to the GitHub repository. After the two cards, render `登录不是浏览入口的前置条件；仅在同步 Stremio 配置或启用 Rex 云端能力时需要。` An anonymous account action links to `/auth/github`; an authenticated account action links to `/rex` using the GitHub login as its label. Keep the primary action DOM order Rex → Stremio → account.

Create `portalRoute` so Core `/` renders the page with `Cache-Control: private, no-store` while a Stremio-origin `/` returns status 307 to its own `/configure`. The conservative no-store policy prevents an authenticated account label from entering a shared cache. Mount it in `app.tsx` and remove `app.get("/", (c) => c.redirect("/configure"))`.

Use this exact redirect construction so the path changes to `/configure` while the trusted Stremio origin is retained:

```ts
if (isStremioWebRequest(c.env, c.req.url)) {
  const configureUrl = new URL("/configure", c.req.url).toString();
  return c.redirect(toStremioWebUrl(c.env, configureUrl), 307);
}
```

- [ ] **Step 6: Redirect legacy Core configure URLs before rendering or parsing config.**

Add a first middleware to `configureRoute`:

```ts
configureRoute.use("*", async (c, next) => {
  if (!isStremioWebRequest(c.env, c.req.url)) {
    return c.redirect(toStremioWebUrl(c.env, c.req.url), 307);
  }
  await next();
});
```

Change the existing origin test so configure GET/POST use `STREMIO`, while new redirect assertions cover Core. This preserves Stremio POST behavior and prevents Core from serving a second configure page.

- [ ] **Step 7: Run routing, origin, and build checks.**

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/portal-routing.test.ts test/oauth-origins.test.ts
rtk proxy pnpm --filter @douban-bridge/core build
```

Expected: tests and build PASS; Core root is 200, Stremio root is 307, and configure HTML is served only through the Stremio surface.

- [ ] **Step 8: Commit product routing and portal.**

```bash
rtk git add apps/core/src/app.tsx apps/core/src/libs/public-origins.ts apps/core/src/routes/web-renderer.tsx apps/core/src/routes/configure.tsx apps/core/src/routes/portal.tsx apps/core/src/components/portal.tsx apps/core/test/portal-routing.test.ts apps/core/test/oauth-origins.test.ts
rtk git commit -m "feat: add Rex-first product portal" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 5: Add Rex key and shared image settings

**Files:**
- Create: `apps/core/src/libs/require-web-session.ts`
- Create: `apps/core/src/routes/rex.tsx`
- Create: `apps/core/src/client/rex.tsx`
- Create: `apps/core/src/components/rex/index.tsx`
- Create: `apps/core/src/components/rex/api-key-settings.tsx`
- Create: `apps/core/src/components/rex/api-key-action.ts`
- Create: `apps/core/test/rex-settings.test.ts`
- Modify: `apps/core/src/app.tsx`
- Modify: `apps/core/src/routes/api-keys.ts`
- Modify: `apps/core/src/components/configure/index.tsx`
- Modify: `apps/core/test/api-key-action.test.ts`
- Modify: `apps/core/test/api-keys.test.ts`
- Delete: `apps/core/src/components/configure/api-key-settings.tsx`
- Delete: `apps/core/src/components/configure/api-key-action.ts`

**Interfaces:**
- Consumes: shared `ImageProviderSortable`, current `getConfig`/`saveUserConfig`, existing `/api-keys`, `PublicUser`, `webRenderer`.
- Produces: `RexProps { user?: PublicUser; imageProviders: ImageProvider[] }`, GET `/rex`, POST `/rex/image-providers`, and `requireWebSession(c, { requireStar })`.

- [ ] **Step 1: Add failing Rex SSR, persistence, and security tests.**

Create `apps/core/test/rex-settings.test.ts` using the existing `withTestContext`, `getDrizzle`, `users`, `userConfigs`, and Hono JWT `sign` helpers. Cover these exact cases:

```ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { getDrizzle, userConfigs, users } from "../src/db";
import { withTestContext } from "./context";

const CORE = "https://douban-bridge.baran.wang";
const STREMIO = "https://stremio-addon-douban.baran.wang";

function withOrigins(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    DASH_ORIGIN: CORE,
    STREMIO_ORIGIN: STREMIO,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
}

async function insertUser(
  env: CloudflareBindings,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<string> {
  const userId = overrides.id ?? randomUUID();
  await getDrizzle(env).insert(users).values({
    id: userId,
    githubId: Math.floor(Math.random() * 1e9),
    githubLogin: `user-${userId.slice(0, 8)}`,
    githubAvatarUrl: "https://example.com/a.png",
    githubAccessToken: "ghp_REX_SETTINGS_TEST",
    hasStarred: true,
    ...overrides,
  });
  return userId;
}

async function sessionCookie(env: CloudflareBindings, userId: string): Promise<string> {
  const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
  return `token=${token}`;
}

test("Rex page exposes settings only to a starred session", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const anonymous = await app.fetch(new Request(`${CORE}/rex`), bindings, ctx);
    assert.equal(anonymous.status, 200);
    assert.equal((await anonymous.text()).includes('data-section="rex-key-settings"'), false);

    const userId = await insertUser(env, { hasStarred: true });
    const cookie = await sessionCookie(env, userId);
    const owner = await app.fetch(new Request(`${CORE}/rex`, { headers: { Cookie: cookie } }), bindings, ctx);
    const body = await owner.text();
    assert.equal(owner.status, 200);
    assert.ok(body.includes('data-section="rex-key-settings"'));
    assert.ok(body.includes('data-section="image-provider-settings"'));
    assert.equal(owner.headers.get("Cache-Control"), "private, no-store");
  });
});

test("Rex image save preserves Stremio catalog settings", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const userId = await insertUser(env, { hasStarred: true });
    await getDrizzle(env).insert(userConfigs).values({
      userId,
      catalogIds: ["movie_top250"],
      dynamicCollections: true,
      imageProviders: [{ provider: "douban", extra: {} }],
    });
    const response = await app.fetch(
      new Request(`${CORE}/rex/image-providers`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(env, userId),
          Origin: CORE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageProviders: [{ provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } }],
        }),
      }),
      bindings,
      ctx,
    );
    assert.equal(response.status, 200);
    const stored = await getDrizzle(env).query.userConfigs.findFirst({
      where: (rows, { eq }) => eq(rows.userId, userId),
    });
    assert.deepEqual(stored?.catalogIds, ["movie_top250"]);
    assert.equal(stored?.dynamicCollections, true);
    assert.deepEqual(stored?.imageProviders, [
      { provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } },
    ]);
  });
});
```

Add this table-driven authorization and payload test:

```ts
test("Rex image save rejects invalid sessions, origins, entitlement, and providers", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const starredId = await insertUser(env);
    const unstarredId = await insertUser(env, { hasStarred: false });
    const validBody = { imageProviders: [{ provider: "douban", extra: {} }] };
    const cases = [
      { name: "no session", cookie: undefined, origin: CORE, body: validBody, status: 401 },
      {
        name: "cross origin",
        cookie: await sessionCookie(env, starredId),
        origin: STREMIO,
        body: validBody,
        status: 403,
      },
      {
        name: "no Star",
        cookie: await sessionCookie(env, unstarredId),
        origin: CORE,
        body: validBody,
        status: 403,
      },
      {
        name: "unknown provider",
        cookie: await sessionCookie(env, starredId),
        origin: CORE,
        body: { imageProviders: [{ provider: "unknown", extra: {} }] },
        status: 400,
      },
      {
        name: "empty provider list",
        cookie: await sessionCookie(env, starredId),
        origin: CORE,
        body: { imageProviders: [] },
        status: 400,
      },
    ];

    for (const item of cases) {
      const headers = new Headers({ Origin: item.origin, "Content-Type": "application/json" });
      if (item.cookie) headers.set("Cookie", item.cookie);
      const response = await app.fetch(
        new Request(`${CORE}/rex/image-providers`, {
          method: "POST",
          headers,
          body: JSON.stringify(item.body),
        }),
        bindings,
        ctx,
      );
      assert.equal(response.status, item.status, item.name);
    }
  });
});
```

- [ ] **Step 2: Run the Rex test and verify the missing route failure.**

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/rex-settings.test.ts
```

Expected: FAIL because `/rex` and `/rex/image-providers` do not exist.

- [ ] **Step 3: Extract the common web-session write guard.**

Create `apps/core/src/libs/require-web-session.ts`:

```ts
import type { Context, Env } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "@/db";

export function requireWebSession(c: Context<Env>, options: { requireStar?: boolean } = {}): User {
  const user = c.get("user");
  if (!user) throw new HTTPException(401);
  if (c.req.method !== "GET" && c.req.header("Origin") !== new URL(c.req.url).origin) {
    throw new HTTPException(403);
  }
  if (options.requireStar && user.hasStarred !== true) throw new HTTPException(403);
  return user;
}
```

Replace `routes/api-keys.ts`'s local guard with this function. Use `{ requireStar: true }` for key creation, but keep revoke available after Star loss.

- [ ] **Step 4: Add the Rex route and the validated image-only write.**

Define the request schema in `routes/rex.tsx`:

```ts
const rexImageProvidersBodySchema = z.strictObject({
  imageProviders: imageProvidersSchema.min(1),
});
```

The POST handler must preserve the remaining config:

```ts
rexRoute.post("/image-providers", zValidator("json", rexImageProvidersBodySchema), async (c) => {
  const user = requireWebSession(c, { requireStar: true });
  const { imageProviders } = c.req.valid("json");
  const current = await getConfig(c.env, user.id);
  await saveUserConfig(c, user.id, { ...current, imageProviders });
  return c.json({ success: true, imageProviders });
});
```

Apply `Cache-Control: private, no-store` before and after every Rex route response. Copy the existing `/api-keys` `onError` pattern so validation, authorization, and unexpected failures also carry the same header:

```ts
rexRoute.onError((error, c) => {
  c.header("Cache-Control", "private, no-store");
  if (error instanceof HTTPException) {
    const response = error.getResponse();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return c.body(null, 500);
});
```

GET `/rex` loads `getConfig(c.env, user.id).imageProviders` only for the current starred session, converts the user through `toPublicUser`, escapes `<` in `__INITIAL_DATA__`, includes `<Script src="/src/client/rex.tsx" />`, and renders through `webRenderer`.

- [ ] **Step 5: Move API key UI out of the Stremio component tree.**

Move `api-key-settings.tsx` and `api-key-action.ts` to `apps/core/src/components/rex/`; update their Base UI imports and change the setting section title from `API 密钥` to `Rex 密钥`. Remove the `ApiKeySettings` import and JSX block from `components/configure/index.tsx`. Update `test/api-key-action.test.ts` to import:

```ts
import { apiKeyActionUi } from "../src/components/rex/api-key-action";
```

Update the configure SSR test to assert the page does not contain `API 密钥` or `Rex 密钥`.

- [ ] **Step 6: Implement the hydrated Rex settings component.**

Expose this prop contract from `components/rex/index.tsx`:

```ts
export interface RexProps {
  user?: PublicUser;
  imageProviders: ImageProvider[];
}
```

For anonymous and unstarred states, render the existing entitlement explanation and `StarBanner`; do not mount key or image controls. For starred users, wrap `ApiKeySettings` under the heading `Rex 密钥` in `data-section="rex-key-settings"`, and wrap the shared editor under `图片来源` in `data-section="image-provider-settings"`. These attributes are stable SSR test hooks, not styling selectors.

Use local controlled state for the single image field and save it with:

```ts
const response = await fetch("/rex/image-providers", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageProviders }),
});
if (!response.ok) throw new Error("image provider save failed");
const saved = (await response.json()) as { success: true; imageProviders: ImageProvider[] };
setImageProviders(saved.imageProviders);
setSavedImageProviders(saved.imageProviders);
toast.success("图片设置已保存");
```

Initialize `savedImageProviders` from the SSR prop alongside the editable `imageProviders` state. Disable the save button while saving or while `isEqual(imageProviders, savedImageProviders)` is true. Show `保存中…` while active and `保存图片设置` otherwise. On failure, keep the unsaved value and show `保存失败，请稍后重试`.

Create `client/rex.tsx`:

```tsx
import { hydrateRoot } from "react-dom/client";
import { Rex, type RexProps } from "@/components/rex";

const root = document.getElementById("rex");
const initialData = JSON.parse(document.getElementById("__INITIAL_DATA__")?.textContent || "{}") as RexProps;
if (root) hydrateRoot(root, <Rex {...initialData} />);
```

- [ ] **Step 7: Mount the route and run focused security tests.**

Mount `rexRoute` at `/rex` in `app.tsx`, then run:

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/rex-settings.test.ts test/api-keys.test.ts test/api-key-action.test.ts
rtk proxy pnpm --filter @douban-bridge/core build
```

Expected: tests and build PASS; `/rex` never emits an `sk`, and POST modifies only `imageProviders`.

- [ ] **Step 8: Commit Rex settings.**

```bash
rtk git add apps/core/src/app.tsx apps/core/src/libs/require-web-session.ts apps/core/src/routes/api-keys.ts apps/core/src/routes/rex.tsx apps/core/src/client/rex.tsx apps/core/src/components/configure/index.tsx apps/core/src/components/rex apps/core/test/api-key-action.test.ts apps/core/test/api-keys.test.ts apps/core/test/rex-settings.test.ts
rtk git commit -m "feat: add Rex account settings" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 6: Make auth returns and Stremio compatibility product-aware

**Files:**
- Modify: `apps/core/src/libs/public-origins.ts`
- Modify: `apps/core/src/routes/auth.ts`
- Modify: `apps/core/src/routes/configure.tsx`
- Modify: `apps/core/src/client/configure.tsx`
- Modify: `apps/core/src/components/star-banner.tsx`
- Modify: `apps/core/src/components/rex/index.tsx`
- Modify: `apps/core/test/oauth-origins.test.ts`
- Modify: `apps/core/test/api-keys.test.ts`
- Modify: `apps/stremio/src/libs/web-proxy.ts`
- Modify: `apps/stremio/test/web-proxy.test.ts`

**Interfaces:**
- Consumes: request origin, authenticated user id, and explicit `StarBanner` context.
- Produces: `getSignedInPath(env, origin, userId)`, `getSignedOutPath(env, origin)`, and `StarBanner({ user, context })` where context is `"rex" | "stremio"`.

- [ ] **Step 1: Add failing fixed-return-path tests.**

Extend `apps/core/test/oauth-origins.test.ts`:

```ts
import { getSignedInPath, getSignedOutPath } from "../src/libs/public-origins";

test("auth return paths are fixed by product origin", () => {
  const env = { STREMIO_ORIGIN: STREMIO, DASH_ORIGIN: DASH };
  assert.equal(getSignedInPath(env, DASH, "user-id"), "/rex");
  assert.equal(getSignedOutPath(env, DASH), "/");
  assert.equal(getSignedInPath(env, STREMIO, "user-id"), "/user-id/configure");
  assert.equal(getSignedOutPath(env, STREMIO), "/configure");
});
```

Add route assertions that POST logout on Core redirects to `/`, while POST logout on Stremio redirects to `/configure`:

```ts
test("logout returns to the current product", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const core = await app.fetch(new Request(`${DASH}/auth/logout`, { method: "POST" }), bindings, ctx);
    const stremio = await app.fetch(new Request(`${STREMIO}/auth/logout`, { method: "POST" }), bindings, ctx);
    assert.equal(core.status, 302);
    assert.equal(core.headers.get("location"), "/");
    assert.equal(stremio.status, 302);
    assert.equal(stremio.headers.get("location"), "/configure");
  });
});
```

In `apps/stremio/test/web-proxy.test.ts`, change the allowlist expectation for every `/api-keys` method to `false`.

- [ ] **Step 2: Run focused tests and verify the old fixed configure returns fail.**

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/oauth-origins.test.ts
rtk proxy pnpm --filter @douban-bridge/stremio exec node --import tsx --test test/web-proxy.test.ts
```

Expected: FAIL because login/logout always return to configure and Stremio still proxies `/api-keys`.

- [ ] **Step 3: Add fixed auth path helpers and use them in auth routes.**

Add:

```ts
export function getSignedInPath(env: WebOriginEnv, origin: string, userId: string): string {
  return origin === env.STREMIO_ORIGIN ? `/${userId}/configure` : "/rex";
}

export function getSignedOutPath(env: WebOriginEnv, origin: string): string {
  return origin === env.STREMIO_ORIGIN ? "/configure" : "/";
}
```

`getOAuthCredentials` remains the allowlist validation before callback work. In `routes/auth.ts`, replace the hard-coded callback and logout redirects:

```ts
return c.redirect(getSignedInPath(c.env, origin, user.id));
```

```ts
const origin = new URL(c.req.url).origin;
deleteSession(c);
return c.redirect(getSignedOutPath(c.env, origin));
```

- [ ] **Step 4: Give `StarBanner` an explicit product context.**

Change its props to:

```ts
interface StarBannerProps {
  user?: PublicUser;
  context: "rex" | "stremio";
}
```

When the live Star check succeeds, use:

```ts
window.location.href = context === "rex" ? "/rex" : `/${data.userId}/configure`;
```

Use these benefit strings:

```ts
const benefits =
  context === "rex"
    ? ["解锁云端完整列表与详情", "保存图片来源与语言偏好", "支持项目持续开发与维护"]
    : ["配置云同步，修改后无需更换 Manifest 链接", "保存图片来源与语言偏好", "支持项目持续开发与维护"];
```

Pass `context="stremio"` from `client/configure.tsx` and `context="rex"` from the Rex component.

- [ ] **Step 5: Finish Stremio page identity and proxy scope.**

In `routes/configure.tsx`, change the visible page title/description to:

```tsx
<h1 className="text-balance font-bold text-xl tracking-tight">Douban for Stremio</h1>
<p className="text-muted-foreground text-sm">选择目录并生成你的 Stremio Manifest</p>
```

Remove the now-unused `ADDON` import. Keep manifest construction on `STREMIO_ORIGIN`. Keep the existing SSR redaction rule: provider extras appear only when the signed-in starred user owns the configuration.

Remove `/api-keys` from `isWebCompatibilityRoute`; do not add `/rex` or `/rex/image-providers` to the Stremio allowlist. Keep `/`, configure paths, auth, assets, image proxy and tidy-up routes exactly enumerated.

- [ ] **Step 6: Run auth, redaction, proxy, and build checks.**

```bash
rtk proxy pnpm --filter @douban-bridge/core exec node --import tsx --test test/oauth-origins.test.ts test/api-keys.test.ts test/rex-settings.test.ts test/portal-routing.test.ts
rtk proxy pnpm --filter @douban-bridge/stremio exec node --import tsx --test test/web-proxy.test.ts
rtk proxy pnpm --filter @douban-bridge/core build
rtk proxy pnpm --filter @douban-bridge/stremio build
```

Expected: all commands PASS; Stremio config has no key section, provider credentials remain redacted from non-owners, and auth returns to the initiating product.

- [ ] **Step 7: Commit product-aware auth and Stremio cleanup.**

```bash
rtk git add apps/core/src/libs/public-origins.ts apps/core/src/routes/auth.ts apps/core/src/routes/configure.tsx apps/core/src/client/configure.tsx apps/core/src/components/star-banner.tsx apps/core/src/components/rex/index.tsx apps/core/test/oauth-origins.test.ts apps/core/test/api-keys.test.ts apps/stremio/src/libs/web-proxy.ts apps/stremio/test/web-proxy.test.ts
rtk git commit -m "fix: keep product auth flows separate" -m "Co-authored-by: Codex <noreply@openai.com>"
```

---

### Task 7: Update user-facing docs and complete bounded visual verification

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/douban-bridge.md`
- Verify: all files changed in Tasks 1–6

**Interfaces:**
- Consumes: completed portal, Rex settings, Stremio configure page, and two local Worker previews.
- Produces: accurate setup links plus final automated, responsive, accessibility, and mechanical UI evidence; no deployment.

- [ ] **Step 1: Update README links and responsibilities.**

Replace the old statement that Core `/configure` hosts the same page with:

````markdown
Douban Bridge 入口：

```
https://douban-bridge.baran.wang/
```

Stremio 配置始终位于：

```
https://stremio-addon-douban.baran.wang/configure
```
````

Under Rex, change step 1 to `打开 https://douban-bridge.baran.wang/rex，登录并 Star 后生成 sk，同时可设置共用的图片来源。` Keep the unreleased Widget warning unchanged.

- [ ] **Step 2: Update deployment verification without changing deployment commands.**

Add these route checks to `docs/deployment/douban-bridge.md`:

```markdown
- Core `/` 返回 200，Rex 入口在 Stremio 入口之前。
- Core `/configure` 返回到 Stremio 域名的 307；Stremio `/configure` 返回 200。
- Core `/rex` 按 session/Star 状态显示密钥与图片设置；Stremio 域名不代理 `/rex` 或 `/api-keys`。
- `/v1` 继续只接受 Bearer `sk`，不使用网页 cookie。
```

Do not add a deploy, migration, OAuth App, or Release action to this plan.

- [ ] **Step 3: Run the full workspace test and build from a clean command boundary.**

```bash
rtk proxy pnpm test
rtk proxy pnpm build
rtk git diff --check
```

Expected: all workspace tests and builds PASS; `git diff --check` emits no errors.

- [ ] **Step 4: Run final dependency and boundary scans.**

```bash
rtk rg -n "@radix-ui|from \"vaul\"|asChild|repositionInputs|data-vaul-|@/components/ui|\.\.?/ui/" apps/core packages/ui --glob '*.ts' --glob '*.tsx'
rtk rg -n "libs/config|CloudflareBindings|hono|drizzle|session|apps/core" packages/ui/src
rtk rg -n "@douban-bridge/ui|react|react-dom" apps/stremio/package.json apps/stremio/src
```

Expected: all three searches return no matches.

- [ ] **Step 5: Run the Impeccable detector once over the finished UI.**

```bash
rtk node /Users/bytedance/.agents/skills/impeccable/scripts/detect.mjs --json apps/core/src/components/portal.tsx apps/core/src/components/rex apps/core/src/components/configure packages/ui/src
```

Fix all accessibility, overflow, invalid nesting, missing accessible-name, and responsive findings in one batch. Run the detector at most one more time to confirm the batch, then stop polishing.

- [ ] **Step 6: Inspect desktop and narrow layouts through both local Workers.**

Start Core and Stremio in separate terminals:

```bash
rtk proxy pnpm --filter @douban-bridge/core preview
```

```bash
rtk proxy pnpm --filter @douban-bridge/stremio preview
```

Inspect `http://localhost:8787/`, `http://localhost:8787/rex`, and `http://localhost:8788/configure` at 1440×900 and 390×844. Confirm:

- Rex card is first and each desktop card reads horizontally as icon/content/action.
- At 390 px, each card reflows internally without horizontal scroll and keeps a full-width action.
- `/rex` distinguishes anonymous, unstarred, and starred states; failed key status cannot enable generation.
- Image provider drawer opens, focus is visible, Escape closes it, drag handles have accessible names, and keyboard sorting still works.
- Stremio configuration contains catalogs/Manifest/install actions but no API key section.
- Primary action tab order is Rex → Stremio → account and matches their visual order.

- [ ] **Step 7: Commit docs and any bounded QA fixes.**

```bash
rtk git add README.md docs/deployment/douban-bridge.md apps/core packages/ui apps/stremio pnpm-lock.yaml
rtk git commit -m "docs: update Douban Bridge product entry" -m "Co-authored-by: Codex <noreply@openai.com>"
```

- [ ] **Step 8: Record the final repository state without deploying.**

```bash
rtk git status --short
rtk git log -7 --oneline
```

Expected: the worktree is clean and the seven task commits are visible. Stop before any production command.
