# Star 解锁引导设计

- 日期：2026-09-16
- 状态：方向已确认，本文供书面审阅；尚未实施。
- 源码基线：`8b9c63f`
- 讨论来源：登录后 star 解锁对不熟悉 GitHub 的用户造成困惑。

## 1. 背景与问题

`hasStarred` 是完整模式的开关。未 star 的已登录用户在两处看到同一个 CTA：

- `/rex` 页的 `ModeComparison`（完整模式卡片内）
- Stremio configure 页的 `StarBanner`

两处都渲染 `StarCta`（`apps/core/src/components/star-banner.tsx`）。已登录态下它是一个 `<a target="_blank">`，直接把用户丢到 `https://github.com/baranwang/douban-bridge`，随后 `useStarCheck` 启动 SWR 轮询，靠 `revalidateOnFocus` 在用户切回本页时确认 star 状态并跳转。

两个问题：

1. **不告诉用户到了 GitHub 要做什么。** 仓库首页信息密度很高，Star 按钮在页面右上角的一行小按钮里。不熟悉 GitHub 的用户落地后不知道该点哪里，直接流失。
2. **失败没有出口。** 点过按钮后 `checking` 为真，CTA 变成置灰的「确认中…」。若 `revalidateOnFocus` 没有命中（用户没真的 star、切页方式没触发 focus、请求失败），按钮永远置灰，用户既看不到原因也无法重试。

## 2. 目标与已确认决策

| 项目 | 决策 |
| --- | --- |
| 方向 | 保持跳转 GitHub 的流程，补视觉引导；不改 OAuth scope，不代替用户 star |
| 引导时机 | 点击 CTA 后先弹层讲清楚，用户再主动打开 GitHub |
| 示意图形式 | 手写 CSS 仿 GitHub 顶栏，不用截图 |
| 顺带修复 | 补手动重试，解决「确认中…」卡死 |
| 弹层容器 | 用 `shadcn` 命令新增 `dialog` primitive |

明确不做：不申请 `public_repo` scope，不调 `PUT /user/starred` 代替用户 star（授权页会显示「写入你所有公开仓库」，为一个 star 索要该权限会劝退更多人）；不改后端、不改 `libs/star.ts`、不改 `/auth/check-star`；不引入截图资产。

## 3. 目标流程

```
未登录 → CTA 仍是直连 /auth/github 的按钮，不弹层（本轮不变）

已登录未 star：
点 CTA「去 Star 解锁」
  └→ 打开 StarGuideDialog（不跳转）
       ├ GitHub 顶栏示意图，Star 按钮高亮
       ├ 三步文字说明
       └ footer 主按钮「打开 GitHub 仓库」= 真实 <a target="_blank">
            └→ 新标签打开 GitHub + 启动轮询；弹层保持打开，footer 主按钮换成「我已 Star，立即检查」
                 ├ 用户切回本页 → revalidateOnFocus 自动确认 → 跳转目标页
                 └ 未自动命中 → 手动点检查
                      ├ 已 star → 跳转目标页
                      └ 仍未 star → 显示「还没检测到 Star」，按钮可重复点击
```

示意图与三步文字在等待态**继续显示**。用户此刻正在 GitHub 上找按钮，这是引导最该在场的时机；等待态只替换 footer 按钮，不切换主体内容。

`打开 GitHub 仓库` 必须是弹层内的真实锚点元素，由用户点击触发，因此不会被浏览器弹窗拦截。

## 4. 组件与职责

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `packages/ui/src/components/dialog.tsx` | 新增 | `pnpm dlx shadcn@latest add dialog` 生成。`components.json` 已配 `base-nova` 风格，`@base-ui/react` 是现有依赖。生成后不手工修改 |
| `apps/core/src/components/star-guide-dialog.tsx` | 新增 | 导出 `StarGuideDialog`；私有 `GithubHeaderMock` 内联于同文件 |
| `apps/core/src/components/star-guide-state.ts` | 新增 | 纯函数 `starGuideUi()`，弹层 footer 的全部状态判断 |
| `apps/core/src/components/star-banner.tsx` | 修改 | `StarCta` 内部自持 `useStarCheck`；登录态渲染为弹层 trigger；`useStarCheck` 增加手动重试 |
| `apps/core/test/star-guide-state.test.ts` | 新增 | `starGuideUi()` 的状态断言 |

**`StarCta` 是唯一改动入口。** `StarBanner` 与 `ModeComparison` 都渲染它，改一处两个页面同时拿到引导。

### 4.1 `StarCta` 签名变更

当前 `StarBanner` 和 `ModeComparison` 各自调用 `useStarCheck(context)`，再把 `checking` 与 `onStarClick` 作为 props 传给 `StarCta`，两个父组件都不为自己使用这些值。

把 `useStarCheck` 收进 `StarCta` 内部，签名从：

```
{ user, checking, onStarClick, className }
```

改为：

```
{ user, context, className }
```

两个调用点都因此变短，`ModeComparison` 不再需要 import `useStarCheck`。

