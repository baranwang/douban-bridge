# Douban Bridge 部署与回滚

本文记录两个 Worker 的资源归属、按顺序发布和回滚。**本轮未获授权执行生产部署、注册 OAuth App、写入生产 secrets、或执行首次 npm publish。** 下列命令在成品审阅并获得执行授权后再跑。不要把本文当成这些动作已经完成。

本环境未登录 Cloudflare，因此 **未执行** `wrangler secret list` 与生产控制台核对。下表名称来自仓库 Wrangler 配置与代码引用；vars 与 secrets 不要把值抄进文档。

## 实际配置清单

| Worker | 资源与凭据 |
| --- | --- |
| core（Worker `douban-bridge-core`，域名 `douban-bridge.baran.wang`） | 原 D1 `STREMIO_ADDON_DOUBAN`（`database_name` `stremio-addon-douban`，`database_id` 见 `apps/core/wrangler.jsonc`）、原 KV `KV`（id 见同文件；dash basic auth 读取 KV 键 `DASH_USER` / `DASH_PASS`）、`PUBLIC_RATE_LIMIT` / `USER_RATE_LIMIT`、`ASSETS`、`DOUBAN_API_KEY` / `TRAKT_CLIENT_ID` / `TMDB_API_KEY` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `JWT_SECRET`、两个 public origin（`STREMIO_ORIGIN` / `DASH_ORIGIN`）、cron `0 * * * *`、queue `douban-agent-match`（binding `AGENT_MATCH_QUEUE`）。公开 `/v1` 只认 Bearer `sk` |
| stremio（`stremio-addon-douban`，旧 custom domain `stremio-addon-douban.baran.wang`） | `CORE_STREMIO` → `StremioEntrypoint`、`CORE_WEB` → 默认入口、`PUBLIC_RATE_LIMIT` / `USER_RATE_LIMIT`、旧 custom domain。无 D1 / KV / cron / 上游凭据 |

当前 `apps/core/wrangler.jsonc` 的 **vars**（明文配置，不是 secret）：`DOUBAN_API_KEY`、`TRAKT_CLIENT_ID`、`GITHUB_CLIENT_ID`、`STREMIO_ORIGIN`、`DASH_ORIGIN`、`AGENT_MATCH_MODEL`。代码还读取以下名称，它们应作为 **secrets**（或尚未配置）：`JWT_SECRET`、`GITHUB_CLIENT_SECRET`、`TMDB_API_KEY`、`AGENT_MATCH_BASE_URL`、`AGENT_MATCH_API_KEY`、`EXA_API_KEY`；可选 `FANART_API_KEY` / `TRAKT_CLIENT_SECRET`。获得授权后用下面命令核对实际存在的名称，**不要把值写入仓库或本文**：

```bash
rtk proxy pnpm --filter @douban-bridge/core exec wrangler secret list
rtk proxy pnpm --filter @douban-bridge/stremio exec wrangler secret list
```

core 保持原 `JWT_SECRET`，使旧 cookie 仍能校验。不从部署日志恢复秘密。旧 Worker 切换完成后清除残留 secrets，确认 stremio **最终不再持有**上游 credentials。

授权后核对 vars / secrets 时，以命令输出的名称为准；上表中部分上游 key 可能属于 vars。

## 本地联调（非生产）

构建顺序：core → stremio → rex-widget。`pnpm deploy` **不会**一次部署全部 Worker，也不会应用远端 migration。

```bash
rtk proxy pnpm --filter @douban-bridge/core build
rtk proxy pnpm --filter @douban-bridge/stremio build
rtk proxy pnpm --filter @rexnow/douban build
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 migrations apply stremio-addon-douban --local --persist-to ../../.wrangler/bridge-smoke
```

两个独立终端（均 `--persist-to ../../.wrangler/bridge-smoke`，禁止 remote bindings）：

```bash
rtk proxy pnpm --filter @douban-bridge/core preview
rtk proxy pnpm --filter @douban-bridge/stremio preview
rtk proxy node scripts/smoke.mjs
```

core preview 使用 Vite 构建后 `.wrangler/deploy/config.json` 指向的配置，并覆盖 `STREMIO_ORIGIN=http://localhost:8788`、`DASH_ORIGIN=http://localhost:8787`。stremio 使用源 Wrangler 配置。本地 HTTP 只验证 router 与字段；真实 OAuth / Secure Cookie 在 HTTPS 环境验证，不宣称本地登录通过。

