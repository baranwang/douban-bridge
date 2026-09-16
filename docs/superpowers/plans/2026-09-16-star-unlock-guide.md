# Star 解锁引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点「去 Star 解锁」时先弹出引导层，用 CSS 仿制的 GitHub 顶栏标出 Star 按钮位置，并补上手动重试出口。

**Architecture:** 在 `StarCta` 与 GitHub 之间插入一个受控 Dialog。`StarCta` 从「直接跳转的锚点」变成「弹层 trigger」，并把原先由父组件持有的 `useStarCheck` 收进自身；两个调用点（`StarBanner`、`ModeComparison`）因此同时获得引导。弹层 footer 的全部状态判断抽成纯函数 `starGuideUi()`，照 `api-key-action.ts` 的既有范式，测试只测纯函数。

**Tech Stack:** React 19、`@base-ui/react` Dialog（经 shadcn `base-nova` 风格生成）、Tailwind v4、SWR、`node:test` + `node:assert/strict`。

**Spec:** `docs/superpowers/specs/2026-09-16-star-unlock-guide-design.md`

## Global Constraints

- UI 文案全部中文。弹层标题固定为 `怎么 Star 这个项目`；未检测到时的提示固定为 `还没检测到 Star，确认已经在 GitHub 上点过了吗？`
- 不改 OAuth scope：`apps/core/src/libs/api/github.ts` 的 `getAuthUrl` 里 `scope: ""` 保持原样。
- 不改后端：`apps/core/src/libs/star.ts`、`apps/core/src/routes/auth.ts` 一行不动。
- 不新增运行时依赖。`@base-ui/react` 已在 `packages/ui/package.json`。
- 不引入截图等二进制资产。示意图必须是 `div` + Tailwind。
- 组件从 `@douban-bridge/ui/components/*` 导入；类名合并用 `cn()`；Tailwind 类顺序需通过 Biome `useSortedClasses`。
- 未登录用户的 CTA 行为不得改变：仍是直连 `/auth/github` 的按钮，不弹层。
- 仓库根目录跑 `pnpm test`。单包可跑 `pnpm --filter @douban-bridge/core test` 或 `pnpm --filter @douban-bridge/ui test`。
- 每个 task 结束时提交，commit message 末尾附 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `packages/ui/src/components/dialog.tsx` | 创建（生成） | shadcn `base-nova` dialog primitive。生成后除修正 import 外不手改 |
| `packages/ui/test/primitives.test.tsx` | 修改 | 把 `Dialog` 纳入「导出了所有共享 primitive」的断言 |
| `apps/core/src/components/star-guide-state.ts` | 创建 | 纯函数 `starGuideUi()`。弹层 footer 的唯一状态判断处，无 React 依赖 |
| `apps/core/test/star-guide-state.test.ts` | 创建 | `starGuideUi()` 的五个场景断言 |
| `apps/core/src/components/star-guide-dialog.tsx` | 创建 | `StarGuideDialog` + 私有 `GithubHeaderMock`（内联同文件） |
| `apps/core/src/components/star-banner.tsx` | 修改 | `useStarCheck` 增加 `checked`/`starred`/`recheck`；`StarCta` 改签名并内持 hook |
| `apps/core/src/components/rex/mode-comparison.tsx` | 修改 | 删掉自持的 `useStarCheck`，改传 `context` |

任务顺序即依赖顺序：Task 1 出 primitive，Task 2 出状态函数，Task 3 才能把两者接进组件。

---
### Task 1: Dialog primitive

`packages/ui` 目前只有 Drawer，没有 Dialog。用 shadcn CLI 生成，不手写。

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`（由 CLI 生成）
- Modify: `packages/ui/test/primitives.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 从 `@douban-bridge/ui/components/dialog` 导出 `Dialog`、`DialogClose`、`DialogContent`、`DialogDescription`、`DialogFooter`、`DialogHeader`、`DialogOverlay`、`DialogPortal`、`DialogTitle`、`DialogTrigger`。
  - `Dialog` 接受 base-ui `Dialog.Root.Props`，含 `open?: boolean` 与 `onOpenChange?: (open: boolean) => void`（受控用法）。
  - `DialogContent` 接受 `Dialog.Popup.Props & { showCloseButton?: boolean }`，默认 `true`；它内部已自带 `DialogPortal` 与 `DialogOverlay`，**调用方不要再手动包一层**。
  - `DialogHeader`、`DialogFooter` 是 `React.ComponentProps<"div">`。

