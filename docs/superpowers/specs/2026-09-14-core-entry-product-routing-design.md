# Douban Bridge Core 入口与产品分流设计

- 日期：2026-09-14
- 状态：方向已确认，本文供书面审阅；尚未实施。
- 源码基线：`1d312ca`
- 讨论来源：Core 入口页评估与已确认的横向卡片方案。

## 1. 背景与问题

项目已经把 Stremio 协议路由拆到 `apps/stremio`，并把 Rex 使用的 `/v1` 云端接口并入 `apps/core`。但公开网页仍沿用拆分前的产品入口：

- `douban-bridge.baran.wang/` 直接跳转到 `/configure`；
- `/configure` 是 Stremio 目录、Manifest 与安装页面；
- Rex 使用的 `sk` 管理被放在同一个 Stremio 配置表单中；
- Stremio Worker 为兼容旧域名，把 `/`、`/configure`、登录和静态资源转发给 Core。

因此服务边界已经拆开，用户感知的产品边界仍然混在一起。Core 主域名看起来像 Stremio 配置站，而不是同时承载 Stremio 与 Rex 的 Douban Bridge 门户。

## 2. 目标与已确认决策

Core 主域名成为统一产品门户。首次访问先选择使用方式，不强制登录。

| 项目 | 决策 |
| --- | --- |
| 用户侧产品 | 只有 Stremio 与 Rex 两个入口 |
| `/v1` | Rex 的内部云端支撑能力，不作为第三个“开发者 API”产品展示 |
| 首页顺序 | Rex 在前，Stremio 在后 |
| 首页布局 | 两张横向卡片上下排列；窄屏保持 Rex 在上并改为卡片内纵向回流 |
| Stremio 配置 | 归属 `stremio-addon-douban.baran.wang` |
| Rex 密钥 | 归属 Core 的 Rex 页面 |
| 登录 | 仅在用户需要同步 Stremio 配置或启用 Rex 云端能力时出现 |

本轮不新增通用开发者控制台、API 文档产品、套餐、设备管理、多密钥管理或新的数据库模型。

## 3. 公开路由与职责

| 域名与路径 | 目标行为 | 归属 |
| --- | --- | --- |
| `douban-bridge.baran.wang/` | 返回统一入口页，200 | Core 门户 |
| `douban-bridge.baran.wang/rex` | Rex 说明、登录 / Star 引导与 `sk` 管理 | Core / Rex |
| `douban-bridge.baran.wang/configure` | 重定向到 Stremio 域名的同一路径 | 兼容入口 |
| `douban-bridge.baran.wang/:config/configure` | 保留 `:config` 和查询参数，重定向到 Stremio 域名 | 兼容入口 |
| `douban-bridge.baran.wang/v1/*` | 保持现有 Bearer `sk` 接口，不出现在产品导航 | Rex 后端 |
| `stremio-addon-douban.baran.wang/` | 重定向到本域名 `/configure` | Stremio |
| `stremio-addon-douban.baran.wang/configure` | 返回 Stremio 配置页，200 | Stremio |
| `stremio-addon-douban.baran.wang/:config/configure` | 返回指定配置的 Stremio 配置页，200 | Stremio |
| Stremio manifest/catalog/meta | 保持现有协议与旧安装兼容 | Stremio |

Stremio 的配置 React 代码可以继续由 Core Worker 渲染并通过 `CORE_WEB` Service Binding 提供。需要拆分的是公开入口、页面职责和跳转语义，不需要为了目录归属复制数据库、登录逻辑或整套页面代码到 `apps/stremio`。

Core 根据原始请求 URL 的 origin 判断页面表面。现有 `CORE_WEB.fetch(c.req.raw)` 会保留 Stremio 域名的原始 URL，因此同一 Core 路由可以安全地区分：

- Core origin 请求 `/configure`：跳转到 `STREMIO_ORIGIN`；
- Stremio origin 请求 `/configure`：直接渲染配置页面；
- Core origin 请求 `/`：渲染门户；
- Stremio origin 请求 `/`：跳转到本域名 `/configure`。