`scripts/smoke.mjs` 使用本地 URL 与一次性 D1 账号，不打印 `sk`。其中带 Bearer 的 catalog / meta 请求会走公网豆瓣（若预览进程在跑）。包内 Node 测试使用 mock 数据源，二者不是同一种证据。

本环境实测：`wrangler d1 migrations apply --local --persist-to ../../.wrangler/bridge-smoke` **exit 1**（`0000` 为注释 dump，`0001` 找不到 `user_configs`）。smoke 用与 Node 测试相同的 SQL 展开写入 persist。CLI 的 persist 目录是 `.wrangler/bridge-smoke/v3/`；`getPlatformProxy({ persist: { path } })` 必须指向该 `v3` 路径才能与 preview 共用 D1。对 `apps/core/wrangler.jsonc` 直接 `getPlatformProxy` 会占用 Worker 名 `douban-bridge-core`，适配器变为 `[not connected]`；smoke 用相同 D1 `database_id`、不同 `name` 的临时配置。preview 需 `--local-upstream localhost:<port>`，否则请求 origin 是 custom domain，和本地 `STREMIO_ORIGIN=http://localhost:8788` 不一致。core preview 不能把 `--config` 直接指到 `.wrangler/deploy/config.json` 指针文件，应解析它指向的 `dist/douban_bridge_core/wrangler.json`。

本轮 **未执行** `wrangler secret list`（环境无 Cloudflare 登录）。

## 生产步骤（须逐条获授权后执行）

根 `pnpm deploy` 只转发 core 包的 deploy script，**不要**用它做完整切换。远端 migration 必须单独应用。

### 1. 只读记录

记录旧 Worker（当前生产名 `stremio-addon-douban`）deployment / version ID；导出 D1 备份到**工作区外**受控位置；记录 D1 / KV ID、OAuth callback 和当前 cron。此时只读。

```bash
rtk proxy pnpm --filter @douban-bridge/stremio exec wrangler deployments list
rtk proxy pnpm --filter @douban-bridge/stremio exec wrangler versions list
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 info stremio-addon-douban
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 export stremio-addon-douban --remote --output /path/outside-workspace/stremio-addon-douban-backup.sql
```

OAuth callback 与 cron 从现网 Worker / GitHub OAuth App 读取，不在此写入。

### 2. 增量迁移

待应用 SQL 现在还包括 `apps/core/drizzle/0004_agent_matching.sql`（给 `douban_mapping` 加 `agent` 列）。先 `migrations list --remote`，确认 pending 列表后再应用到远端。不要用 fresh-local `migrations apply` 当 rehearsal：`0000` 是 introspect 注释 dump，本地空库 apply 会失败，不能代表远端增量。开启 agent 队列前必须先有 `AGENT_MATCH_BASE_URL` 和 `AGENT_MATCH_API_KEY`；`EXA_API_KEY` 缺了会让 Exa 工具失败。

```bash
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 migrations list stremio-addon-douban --remote
rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 migrations apply stremio-addon-douban --remote
```

### 3. 首次部署 core（禁用 cron）

为 core 配置现有 D1 / KV / rate limits / ASSETS / 现有 secrets / 两个 origin。把 dash 基本认证写入 KV 键 `DASH_USER` 与 `DASH_PASS`（不要把值写入仓库或本文）。`verifyUser` 在二者任一缺失时 **fail-open**（返回 true，本地空 KV 仍能打开 dash）；生产必须两键都在，否则 dash 无密码可进。在**现有** GitHub OAuth App 上增加 callback `https://douban-bridge.baran.wang/auth/github/callback`（保留旧 Stremio callback），两个公开域名共用 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。首次部署验证：无 Bearer 的 `/v1` 为 401 且 `Cache-Control: private, no-store`；cookie 不能代替 `sk`。

首次 core 部署先把 `apps/core/wrangler.jsonc` 的 `triggers.crons` 设为空（或不部署该字段），**保留旧 Worker 的唯一 cron**，避免两个写入者重叠。上传 core 后验证：默认入口拒绝 `/v1/*` 与 `/stremio/manifest`；dash HTTPS、OAuth、`/icon.png` 与 `/assets/*` 正常；KV 中 `DASH_USER` 与 `DASH_PASS` 均已配置，未配置时 dash 会 fail-open。