- [ ] **Step 1: 在 `packages/ui` 目录下生成 dialog**

```bash
cd packages/ui && pnpm dlx shadcn@latest add dialog
```

`packages/ui/components.json` 已配好 `style: base-nova`、`baseColor: mist`、`iconLibrary: lucide`，以及 `aliases.ui = @douban-bridge/ui/components`，因此文件会落到 `packages/ui/src/components/dialog.tsx`。命令若询问是否覆盖已有文件，只允许它写 `dialog.tsx`。

- [ ] **Step 2: 检查生成结果的 import**

Run: `head -8 packages/ui/src/components/dialog.tsx`

registry 原文引用了两个仅存在于 shadcn 自己仓库的路径，CLI 应当已改写。逐条确认：

1. `Dialog as DialogPrimitive` 来自 `@base-ui/react/dialog`
2. `cn` 来自 `cn`
3. `Button` 来自 `@douban-bridge/ui/components/button`（不是 `@/registry/...`）
4. 关闭按钮的图标来自 `lucide-react`（不是 `IconPlaceholder`）

第 3、4 条若没被改写，手工改成上述形式——这是唯一允许的手改。改完不要动样式类。

- [ ] **Step 3: 确认导出名与 Interfaces 一致**

Run: `grep -n "^export {" -A 12 packages/ui/src/components/dialog.tsx`
Expected: 十个导出名与上方 Produces 列表完全一致。若不一致，以文件实际导出为准，并同步更新 Task 3 的 import。

- [ ] **Step 4: 把 Dialog 加进 primitives 测试**

`packages/ui/test/primitives.test.tsx` 有一个「导出每个共享 primitive」的断言，逐个列出组件。在 import 区按字母序加入：

```tsx
import { Dialog } from "@douban-bridge/ui/components/dialog";
```

并在测试内的组件数组里，把 `Dialog` 插到 `DropdownMenu` 之前（数组现有顺序为 `Avatar, Badge, ButtonGroup, Button, Card, Drawer, DropdownMenu, ...`，插在 `Drawer` 与 `DropdownMenu` 之间）。

- [ ] **Step 5: 跑 UI 包测试**

Run: `pnpm --filter @douban-bridge/ui test`
Expected: PASS。若报 `Dialog is not a function`，说明 Step 3 的导出名不符，回到 Step 3。

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/dialog.tsx packages/ui/test/primitives.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add dialog primitive

Star 解锁引导需要一个居中弹层，packages/ui 此前只有 Drawer。
用 shadcn base-nova 生成，未手写样式。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 2: `starGuideUi()` 状态函数

弹层 footer 的全部分支判断。做成无 React 依赖的纯函数，组件只消费结果，测试只测这里。范式照 `apps/core/src/components/rex/api-key-action.ts`（先读一眼它，只有 17 行）。

**Files:**
- Create: `apps/core/src/components/star-guide-state.ts`
- Test: `apps/core/test/star-guide-state.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `starGuideUi(input: StarGuideUiInput): StarGuideUiResult`
  - `StarGuideUiInput = { opened: boolean; validating: boolean; checked: boolean; starred: boolean }`
  - `StarGuideUiResult = { label: "打开 GitHub 仓库" | "确认中…" | "我已 Star，立即检查"; disabled: boolean; showNotFound: boolean }`
  - 入参语义：`opened` = 用户是否点过「打开 GitHub 仓库」（即 `useStarCheck` 的 `hasClicked`）；`validating` = SWR 请求进行中；`checked` = 至少完成过一次检查；`starred` = 已 star。

- [ ] **Step 1: 写失败测试**

创建 `apps/core/test/star-guide-state.test.ts`：

```ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { starGuideUi } from "../src/components/star-guide-state";