## 4. Core 首页

首页是分流页，不是仪表盘，也不是长篇营销页。首屏包含：

1. 顶部：`Douban Bridge`、GitHub 链接，以及按会话状态显示的登录或账号入口。
2. 主标题：说明该服务把豆瓣目录带到用户使用的播放器。
3. Rex 横向卡片：位于第一行，说明基础模式无需密钥，云端完整列表与详情需要登录生成 Rex 密钥；主操作为“设置 Rex”。
4. Stremio 横向卡片：位于第二行，说明目录选择、Manifest 生成及 Stremio / Forward 安装；主操作为“配置 Stremio”。
5. 次级账号说明：登录不是进入首页的前置条件，只用于配置同步和 Rex 云端能力。

桌面端每张卡片使用“图标 — 说明 — 操作”的横向阅读顺序。窄屏保持 DOM 顺序不变，将操作按钮回流到说明下方并占满可用宽度。键盘焦点顺序必须与视觉顺序一致：Rex、Stremio、账号操作。

首页使用现有 Tailwind token、按钮和卡片原语，不新增设计系统、图标包或客户端状态库。页面内容可由 SSR 直接输出；除非复用现有交互式用户菜单确有必要，首页本身不要求单独 hydration。

## 5. Rex 页面

`/rex` 是 Rex 接入与云端能力页面，不出现 Stremio 的目录开关、Manifest 或安装动作。

页面按状态显示：

- 未登录：解释 Rex 基础模式可直接使用；云端完整列表与详情需要 GitHub 登录并满足现有 Star 权益。
- 已登录但未 Star：复用现有实时 Star 检查能力，引导完成 Star；成功后返回 `/rex`。
- 已登录且已 Star：显示是否已有 Rex 密钥，并提供生成 / 替换、一次性展示与复制、撤销操作。
- 密钥状态加载失败：保留现有重试能力，不能把未知状态误显示为“没有密钥”。
- Widget 尚未发布：只链接 GitHub Releases 或明确标注尚未发布，不提供已知会 404 的版本资源按钮。

`ApiKeySettings` 及其动作状态从 Stremio `configure` 组件树中移出并由 Rex 页面使用。`/api-keys` 的鉴权、同源写保护、摘要存储和一次性明文返回保持不变。

首个实现不新增 Rex 独立图片偏好。现有账号 `imageProviders` 仍由 Stremio 配置页保存，Rex 云端请求继续读取同一账号配置。只有确认两个产品需要不同图片策略时，才单独设计产品级配置字段和迁移。

## 6. Stremio 配置页面

Stremio 配置页继续负责：

- `catalogIds`；
- `dynamicCollections`；
- 现有 `imageProviders`；
- 配置保存 / 编码；
- Manifest 复制与 Stremio / Forward 安装；
- 登录、Star 与配置云同步。

页面移除 API 密钥区块以及“API 请求限额”这类没有说明 Rex 语境的文案。标题与描述明确使用 `Douban for Stremio`，安装 URL 继续始终指向 `STREMIO_ORIGIN`。

匿名编码配置、用户 UUID 配置、敏感图片提供方凭据不向非拥有者 SSR 泄露等现有行为保持不变。

## 7. OAuth 与会话返回路径

现有 OAuth 回调和登出固定跳转 `/configure`，必须改为按请求 origin 选择返回路径：

| 请求来源 | 登录成功 | 登出 |
| --- | --- | --- |
| Core origin | `/rex` | `/` |
| Stremio origin | `/:userId/configure` | `/configure` |

首版不增加任意 `next` 参数、跨域共享 Cookie 或新的 OAuth state 结构。两个公开 origin 已由 `getOAuthCredentials` 白名单校验，使用 origin 对应的固定返回路径即可覆盖本次入口分流，并避免开放重定向。