### 4.2 `useStarCheck` 变更

保留 `hasClicked` 门控 SWR key 的现有结构，从 `useSWR` 多取 `mutate` 作为手动重试入口。对外返回：

| 字段 | 含义 |
| --- | --- |
| `checking` | 请求进行中或已确认 star（沿用现值） |
| `checked` | 至少完成过一次检查（`data` 已存在） |
| `starred` | 已 star |
| `onStarClick` | 标记已点击，启用轮询 |
| `recheck` | 手动触发重新校验（`mutate`） |

自动跳转的 `useEffect` 不变。

### 4.3 `starGuideUi()`

照 `apps/core/src/components/rex/api-key-action.ts` 的既有范式：组件不做状态判断，判断收进纯函数，测试只测纯函数。

输入 `{ opened, validating, checked, starred }`，输出 footer 需要的 `{ label, disabled, showNotFound }`。

`opened` 指用户是否已点过「打开 GitHub 仓库」，即 `useStarCheck` 的 `hasClicked`。判定按以下优先级短路，保证输入组合无遗漏：

1. `!opened` → `打开 GitHub 仓库`，可点击，不显示提示
2. `starred` → `确认中…`，禁用（页面正在跳转，禁用避免重复点击）
3. `validating || !checked` → `确认中…`，禁用。`!checked` 覆盖刚点完按钮、SWR 尚未起飞的那一拍
4. 其余（`checked && !starred && !validating`）→ `我已 Star，立即检查`，可点击，显示未检测到提示

对应场景：

| 场景 | opened | validating | checked | starred | label | disabled | showNotFound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 刚弹出，还没去 GitHub | false | false | false | false | 打开 GitHub 仓库 | false | false |
| 刚点完按钮，请求未起飞 | true | false | false | false | 确认中… | true | false |
| 已打开 GitHub，等待中 | true | true | false | false | 确认中… | true | false |
| 检查完成，仍未 star | true | false | true | false | 我已 Star，立即检查 | false | true |
| 检查完成，已 star | true | false | true | true | 确认中… | true | false |

### 4.4 `GithubHeaderMock`

纯 `div` + Tailwind，仿 GitHub 仓库页顶部：仓库名一行，Watch / Fork / Star 按钮一行，Star 按钮加 `ring-2 ring-primary` 高亮。

- 用现有设计 token（`bg-muted`、`border`、`text-foreground`），自动跟随深浅色模式
- 高亮用 `ring` 而非绘制箭头：箭头需要绝对定位，`ring` 只需一个 class
- 整块 `aria-hidden`，真实信息在三步文字中，读屏用户不依赖图形
- 与 GitHub 实际界面必然存在色差。识别依靠布局与「Star」字样，不追求像素级还原；GitHub 改版后视觉会漂移，届时手工调整

因为只是标记性质的静态标签，保持内联在 `star-guide-dialog.tsx`。若后续增长或需要复用，再按 `components/AGENTS.md` 的约定拆出独立文件。

## 5. 文案

弹层标题：`怎么 Star 这个项目`

三步：

1. 打开 GitHub 仓库页面
2. 点击页面右上角的 Star 按钮（如上图）
3. 回到本页，自动解锁完整模式

未检测到时的提示：`还没检测到 Star，确认已经在 GitHub 上点过了吗？`

沿用仓库现有中文文案风格。

## 6. 错误处理

| 情况 | 行为 |
| --- | --- |
| 用户没有真的 star | 手动检查返回未 star，显示提示，按钮可重复点击 |
| `/auth/check-star` 请求失败 | SWR 保留上次结果，按钮回到可点击状态，用户可重试；不把失败当成未 star |
| 用户关闭弹层 | 轮询状态保留在 `useStarCheck` 内，`revalidateOnFocus` 继续生效；再次点 CTA 可重新打开弹层 |
| 浏览器拦截新标签 | 不会发生：锚点由用户在弹层内直接点击，属于用户手势 |

## 7. 测试

`apps/core/test/star-guide-state.test.ts` 用 `node:test` + `node:assert/strict` 断言第 4.3 节的五个场景，与 `api-key-action.test.ts` 同构。

不为 `StarGuideDialog` 与 `GithubHeaderMock` 写渲染测试：两者是无分支的静态标签，全部分支已在 `starGuideUi()` 中被覆盖。不给 `useStarCheck` 加 hook 渲染测试，仓库目前没有该类基础设施，引入的成本高于收益。

## 8. 验收

- `/rex` 与 configure 页的未 star 已登录用户，点 CTA 都先看到引导弹层
- 弹层内可见 GitHub 顶栏示意图，Star 按钮有高亮
- 点「打开 GitHub 仓库」在新标签打开仓库，弹层不关闭，footer 变为手动检查按钮
- 在 GitHub 上 star 后切回本页，自动跳转到目标页
- 未 star 时点手动检查，显示未检测到提示且按钮仍可点击
- 未登录用户的 CTA 行为不变
- 深浅色模式下示意图均可读
- `pnpm test` 通过