describe("star guide dialog footer", () => {
  test("还没去 GitHub 时是打开仓库的主按钮", () => {
    const ui = starGuideUi({ opened: false, validating: false, checked: false, starred: false });
    assert.equal(ui.label, "打开 GitHub 仓库");
    assert.equal(ui.disabled, false);
    assert.equal(ui.showNotFound, false);
  });

  test("刚点完按钮、请求尚未起飞也算确认中", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: false, starred: false });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });

  test("请求进行中禁用按钮", () => {
    const ui = starGuideUi({ opened: true, validating: true, checked: false, starred: false });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });

  test("检查完成但仍未 star 时给出手动重试与提示", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: true, starred: false });
    assert.equal(ui.label, "我已 Star，立即检查");
    assert.equal(ui.disabled, false);
    assert.equal(ui.showNotFound, true);
  });

  test("已 star 时保持禁用，避免跳转途中重复点击", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: true, starred: true });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core test`
Expected: FAIL，报无法解析 `../src/components/star-guide-state`。

- [ ] **Step 3: 写最小实现**

创建 `apps/core/src/components/star-guide-state.ts`：

```ts
export interface StarGuideUiInput {
  /** 用户是否已点过「打开 GitHub 仓库」 */
  opened: boolean;
  /** SWR 请求进行中 */
  validating: boolean;
  /** 至少完成过一次 star 检查 */
  checked: boolean;
  starred: boolean;
}

export interface StarGuideUiResult {
  label: "打开 GitHub 仓库" | "确认中…" | "我已 Star，立即检查";
  disabled: boolean;
  showNotFound: boolean;
}

/** 弹层 footer 的唯一判断处。分支按优先级短路，保证入参组合无遗漏。 */
export function starGuideUi({ opened, validating, checked, starred }: StarGuideUiInput): StarGuideUiResult {
  if (!opened) return { label: "打开 GitHub 仓库", disabled: false, showNotFound: false };
  // starred 时页面正在跳转；!checked 覆盖刚点完按钮、SWR 还没起飞的那一拍
  if (starred || validating || !checked) return { label: "确认中…", disabled: true, showNotFound: false };
  return { label: "我已 Star，立即检查", disabled: false, showNotFound: true };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @douban-bridge/core test`
Expected: PASS，五个 case 全绿。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/components/star-guide-state.ts apps/core/test/star-guide-state.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add star guide footer state

弹层 footer 的分支判断抽成纯函数，照 api-key-action 的范式，
组件不做状态判断。!checked 单独短路，避免刚点完按钮时
错误闪出「还没检测到 Star」。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: 引导弹层与 CTA 接线

第一个端到端可见的交付。`StarGuideDialog` 单独存在是死代码，`StarCta` 改签名后不接弹层无法编译，因此两者同属一个 task。

**Files:**
- Create: `apps/core/src/components/star-guide-dialog.tsx`
- Modify: `apps/core/src/components/star-banner.tsx`
- Modify: `apps/core/src/components/rex/mode-comparison.tsx`

**Interfaces:**
- Consumes: Task 1 的 `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle`；Task 2 的 `starGuideUi()`。
- Produces:
  - `StarGuideDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; opened: boolean; validating: boolean; checked: boolean; starred: boolean; onOpenGithub: () => void; onRecheck: () => void })`
  - `useStarCheck(context)` 返回 `{ opened, validating, checked, starred, onStarClick, recheck }` — **不再返回 `checking`**
  - `StarCta(props: { user?: PublicUser; context: StarContext; className?: string })` — **不再接受 `checking` 与 `onStarClick`**

- [ ] **Step 1: 创建 `apps/core/src/components/star-guide-dialog.tsx`**

```tsx
import { Button } from "@douban-bridge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@douban-bridge/ui/components/dialog";
import { Eye, GitFork, Star } from "lucide-react";
import { starGuideUi } from "./star-guide-state";

const REPO_URL = "https://github.com/baranwang/douban-bridge";