- Core `/` 返回 200，Rex 入口在 Stremio 入口之前。
- Core `/configure` 返回到 Stremio 域名的 307；Stremio `/configure` 返回 200。
- Core `/rex` 按 session/Star 状态显示密钥与图片设置；Stremio 域名不代理 `/rex` 或 `/api-keys`。
- `/v1` 继续只接受 Bearer `sk`，不使用网页 cookie。

```bash
rtk proxy pnpm --filter @douban-bridge/core exec wrangler secret bulk  # 仅当授权写入 secrets
rtk proxy pnpm --filter @douban-bridge/core deploy
```

### 4. 数据与 api_keys

验证旧 users / config / mappings 仍能读取。在网页生成、替换、撤销 `sk`，确认 `api_keys` 只有摘要。

### 5. 部署 stremio 覆盖原 Worker 名称

原域名继续指向这个 Worker。新配置不含 D1 / KV / cron。核对旧安装、登录、配置、图片后，从旧 Worker 清除多余 secrets。

```bash
rtk proxy pnpm --filter @douban-bridge/stremio deploy
rtk proxy pnpm --filter @douban-bridge/stremio exec wrangler secret list
```

### 6. 把 cron 放到 core

确认旧 Worker 已无 cron，再将 `0 * * * *` 放回 core 并部署。观察一次正常运行。生产期间最多一份映射 cron。

```bash
rtk proxy pnpm --filter @douban-bridge/core deploy
```

### 7. Widget 发版（Changesets，对齐 rex-widget）

Widget 不走 GitHub Release 手工上传，也不随 `pnpm deploy` 发布。流程与 [baranwang/rex-widget](https://github.com/baranwang/rex-widget) 相同：

1. 功能 PR 在根目录执行 `pnpm changeset`，只给 `@rexnow/douban` 写变更（core / stremio / contracts 已 ignore）。
2. 合并进 `main` 后，[`.github/workflows/release.yml`](../../.github/workflows/release.yml) 若有未消费的 changeset，会开 `chore: version packages` PR。
3. 合并该版本 PR 后，同一 workflow 执行 `pnpm run release`（先构建 Widget，再 `changeset publish`）。
4. 首次发布前在 npm 为 `@rexnow/douban` 配置 Trusted Publisher（OIDC）或写入 `NPM_TOKEN`。空 token 时 workflow 会去掉 `_authToken`，以便走 OIDC。
5. Rex 导入 `https://unpkg.com/@rexnow/douban`。发布前该 URL **404 是预期**；本地 `dist/` 存在不等于分发成功。`changesets/action` 会同时建 GitHub Release（changelog），那不是旧的 `douban-bridge.js` 资源下载。

Workers 仍按上面 1–6 步手动 `wrangler deploy`。

## 回滚

1. 先停发新 Widget 流量（再发一个 patch 覆盖 `latest`，必要时 `npm deprecate`；不要 unpublish。必要时停 `/v1` 或 Worker）。
2. 若回滚旧 Stremio Worker 版本：先停 core cron（清空 `triggers.crons` 后 `rtk proxy pnpm --filter @douban-bridge/core deploy`），再恢复旧 Worker 部署及其旧绑定 / secrets / cron。
3. 新加 `api_keys` 表和 `douban_mapping.agent` 列可保留。**不能 DROP 原表**，也**不能用旧备份覆盖用户新配置**。回滚 agent 队列时先停 cron / 清空 `queues.consumers`，再撤 `AGENT_MATCH_BASE_URL` / `AGENT_MATCH_API_KEY` / `EXA_API_KEY`。
4. 若旧 Worker secrets 已清理，从受控备份恢复后再回滚。
5. 保留 core 及其 D1 / KV 直到旧路由验证通过，最后再处理不再使用的部署。

回滚旧 Stremio 版本：

```bash
rtk proxy pnpm --filter @douban-bridge/stremio exec wrangler rollback
```

具体 version ID 使用步骤 1 记录的值。`wrangler rollback` 的精确参数以获授权时的 Wrangler 帮助为准。