Star 状态刷新后的前端跳转同样按当前页面语境处理：Rex 页面回 `/rex`，Stremio 页面回 `/:userId/configure`。

## 8. 组件与数据边界

最小结构如下：

```text
Core portal
  /                 SSR 首页
  /rex              SSR + 密钥管理 hydration
  /auth/*            按 origin 返回
  /api-keys          现有账号密钥接口
  /v1/*              Rex 云端数据接口

Stremio surface
  /configure         Core 渲染，Stremio 域名呈现
  /:config/configure Core 渲染，Stremio 域名呈现
  manifest/catalog/meta
```

实现时优先复用现有 `Card`、`Button`、`StarBanner`、`UserMenu`、`ApiKeySettings` 和 SSR/hydration 模式。仅在 `StarBanner` 的文案及成功跳转需要区分 Rex / Stremio 时增加一个明确的页面语境参数，不建立通用导航框架、页面注册表或配置驱动渲染层。

数据库表、`configSchema`、`/v1` 契约、Rex Widget 参数及 Stremio 协议响应不变。

## 9. 安全、错误与兼容要求

- 跨域跳转目标只能来自 `STREMIO_ORIGIN`，不能接受请求参数提供的任意 origin。
- Core 的 `/:config/configure` 兼容跳转保留路径段和查询参数，不解码后重新拼接敏感配置内容。
- `/api-keys` 继续要求会话，并对写请求执行同源检查。
- SSR 只传递 `PublicUser`；GitHub access token、图片提供方私钥和 `sk` 不进入 HTML。
- Stremio Worker 的网页兼容代理仍采用明确 allowlist，不扩大为任意 Core 路径代理；`/rex` 不需要暴露在 Stremio 域名。
- `/v1` 继续跳过 Cookie 会话鉴权，只接受 Bearer `sk`，响应保持 `private, no-store`。
- 旧 Core `/configure` 书签获得可理解的单次跳转；旧 Stremio 安装和配置 URL 不变。

## 10. 验收与测试

新增或调整最小可运行检查：

1. Core origin `/` 返回 200，正文中 Rex 位于 Stremio 之前，且不把 `/v1` 宣传为产品。
2. Stremio origin `/` 返回到本域名 `/configure` 的重定向。
3. Core origin `/configure` 与 `/:config/configure` 跳转到 `STREMIO_ORIGIN`，保留配置路径及查询参数。
4. Stremio origin 的两种 configure 路径仍返回 200，并继续生成 Stremio 域名的 Manifest URL。
5. Stremio 配置 SSR 不再包含 API 密钥管理区块。
6. `/rex` 在匿名、未 Star、已 Star 三种会话状态下显示正确入口；SSR 不包含任何密钥明文。
7. Rex 密钥状态加载失败时显示重试，不允许生成动作抢先启用。
8. OAuth 登录成功、登出和 Star 刷新分别按 Core / Stremio origin 返回正确页面。
9. Stremio `web-proxy` allowlist、既有 API key 安全测试、匿名 UUID 配置脱敏测试继续通过。
10. 桌面与窄屏截图确认横向卡片、Rex 优先顺序、按钮回流、无横向溢出，并运行 UI 机械检查。

实施完成后运行根级 `pnpm test` 与 `pnpm build`。本设计不授权部署、远端迁移、OAuth App 修改或 Widget Release。

## 11. 非目标与后续触发条件

本轮跳过：

- 独立开发者 API 门户；
- 将配置 React / OAuth / D1 逻辑复制到 Stremio Worker；
- Core 与 Stremio 的跨域共享登录；
- Rex 专属目录选择页面；
- Stremio / Rex 分开的图片配置表；
- 通用 `next` 跳转机制；
- Widget 发布与生产部署。

只有出现第三个真实用户侧客户端、外部 API 消费者、产品间不同图片偏好或多设备密钥需求时，才重新评估对应扩展。

本文获书面确认后，再编写逐文件、逐测试的实施计划；确认计划后才修改业务代码。