const STEPS = ["打开 GitHub 仓库页面", "点击页面右上角的 Star 按钮（如上图）", "回到本页，自动解锁完整模式"];

/** 仿 GitHub 仓库页顶栏，只为让用户认出 Star 按钮的位置，不承载信息，故整块 aria-hidden。 */
const GithubHeaderMock: React.FC = () => (
  <div aria-hidden className="rounded-lg border bg-muted/40 p-3">
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">baranwang /</span>
      <span className="font-semibold">douban-bridge</span>
    </div>
    <div className="mt-3 flex items-center justify-end gap-1.5">
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs">
        <Eye className="size-3" />
        Watch
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs">
        <GitFork className="size-3" />
        Fork
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs ring-2 ring-primary">
        <Star className="size-3 text-primary" />
        Star
      </span>
    </div>
  </div>
);

interface StarGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户是否已点过「打开 GitHub 仓库」 */
  opened: boolean;
  validating: boolean;
  checked: boolean;
  starred: boolean;
  onOpenGithub: () => void;
  onRecheck: () => void;
}

export const StarGuideDialog: React.FC<StarGuideDialogProps> = ({
  open,
  onOpenChange,
  opened,
  validating,
  checked,
  starred,
  onOpenGithub,
  onRecheck,
}) => {
  const { label, disabled, showNotFound } = starGuideUi({ opened, validating, checked, starred });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>怎么 Star 这个项目</DialogTitle>
          <DialogDescription>Star 后回到本页会自动解锁完整模式。</DialogDescription>
        </DialogHeader>

        <GithubHeaderMock />

        <ol className="flex flex-col gap-2 text-sm">
          {STEPS.map((text, index) => (
            <li key={text} className="flex items-start gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <DialogFooter>
          {showNotFound && <p className="text-destructive text-sm">还没检测到 Star，确认已经在 GitHub 上点过了吗？</p>}
          {opened ? (
            <Button disabled={disabled} onClick={onRecheck}>
              {label}
            </Button>
          ) : (
            // 必须是用户直接点击的真实锚点，否则新标签会被浏览器拦截
            <Button render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />} onClick={onOpenGithub}>
              {label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

`DialogContent` 内部已自带 Portal 与 Overlay，不要再包一层。

- [ ] **Step 2: 改 `useStarCheck` 的返回值**

在 `apps/core/src/components/star-banner.tsx` 中，把 `useSWR` 的解构加上 `mutate`，并替换整个 `return` 块：

```tsx
  const { data, isValidating, mutate } = useSWR(
```

```tsx
  return {
    opened: hasClicked,
    validating: isValidating,
    checked: data !== undefined,
    starred,
    onStarClick: useCallback(() => setHasClicked(true), []),
    recheck: useCallback(() => {
      void mutate();
    }, [mutate]),
  };
```

`hasClicked` 门控 SWR key、`starred` 的算法、自动跳转的 `useEffect` 全部保持原样，不要动。原先的 `checking` 字段删除——它唯一的消费者 `StarCta` 在 Step 3 里不再需要它。

- [ ] **Step 3: 改写 `StarCta`**

同文件，用下面这段整体替换现有的 `StarCtaProps` 与 `StarCta`：

```tsx
interface StarCtaProps {
  user?: PublicUser;
  context: StarContext;
  className?: string;
}

/** 未登录 → 去登录；已登录未 Star → 先弹引导层，由用户在层内打开 GitHub。 */
export const StarCta: React.FC<StarCtaProps> = ({ user, context, className }) => {
  const [open, setOpen] = useState(false);
  const { opened, validating, checked, starred, onStarClick, recheck } = useStarCheck(context);

  if (!user) {
    return (
      <Button className={className} render={<a href="/auth/github" />}>
        <Github className="size-4" />
        GitHub 登录
      </Button>
    );
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Star className="size-4" />
        去 Star 解锁
      </Button>
      <StarGuideDialog
        open={open}
        onOpenChange={setOpen}
        opened={opened}
        validating={validating}
        checked={checked}
        starred={starred}
        onOpenGithub={onStarClick}
        onRecheck={recheck}
      />
    </>
  );
};
```

两个 hook 都在 `if (!user)` 之前调用，条件返回不会破坏 hook 顺序。触发按钮刻意不置灰：用户关掉弹层后要能重新打开。

补上 import：

```tsx
import { StarGuideDialog } from "@/components/star-guide-dialog";
```

`Check` 仍被 `StarBanner` 使用，保留；`Star`、`Github`、`useState`、`useCallback`、`useEffect` 均仍在用。

- [ ] **Step 4: 改 `StarBanner` 的调用**

同文件。删除 `StarBanner` 里的 `const { checking, onStarClick } = useStarCheck(context);` 一行，并把渲染改成：

```tsx
        <StarCta user={user} context={context} className="w-full sm:w-auto" />
```

- [ ] **Step 5: 改 `ModeComparison` 的调用**

`apps/core/src/components/rex/mode-comparison.tsx`：删除 `const { checking, onStarClick } = useStarCheck("rex");` 一行，把 import 改为只取 `StarCta`：

```tsx
import { StarCta } from "@/components/star-banner";
```

渲染改成：

```tsx
          <StarCta user={user} context="rex" className="mt-3 w-full" />
```

- [ ] **Step 6: 类型检查与 lint**

Run: `pnpm build`
Expected: 通过。若报 `StarCta` 缺少 `checking`/`onStarClick`，说明还有调用点没改，grep 确认：`grep -rn "StarCta\|useStarCheck" apps/core/src`。预期只剩 `star-banner.tsx` 与 `mode-comparison.tsx` 两处。

Run: `pnpm exec biome check apps/core/src packages/ui/src`
Expected: 通过。类名顺序报错就按 `--write` 修。

- [ ] **Step 7: 跑全量测试**

Run: `pnpm test`
Expected: PASS。

- [ ] **Step 8: 手动验证**

Run: `pnpm dev`，用一个**未 star** 的 GitHub 账号登录后逐条确认：

1. `/rex` 页完整模式卡片里点 CTA → 弹出引导层，不跳转
2. 弹层里能看到仿 GitHub 顶栏，Star 按钮有高亮环
3. 点「打开 GitHub 仓库」→ 新标签打开仓库，弹层不关闭，按钮变为「确认中…」
4. 在 GitHub 上 star 后切回本页 → 自动跳转
5. 撤销 star 重来，第 3 步后不 star 直接切回本页 → 按钮变「我已 Star，立即检查」，点它显示「还没检测到 Star…」，且按钮仍可再点
6. configure 页（`/{userId}/configure`）的 banner 重复第 1、3 步，行为一致
7. 登出后 CTA 仍是「GitHub 登录」，点击直接跳 `/auth/github`，不弹层
8. 系统切到深色模式，示意图仍可读

- [ ] **Step 9: Commit**

```bash
git add apps/core/src/components/star-guide-dialog.tsx apps/core/src/components/star-banner.tsx apps/core/src/components/rex/mode-comparison.tsx
git commit -m "$(cat <<'EOF'
feat(core): guide users to GitHub's star button

此前点 CTA 直接把用户丢到仓库首页，不熟悉 GitHub 的人找不到
右上角的 Star 按钮；自动确认没命中时 CTA 还会永久置灰无从重试。

改为先弹引导层：CSS 仿 GitHub 顶栏标出 Star 位置，三步说明，
层内锚点打开仓库，并提供手动重试。useStarCheck 收进 StarCta，
两个调用点同时获得引导。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

- [ ] 更新 `apps/core/src/components/AGENTS.md`：`NOTES` 段现有一句「`StarBanner` 和 `UserMenu` use imperative browser/form side effects」，补充 `StarCta` 现在自持 `useStarCheck` 并驱动 `StarGuideDialog`；`WHERE TO LOOK` 表加一行指向 `star-guide-state.ts`。改完连同 changeset 一起提交。
- [ ] `pnpm change` 生成 changeset（patch，描述：Star 解锁前增加 GitHub 引导弹层与手动重试）。
