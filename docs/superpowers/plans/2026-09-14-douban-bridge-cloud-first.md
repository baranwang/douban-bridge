# Douban Bridge Cloud-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 Stremio 安装和配置的前提下，拆分三个 Worker，并交付使用云端列表、云端详情和本地基础回退的 Rex Widget。

**Architecture:** `core` 独占 D1、业务 KV、上游凭据和 cron，同时提供管理网页。`stremio` 与 `api` 通过不同的命名 Service Binding 入口调用 `core`，分别负责协议适配。静态 Widget 只调用公开 HTTP 接口或本地数据源。

**Tech Stack:** pnpm workspace、TypeScript、现有 Hono / React / Vite / Cloudflare Workers / Drizzle / Zod；测试使用 Node 内置 test runner、tsx 和 Wrangler 本地运行时。

**Spec:** [2026-09-13-rex-cloud-first-design.md](../specs/2026-09-13-rex-cloud-first-design.md)

## Global Constraints

- `stremio`：`stremio-addon-douban.baran.wang`。
- `core`：`douban-bridge-dash.baran.wang`。
- `api`：`douban-bridge-api.baran.wang`。
- D1、业务 KV、上游服务凭据和定时校正任务只配置在 `core`。
- 两个适配 Worker 使用 Cloudflare Service Bindings 调用 `core`，不绕经公开域名。
- 首版使用绑定的 `fetch` 传递普通 Request / Response，不引入 JSON-RPC 或客户端 RPC 框架。
- 保留原有安装地址、配置路径及客户端行为；不要求现有用户重新安装或填写 `sk`。
- 有效 `sk` 时直接请求云端完整列表；详情与列表相同：云端优先，本地兜底。
- 普通成功请求只使用云端路径，不同时发起一份本地豆瓣请求。
- 云端成功时以云端的图片字段为准。
- 云端返回合法空列表时返回空列表，不把正常分页结束当成故障。
- 当前每页 20 条；Rex 的 `page` 从 1 开始时，转换为 `skip = (page - 1) * 20`，使用 `offset` 时直接传入 `skip`。
- `GET /v1/catalog/:collectionId` → `{ items: [...] }`；`GET /v1/meta/:doubanId` → `{ item: ... }`；两者均使用 `Authorization: Bearer <sk>`。
- `core` 与 `api` 都不缓存整份个性化最终响应，对外使用 `Cache-Control: private, no-store`。
- 路径中不包含原始密钥，也不把用户的图片提供方凭据传到客户端。
- 不增加片源抓取、视频托管、观看记录同步、云片单规则引擎、私人豆瓣 Cookie 托管或通用 RPC / SDK 产品。
- 不添加 Drizzle 外键，不手写生成的 migration snapshots；执行前引入测试 runner/config，文档阶段不运行应用构建。
- 所有 shell 命令以 `rtk` 开头；提交保持签名并附带 `Co-authored-by: Codex <noreply@openai.com>`。

---

## 阅读顺序、边界与交付顺序

规划基线是 `a3d4337`，工作树无应用代码改动。本计划只写文档；下面的命令、代码和外部配置是实施时的工作。

这几个 app 共享同一套映射和配置，属于一个依赖链，因此使用一份计划。任务 1 先验证宿主假设；任务 2–7 建立可独立验证的服务边界；任务 8–9 完成 Widget；任务 10 联调和准备部署。不得将任务 1 的 Node 模拟结果写成 Rex 实测结论。

执行时先使用 `superpowers:using-git-worktrees` 建立隔离工作区，分支使用 `codex/douban-bridge-cloud-first`。以下路径相对于该工作区，实际文件链接应使用执行工作区的绝对路径。

### 文件归属

| 现有文件 / 新文件 | 最终位置与职责 |
| --- | --- |
| `src/db/`、`src/cron.ts`、`src/libs/api/` | 移到 `apps/core/src/` 对应位置，保留数据库和上游行为 |
| `src/client/`、`src/components/`、`src/style.css` | 移到 `apps/core/src/` 对应位置，继续 SSR + hydration |
| `src/routes/configure.tsx`、`auth.ts`、`dash/`、`image-proxy.ts` | 移到 `apps/core/src/routes/`，公开网页与图片路由 |
| `src/libs/config.ts`、`session.ts`、`images.ts`、`middleware/context.ts` | 移到 `apps/core/src/libs/`，继续使用 core 的 bindings |
| `src/routes/catalog.ts`、`meta.ts`、`manifest.ts` | 先随源码搬入 core，任务 7 再移到 `apps/stremio/src/routes/` 并去掉 DB / provider imports |
| `src/libs/router.ts`、`response-cache.ts` | 任务 7 移到 `apps/stremio/src/libs/`，仅用于旧协议 |
| `src/libs/catalog.ts` | 留在 `apps/core/src/libs/catalog.ts`，负责账号目录和动态集合解析 |
| `src/libs/collections.ts` | 数据定义移到 `packages/contracts/src/collections.ts`，core 原位置仅重导出 |
| `public/`、`drizzle/`、`drizzle.config.ts`、`vite.config.ts`、`tsconfig.json`、`components.json` | 移入 `apps/core/`；修正相对路径和 schema 路径 |
| `wrangler.jsonc` | 移入 `apps/core/`，任务 7 切换 Worker 名称、路由与入口 |
| 新建 `packages/contracts/src/index.ts` | API 字段、校验 schema、查询类型；不导出服务端配置或 credentials |
| 新建 `packages/contracts/src/stremio.ts` | 内部 Stremio 数据契约，保留旧响应需要的字段 |
| 新建 `packages/contracts/src/addon.ts` | 从根 `package.json` 读取原插件 metadata，防止 workspace 包名改变 manifest ID |
| 新建 `apps/core/src/services/catalog.ts`、`metadata.ts` | 批量读取映射、缺失项补全、配置选图和详情数据投影 |
| 新建 `apps/core/src/libs/api-key.ts` | 密钥生成、摘要和认证；只有 core 可访问 |
| 新建 `apps/core/src/routes/api-keys.ts`、`internal-api.ts`、`internal-stremio.ts` | 会话写操作、Bearer 数据路由、旧配置数据路由，三个独立 router |
| 新建 `apps/core/src/app.tsx`、修改 `index.tsx` | app.tsx 组装网页；index.tsx 只导出 fetch、scheduled 和两个命名入口 |
| 新建 `apps/api/src/index.ts` | 公开 API 校验、CORS、IP 限流、绑定转发，独立构建配置 |
| 新建 `apps/stremio/src/index.ts`、`libs/core-client.ts`、`libs/web-proxy.ts` | 旧协议入口、内部数据请求、明确列举的兼容网页路由 |
| 新建 `apps/rex-widget/src/basic.ts`、`cloud.ts`、`index.ts` | 本地数据、云端回退、宿主适配；不导入 core 或 Node runtime |
| 新建 `apps/rex-widget/scripts/build.mjs` | 单文件静态脚本构建和 manifest 生成 |
| 新建 `tools/rex-probe/` | 仅开发使用的宿主能力探针，最终 Widget 不导入 |
| 新建 `scripts/test.mjs`、`scripts/smoke.mjs` | 测试文件发现、跨 Worker HTTP 验证 |
| 新建 `docs/testing/rex-host.md`、`docs/deployment/douban-bridge.md` | 实测结果及部署 / 回滚操作 |

根 `AGENTS.md`、README、Biome 配置、lockfile、根 `package.json` 留在根目录。子目录 `AGENTS.md` 随对应目录移动。每个 Worker 分别生成 `worker-configuration.d.ts`，不在多个包间共享全局 `CloudflareBindings` 声明。

### 固定内部接口

`ApiEntrypoint` 接收与公开 API 相同的路径，由 core 验证 Bearer；图片路径使用现有账号图片权限。`StremioEntrypoint` 只接收下列 GET 路径，`config` 是原 UUID / 编码配置，`origin` 只接受部署配置列出的 Stremio origin 和本地测试 origin：

| 内部路径 | 输出 |
| --- | --- |
| `/stremio/manifest?config=...` | `StremioManifestData`：缺 config 时仅 `{ redirectConfig }`，有 config 时 `{ catalogs }` |
| `/stremio/catalog/:collectionId?config=...&skip=...&genre=...&origin=...` | `{ items: StremioCatalogItem[] }` |
| `/stremio/meta/:doubanId?config=...&origin=...` | `{ item: StremioDetailItem }`；保持旧详情只查映射 / 入待处理记录的行为 |

这些内部路径不挂到 core 默认入口。网页兼容绑定使用 core 默认入口，只能由 Stremio 的 allowlist router 转发，不能接受任意目标 URL。

## Task 1: 验证 Rex 列表、详情和凭证生命周期

**Files:**
- Create: `tools/rex-probe/probe.js`
- Create: `tools/rex-probe/server.mjs`
- Create: `docs/testing/rex-host.md`

**Interfaces:**
- Consumes: Rex 官方 `Widget.http.get`、`Widget.tmdb.get` 与候选 `Widget.storage.get/set/remove` 能力；后者目前只有本地 SDK 声明。
- Produces: 经目标 Rex 版本验证的 `id/type/link` 组合、`loadDetail(link)` 调用方式、凭证存取方式、模块缓存设置和网络失败行为。后续 Widget 只使用记录为通过的组合。

- [ ] **Step 1: 建立可辨别的宿主探针，而不是开始业务适配。**

`probe.js` 先使用以下候选组合；这是实验输入，不是已确认的生产协议：

```js
WidgetMetadata = {
  id: "douban.bridge.probe",
  title: "Douban Bridge 验证",
  version: "0.0.1",
  requiredVersion: "0.0.1",
  detailCacheDuration: 0,
  globalParams: [{ name: "sk", title: "测试密钥", type: "input" }],
  modules: ["a", "b"].map((id) => ({
    id, title: `验证 ${id}`, functionName: "probeList", cacheDuration: 0,
    params: [
      { name: "base", title: "探针地址", type: "input" },
      { name: "page", title: "页码", type: "page" },
      { name: "kind", title: "条目类型", type: "enumeration", value: "detail",
        enumOptions: ["detail", "tmdb", "imdb", "douban"].map((value) => ({ title: value, value })) },
    ],
  })),
};
async function probeList(params) {
  Widget.storage.set("douban.bridge.probe.key", params.sk || "");
  Widget.storage.set("douban.bridge.probe.base", params.base);
  const response = await Widget.http.get(`${params.base}/item`, {
    headers: { Authorization: `Bearer ${params.sk || ""}` },
  });
  const item = response.data;
  return [{ ...item, type: params.kind,
    id: params.kind === "tmdb" ? 278 : params.kind === "imdb" ? "tt0111161" : "1292052",
    link: `${params.base}/meta/1292052` }];
}
async function loadDetail(link) {
  const sk = Widget.storage.get("douban.bridge.probe.key") || "";
  const response = await Widget.http.get(link, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  return response.data;
}
```

探针只使用字面量测试密钥 `probe-a` / `probe-b`；不得输入真实 `sk`。不要添加 `videoUrl` 来让实验通过。

- [ ] **Step 2: 建立本地 HTTP fixture，记录次数而不记录 Authorization 值。**

`server.mjs` 使用 `node:http`、`node:fs/promises`、`node:os`：监听 `0.0.0.0:8789`；GET `/probe.js` 返回相邻脚本；`/item` 与 `/meta/1292052` 返回以下条目，其中详情的 description 改成 `cloud-detail-v2`。`/poster.svg` 返回带大字 `CLOUD V2` 的 SVG；`/fail` 返回 503；`/slow` 延迟 45 秒返回。记录 `{pathname, status, authenticated: header === "Bearer probe-a"}`，并为每个路径累计次数。

```js
const item = {
  id: "1292052", type: "detail", title: "云端探针标题 V2",
  mediaType: "movie", description: "cloud-list-v2", rating: "8.8",
  posterPath: `${origin}/poster.svg`, backdropPath: `${origin}/poster.svg`,
  link: `${origin}/meta/1292052`,
};
```

`origin` 由收到请求的 Host 生成；启动时从 `networkInterfaces()` 输出本机非内部 IPv4 地址及 `/probe.js` 完整 URL。这个 server 只服务上述固定路径，未列举路径返回 404，不代理任意 URL。运行：`rtk proxy node tools/rex-probe/server.mjs`。

```js
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
const counts = new Map();
createServer(async (req, res) => {
  const origin = `http://${req.headers.host}`;
  const path = new URL(req.url, origin).pathname;
  counts.set(path, (counts.get(path) || 0) + 1);
  console.log(JSON.stringify({ pathname: path, count: counts.get(path),
    authenticated: req.headers.authorization === "Bearer probe-a" }));
  res.setHeader("Cache-Control", "no-store");
  if (path === "/probe.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(await readFile(new URL("./probe.js", import.meta.url))); return;
  }
  if (path === "/poster.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#123456"/><text x="40" y="450" fill="white" font-size="64">CLOUD V2</text></svg>'); return;
  }
  if (path === "/fail") { res.writeHead(503).end(); return; }
  if (path === "/slow") await new Promise((resolve) => setTimeout(resolve, 45000));
  if (!["/item", "/meta/1292052", "/slow"].includes(path)) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ id: "1292052", type: "detail", title: "云端探针标题 V2", mediaType: "movie",
    description: path.startsWith("/meta/") ? "cloud-detail-v2" : "cloud-list-v2", rating: "8.8",
    posterPath: `${origin}/poster.svg`, backdropPath: `${origin}/poster.svg`, link: `${origin}/meta/1292052` }));
}).listen(8789, "0.0.0.0", () => {
  for (const entries of Object.values(networkInterfaces())) for (const entry of entries || [])
    if (entry.family === "IPv4" && !entry.internal) console.log(`http://${entry.address}:8789/probe.js`);
});
```

上面的 setTimeout 只存在于 Node fixture server，不进入 Rex 脚本。若宿主图片加载器不显示 SVG，改用已知能加载的两张现有 PNG 图片继续验证，不能把 SVG 解码失败当成自定义图片功能失败。

- [ ] **Step 3: 在目标 Rex 中导入打印出的脚本地址并操作两个模块。**

依次验证四种候选 type；每次记录条目 ID、可见标题 / 图片、点击后是否调用 `/meta/1292052`、媒体识别是否仍是 TMDB 278。检查 `globalParams` 是否实际传入两个模块；若仅模块 params 生效，把同名 `sk` 参数放入两个模块再测。不能仅凭实验条目出现在列表判定通过。

- [ ] **Step 4: 关闭并重新打开 Rex，从历史详情直接打开条目；替换及清空测试密钥。**

确认 storage 可跨脚本运行保留凭证，清空参数能删除旧值，详情 URL 不携带密钥，历史详情仍调用云端。若宿主提供受支持的直接全局参数读取方式，优先记录并使用该方式；不得用全局 JS 变量冒充持久配置。重复切换模块、账号、后台封面版本后，检查下一次请求是否真实发生。

- [ ] **Step 5: 测量 503、断网和 `/slow` 的实际失败时间。**

让 probeList 的请求路径分别改为 `/fail`、`/slow` 并在 HTTP 调用前后记录 `Date.now()`，以及一次关闭本机服务后的请求；在 Rex 控制台读取成功 / rejected 与耗时。模拟器中验证 Promise 行为不算通过。若没有有界失败机制，或不能同时满足自定义图片、可恢复豆瓣 ID、云端无片源详情与媒体识别，记录失败证据并停止依赖这些能力的 Widget 实施；先修订具体适配契约，不能悄悄改成宿主默认 TMDB 详情。

- [ ] **Step 6: 保存实际证据并提交。**

`docs/testing/rex-host.md` 写实际 Rex 版本、系统、测试日期、每个实验输入和通过 / 失败、请求次数、截图路径以及最终采用的字段。没有设备时明确写“未执行”，不要勾选本任务完成。执行：

```bash
rtk proxy git add tools/rex-probe docs/testing/rex-host.md
rtk proxy git commit -m 'test(rex): verify widget host contract' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 2: 搬入 workspace，建立可运行的本地回归检查

**Files:**
- Move: 文件归属表中初次移动的 `src/`、`public/`、`drizzle/`、构建配置到 `apps/core/`
- Modify: `package.json`、`pnpm-lock.yaml`、`.gitignore`、`AGENTS.md`
- Create: `pnpm-workspace.yaml`、`scripts/test.mjs`、`apps/core/package.json`
- Create: `apps/core/test/config.test.ts`、`apps/core/test/context.ts`、`apps/core/wrangler.test.jsonc`
- Create: `packages/contracts/package.json`、`packages/contracts/src/addon.ts`

**Interfaces:**
- Consumes: 现有整合 Worker 与原始 plugin package metadata。
- Produces: `pnpm build` 仍构建可运行的现有 Worker；`pnpm --filter @douban-bridge/core test` 可执行 Node + 本地 D1 测试。此任务不切线上 Worker 名和域名。

- [ ] **Step 1: 建立 runner 并写配置往返 / 安装身份回归测试。**

根新增开发依赖 `tsx`（安装时写入 lockfile）；不增加 Vitest、Playwright 或新的测试服务。保留根 package 的原 `name/version/displayName/description`，设置 `private: true`。

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

`scripts/test.mjs` 用 `readdir({withFileTypes:true})` 递归收集当前包 `test/` 的 `.test.ts` / `.test.mjs`，若为零报错；用 `spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {stdio:"inherit"})` 执行并传播 exit code。每包的 `test` script 是 `node ../../scripts/test.mjs`，core 的 `tsconfig.json` 保留 `@/* → ./src/*`。

```js
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
async function collect(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (/\.test\.(ts|mjs)$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}
const files = await collect("test");
if (!files.length) throw new Error("No tests found");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
```

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { decodeConfig, encodeConfig, configSchema } from "../src/libs/config";
import { ADDON } from "@douban-bridge/contracts/addon";

test("encoded configs round-trip and addon identity remains stable", () => {
  const config = configSchema.parse({ catalogIds: ["movie_top250"] });
  assert.deepEqual(decodeConfig(encodeConfig(config)), config);
  assert.equal(ADDON.id, "stremio-addon-douban");
  assert.equal(ADDON.name, "Douban");
});
```

先运行一次，预期因文件或 workspace export 不存在而失败。

- [ ] **Step 2: 执行文件移动并修正构建入口。**

```bash
rtk proxy mkdir -p apps/core packages/contracts/src
rtk proxy git mv src public drizzle vite.config.ts tsconfig.json drizzle.config.ts wrangler.jsonc components.json apps/core/
rtk proxy pnpm add -Dw tsx
```

把原 dependencies/devDependencies 中 app 使用的项搬到 core package，保持版本范围；根保留 Biome、tsx、TypeScript 工具和 workspace scripts。core package 名为 `@douban-bridge/core`，暂保留原 dev/build/preview/deploy/cf-typegen 命令。contracts package 名为 `@douban-bridge/contracts`，exports `./addon` 指向 `./src/addon.ts`，core 用 `workspace:*` 引用。

```ts
// packages/contracts/src/addon.ts
import pkg from "../../../package.json" with { type: "json" };
export const ADDON = {
  id: pkg.name, version: pkg.version, name: pkg.displayName, description: pkg.description,
};
```

`manifest.ts` 改用 `ADDON.id/version/name/description`；`configure.tsx` 标题改用 `ADDON.description`。不从新的 core package name 生成 Stremio ID。`drizzle.config.ts` 保持相对 core 的 `./src/db/schema.ts` / `./drizzle`。Wrangler 的 `$schema` 使用包内 `node_modules/wrangler/config-schema.json`。

- [ ] **Step 3: 确保本地开发与测试只使用本地资源。**

从 core D1 开发 binding 中删除现有 `remote: true`；保留 database_id / KV id 本身，生产部署继续指向原实例。测试配置使用独立 `name: "douban-bridge-core-test"`、`compatibility_date: "2025-11-28"`、`nodejs_compat`、本地 D1 binding `STREMIO_ADDON_DOUBAN`、本地 KV binding `KV`，不配置 routes、cron 或真实密钥。

`test/context.ts` 导出 `withTestContext(run)`：用现有 Wrangler 的 `getPlatformProxy({configPath:"wrangler.test.jsonc",persist:false})` 获得 D1/KV；按文件名顺序读取 `drizzle/*.sql`，去除 `--> statement-breakpoint` 后交给 `env.STREMIO_ADDON_DOUBAN.exec()`；创建收集 Promise 的 `ctx.waitUntil`；在现有 `asyncLocalStorage.run({env,ctx},run)` 中执行；finally 等待全部已登记 Promise 并 `dispose()`。`JWT_SECRET` 仅在测试 env 写固定测试字符串。该 helper 不启动任何远端请求。

```ts
import { readFile, readdir } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { asyncLocalStorage } from "../src/libs/middleware/context";
export async function withTestContext<T>(run: (env: CloudflareBindings, ctx: ExecutionContext) => Promise<T>): Promise<T> {
  const proxy = await getPlatformProxy<CloudflareBindings>({ configPath: "wrangler.test.jsonc", persist: false });
  const env = proxy.env;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as ExecutionContext;
  try {
    const migrations = (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      const sql = (await readFile(`drizzle/${name}`, "utf8")).replaceAll("--> statement-breakpoint", "");
      await env.STREMIO_ADDON_DOUBAN.exec(sql);
    }
    return await asyncLocalStorage.run({ env, ctx }, () => run(env, ctx));
  } finally {
    try { await Promise.all(pending); } finally { await proxy.dispose(); }
  }
}
```

测试配置中 `vars.JWT_SECRET` 使用 `"local-test-only-secret"`，D1 database_id 使用 `"00000000-0000-0000-0000-000000000001"`，KV id 使用32位零，均不配置 remote。测试目录不复制生产 `.dev.vars`。

- [ ] **Step 4: 更新根命令，执行迁移前后相同检查。**

根 `build`：`pnpm --filter @douban-bridge/core build`；根 `test`：`pnpm -r --if-present test`；`dev` / `deploy` 暂转发 core，直到任务 10 替换发布说明。执行：

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/core cf-typegen
rtk proxy pnpm --filter @douban-bridge/core test
rtk proxy pnpm build
```

本地打开 `/configure`，验证 CSS、hydration、匿名生成配置链接；`/manifest.json` 仍重定向到带编码配置的 manifest。只读生成类型，不手写声明。将各 app 的 `dist/`、`.wrangler/` 和本地密钥文件加入忽略规则。

- [ ] **Step 5: 提交可独立运行的 workspace 搬迁。**

```bash
rtk proxy git add package.json pnpm-workspace.yaml pnpm-lock.yaml scripts/test.mjs apps/core packages/contracts .gitignore AGENTS.md
rtk proxy git diff --cached --check
rtk proxy git commit -m 'refactor(workspace): isolate the existing core application' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 3: 固定接口契约与共享列表定义

**Files:**
- Create: `packages/contracts/src/index.ts`、`packages/contracts/src/stremio.ts`
- Move: `apps/core/src/libs/collections.ts` → `packages/contracts/src/collections.ts`
- Create: `apps/core/src/libs/collections.ts`（重导出）、`packages/contracts/test/contracts.test.ts`
- Modify: `packages/contracts/package.json`、`apps/core/package.json`

**Interfaces:**
- Consumes: 现有集合常量、年度解析和原始豆瓣 item / detail 字段。
- Produces: 以下明确的 public / internal 类型，以及保留原名称的集合 exports。

- [ ] **Step 1: 定义 public schema 和参数 schema，并写负向输入测试。**

```ts
import { z } from "zod/v4";
export const bridgeItemSchema = z.object({
  doubanId: z.number().int().positive(), mediaType: z.enum(["movie", "tv"]),
  title: z.string(), description: z.string().optional(), year: z.string().optional(),
  rating: z.number().optional(), tmdbId: z.number().int().positive().nullable().catch(null),
  imdbId: z.string().regex(/^tt\d+$/).nullable().catch(null),
  images: z.object({ poster: z.string().url().nullable().catch(null),
    background: z.string().url().nullable().catch(null), logo: z.string().url().nullable().catch(null) }),
});
export const bridgeDetailSchema = bridgeItemSchema.extend({
  actors: z.array(z.string()), directors: z.array(z.string()), genres: z.array(z.string()),
});
export const catalogResponseSchema = z.object({ items: z.array(bridgeItemSchema) });
export const metaResponseSchema = z.object({ item: bridgeDetailSchema });
export type BridgeItem = z.infer<typeof bridgeItemSchema>;
export type BridgeDetail = z.infer<typeof bridgeDetailSchema>;
export const catalogQuerySchema = z.object({
  collectionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_]+$/),
  skip: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  genre: z.string().min(1).max(128).optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export const doubanIdSchema = z.string().regex(/^[1-9]\d*$/)
  .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
```

输出字段统一为 schema 指定的 optional / null；`images` 对象必须存在，解析后保证三个键都有值。无效的非关键外部 ID / 图片单独降级为 null，不能使整页失败；doubanId/mediaType/title 等必需字段仍严格校验。仅 `skip` 做数值转换；路由必须拒绝重复 skip/genre 参数、空字符串 skip 和未声明 query 参数，避免 `Number("")` 被当成有效输入。

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { catalogQuerySchema, catalogResponseSchema } from "../src/index";
test("pagination and empty pages have different meanings from failures", () => {
  assert.equal(catalogQuerySchema.parse({ collectionId: "movie_top250", skip: "20" }).skip, 20);
  for (const skip of ["-1", "1.5", "NaN", "Infinity"])
    assert.equal(catalogQuerySchema.safeParse({ collectionId: "movie_top250", skip }).success, false);
  assert.equal(catalogQuerySchema.safeParse({ collectionId: "https://example.com" }).success, false);
  assert.deepEqual(catalogResponseSchema.parse({ items: [] }), { items: [] });
  assert.equal(catalogResponseSchema.safeParse({}).success, false);
});
```

运行 `rtk proxy pnpm --filter @douban-bridge/contracts test`，先确认新 exports 缺失时失败，再完成实现并通过。

- [ ] **Step 2: 搬迁集合定义，不改集合 ID、名称、年度映射和默认集合。**

把 `ManifestCatalog` 依赖换成文件内结构类型 `{id:string;name:string;type:"movie"|"series";extra?:Array<{name:string;options?:string[];optionsLimit?:number}>}`；保留 `hasGenre/isDefault`。`IdName` 改为 `Pick<CollectionConfig,"id"|"name">`。保留 `es-toolkit` 已有 `maxBy` 用法与原年度数据，不引入另一份 Widget 常量表。core 的原文件内容仅为：

```ts
export * from "@douban-bridge/contracts/collections";
```

测试 `DEFAULT_COLLECTION_IDS.length === 13`，`getLatestYearlyRanking("__movie_yearly_ranking__").id === "ECE472UNY"`，原 `movie_top250` 与 `tv_hot` 均在默认列表。contracts 添加当前相同版本的 Zod、es-toolkit 依赖；exports 的 `.` 指向 `./src/index.ts`，`./collections`、`./stremio` 分别指向同名 src 文件，保留任务2的 `./addon`。

- [ ] **Step 3: 定义 Stremio 内部字段，使适配器不需要读取数据库。**

```ts
import type { BridgeItem, BridgeDetail } from "./index";
import type { CollectionConfig } from "./collections";
export type MediaLink = { name: string; category: string; url: string };
export type StremioManifestData = { redirectConfig: string } | { catalogs: CollectionConfig[] };
export type StremioCatalogItem = BridgeItem & { genres: string[]; links: MediaLink[] };
export type StremioDetailItem = BridgeDetail & {
  links: MediaLink[]; language?: string; country?: string; awards?: string;
};
```

`CollectionConfig` 的可选 manifest 字段必须覆盖 `getCatalogs()` 当前实际输出，保持 JSON 兼容；内部 types 不导出 `User`、`Config.imageProviders` 或上游 token。

- [ ] **Step 4: 验证并提交契约。**

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/contracts test
rtk proxy pnpm --filter @douban-bridge/core test
rtk proxy pnpm build
rtk proxy git add packages/contracts apps/core/src/libs/collections.ts apps/core/package.json pnpm-lock.yaml
rtk proxy git commit -m 'feat(contracts): define bridge data and catalog contracts' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 4: 提取云端列表与详情服务，复用映射和选图

**Files:**
- Create: `apps/core/src/services/catalog.ts`、`apps/core/src/services/metadata.ts`
- Modify: `apps/core/src/libs/api/index.ts`、`apps/core/src/libs/images.ts`
- Create: `apps/core/test/catalog.test.ts`、`apps/core/test/metadata.test.ts`

**Interfaces:**
- Consumes: `CatalogQuery`、现有 `api`、`Config`、`ImageUrlGenerator`、AsyncLocalStorage。
- Produces: `getCatalogPage(query, images): Promise<StremioCatalogItem[]>`；`getCloudMeta(doubanId, images): Promise<StremioDetailItem>`；`getStremioMeta(doubanId, images): Promise<StremioDetailItem>`。
- `ImageContext = { providers: Config["imageProviders"]; origin: string; configId?: string }`，在 catalog.ts 导出；只在 core 内使用。

- [ ] **Step 1: 用本地 D1 写“只补缺失项，保持顺序”的失败测试。**

在 `withTestContext` 内向 `douban_mapping` 插入 `{doubanId:1,tmdbId:101,calibrated:true}`；通过 `mock.method` 替换上游方法，finally `mock.restoreAll()`，禁用同文件并行测试。

```ts
const items = [
  { id: 2, type: "movie", title: "第二项", cover: undefined, year: "2024", description: undefined },
  { id: 1, type: "movie", title: "第一项", cover: undefined, year: "2023", description: undefined },
];
const requested: number[] = [];
mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({ subject_collection_items: items, total: 2 }));
mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
  requested.push(doubanId);
  return { doubanId, tmdbId: null, imdbId: null, traktId: null };
});
const result = await getCatalogPage({ collectionId: "movie_top250", skip: 0 }, {
  providers: [], origin: "https://douban-bridge-api.baran.wang",
});
assert.deepEqual(requested, [2]);
assert.deepEqual(result.map((item) => item.doubanId), [2, 1]);
assert.equal(result[1].tmdbId, 101);
assert.equal(result[0].tmdbId, null);
assert.deepEqual(result[0].images, { poster: null, background: null, logo: null });
```

放入完整 `test()` 并导入 Node assert/test/mock、api、db schema、withTestContext 和新服务；运行 core test，预期服务不存在导致失败。

- [ ] **Step 2: 把旧 catalog 路由的来源解析和批量匹配移入服务。**

从旧 `catalog.ts` 搬取 `isYearlyRankingId/getLatestYearlyRanking`、genre 查 category、collection 请求、`fetchIdMapping` 和 `findExternalId` 逻辑。输出仍按 `items` 遍历，只有缺失的豆瓣 ID 去重后进行匹配，不请求完整详情。`getCatalogPage` 的缺失项部分使用：

```ts
const sourceById = new Map(items.map((item) => [item.id, item]));
const { mappingCache, missingIds } = await api.fetchIdMapping([...sourceById.keys()]);
const newMappings = await Promise.all(missingIds.map(async (doubanId) => {
  const source = sourceById.get(doubanId)!;
  try {
    return await api.findExternalId({ doubanId, type: source.type, title: source.title });
  } catch {
    return { doubanId, tmdbId: null, imdbId: null, traktId: null };
  }
}));
for (const mapping of newMappings) mappingCache.set(mapping.doubanId, mapping);
getContext().ctx.waitUntil(api.persistIdMapping(newMappings, false));
```

`items` 是 `collectionData.subject_collection_items`。空页直接返回 `[]`，不调用 `fetchIdMapping([])`。沿用原 genre 未命中时使用原集合的行为。原始来源返回 404 时抛 Hono `HTTPException(404)`；网络、上游 429/5xx、无效响应结构抛 `HTTPException(502)`，不能返回空数组掩盖故障。

`api.fetchIdMapping` 读取记录时增加 `calibrated`：已锁定记录即使外部 ID 全空也加入 mappingCache / mappedIds，避免在当前响应中绕过锁重新匹配。`persistIdMapping` 保留原来的 `COALESCE` 和 `setWhere`，不重写匹配算法。

- [ ] **Step 3: 投影服务字段，复用 provider 顺序和单项容错。**

`ImageUrlGenerator` 每个 provider 的调用改成 `await this.getUrlsForProvider(provider, options).catch(() => null)`，继续尝试后续允许的源。在服务内用下面的明确字段组装每个列表 item：

```ts
const generator = new ImageUrlGenerator(images.providers, {
  origin: images.origin, userId: images.configId,
});
return Promise.all(items.map(async (item) => {
  const mapping = mappingCache.get(item.id);
  const picture = await generator.generate({ doubanInfo: item,
    tmdbId: mapping?.tmdbId, imdbId: mapping?.imdbId });
  const genres = item.card_subtitle?.split("/")[2]?.trim().split(" ") ?? [];
  return {
    doubanId: item.id, mediaType: item.type, title: item.title,
    description: item.description ?? item.card_subtitle ?? undefined,
    year: item.year ?? undefined, rating: item.rating?.value ?? undefined,
    tmdbId: mapping?.tmdbId ?? null, imdbId: mapping?.imdbId ?? null,
    images: { poster: picture.poster ?? null, background: picture.background ?? null,
      logo: picture.logo ?? null },
    genres,
    links: [{ name: `豆瓣评分：${item.rating?.value ?? "N/A"}`, category: "douban", url: item.url ?? "#" }],
  };
}));
```

云端 HTTP router 后面用 `catalogResponseSchema.parse` 输出 public 字段，自动排除内部 links/genres。不要把 provider config 放入 item。

- [ ] **Step 4: 提取两个详情入口，保持新旧查询行为不同。**

在 metadata.ts 建立内部 `loadMeta(doubanId, images, enrich: boolean)`，两个导出函数分别固定传入 true / false，HTTP 客户端不能传 enrich。共同部分搬取原 `meta.ts` 的豆瓣详情、links、图片处理；cloud 路径调用 `fetchIdMapping([id])` 并对缺项调用一次 `findExternalId`，将本次结果立即用于响应，再用 `waitUntil` 持久化；Stremio 路径保留原“仅查库，未找到时插入待处理记录”。

统一返回：`description = data.intro ?? undefined`，`actors/directors = (data.actors/directors ?? []).map(x => x.name)`，`genres = data.genres ?? []`，`year = data.year ?? undefined`。`links/language/country/awards` 逐字段搬取原 meta 路由表达式；`images` 同列表规范化。没有外部 ID 时仍返回有效详情；缺少源条目为 404，上游失败为 502。

```ts
export const getCloudMeta = (id: number, images: ImageContext) => loadMeta(id, images, true);
export const getStremioMeta = (id: number, images: ImageContext) => loadMeta(id, images, false);
```

- [ ] **Step 5: 增加行为检查并提交服务。**

为以下场景分别写入现有 test 文件的 `test()`：空页 `fetchIdMapping` 调用数为 0；单个匹配抛错不删除源条目；仅配置 TMDB 且没有结果时所有图片为 null；第一个 provider 抛错时第二个源仍成功；直接打开 cloud 详情时匹配调用数为 1；打开同一条 Stremio 详情时匹配调用数为 0；锁定为空的映射不被本次匹配覆盖。每例断言具体调用次数或最终字段，不只断言 HTTP 200。

```bash
rtk proxy pnpm --filter @douban-bridge/core test
rtk proxy pnpm build
rtk proxy git add apps/core/src/services apps/core/src/libs/api/index.ts apps/core/src/libs/images.ts apps/core/test
rtk proxy git commit -m 'refactor(core): share catalog and metadata enrichment' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 5: 交付账号 secret key 与网页管理

**Files:**
- Modify: `apps/core/src/db/schema.ts`、`apps/core/src/routes/configure.tsx`、`apps/core/src/index.tsx`
- Create: `apps/core/src/libs/api-key.ts`、`apps/core/src/libs/public-user.ts`
- Create: `apps/core/src/routes/api-keys.ts`、`apps/core/src/components/configure/api-key-settings.tsx`
- Modify: `apps/core/src/components/configure/index.tsx`、`apps/core/src/components/star-banner.tsx`、`apps/core/src/components/user-menu.tsx`
- Generate: `apps/core/drizzle/0002_api_keys.sql` 与 Drizzle 生成的 meta 文件
- Create: `apps/core/test/api-keys.test.ts`

**Interfaces:**
- Consumes: cookie session 的 `c.get("user")`、D1 users / userConfigs。
- Produces: `replaceApiKey(env,userId): Promise<string>`；`revokeApiKey(env,userId): Promise<void>`；`hashApiKey(raw): Promise<string>`；`authenticateApiKey(env,header): Promise<{userId:string;config:Config}>`。
- HTTP: GET `/api-keys` → `{hasKey:boolean}`；POST `/api-keys`，JSON `{}` → `{sk:string}`；DELETE `/api-keys` → 204。全部要求网页 session，Bearer 不能替代。

- [ ] **Step 1: 增加最小表并生成本地 migration。**

```ts
export const apiKeys = sqliteTable("api_keys", {
  userId: text("user_id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: int("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

运行 `rtk proxy pnpm --filter @douban-bridge/core exec drizzle-kit generate --name api_keys`。在当前迁移序号仍为 0001 时生成 0002；若执行基线新增了 migration，使用实际下一个序号，禁止覆盖别人的 SQL。SQL 应只有新表与索引，不修改 douban_mapping、users、user_configs，也没有外键。先将 migration 应用到测试 helper 的本地 D1。

- [ ] **Step 2: 写换钥 / 权益 / 撤销测试，再实现摘要认证。**

```ts
const first = await replaceApiKey(env, userId);
assert.match(first, /^sk_[0-9a-f]{64}$/);
assert.equal((await authenticateApiKey(env, `Bearer ${first}`)).userId, userId);
const second = await replaceApiKey(env, userId);
await assert.rejects(authenticateApiKey(env, `Bearer ${first}`), (error: unknown) =>
  error instanceof HTTPException && error.status === 401);
assert.equal((await authenticateApiKey(env, `Bearer ${second}`)).userId, userId);
await revokeApiKey(env, userId);
await assert.rejects(authenticateApiKey(env, `Bearer ${second}`));
```

测试在 `withTestContext` 内用随机 UUID 和虚构 GitHub 用户插入 `hasStarred:true` 的 user；查询表内容，断言数据库里没有任何原始 `sk`。另测 false 权益返回 403、重复 Bearer / 空 key 返回 401、数据库故障返回 503。

```ts
export async function hashApiKey(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function replaceApiKey(env: CloudflareBindings, userId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const sk = `sk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const keyHash = await hashApiKey(sk);
  const createdAt = new Date();
  await getDrizzle(env).insert(apiKeys).values({ userId, keyHash, createdAt })
    .onConflictDoUpdate({ target: apiKeys.userId, set: { keyHash, createdAt } });
  return sk;
}
export async function revokeApiKey(env: CloudflareBindings, userId: string): Promise<void> {
  await getDrizzle(env).delete(apiKeys).where(eq(apiKeys.userId, userId));
}
```

`authenticateApiKey` 严格提取 `Bearer sk_` + 64 位小写 hex，计算摘要后查询 api_keys → users；无匹配为 401，`hasStarred !== true` 为 403。直接读取 userConfigs 并用现有 configSchema 解析，没配置行才使用默认配置；查询 / 解析异常返回 503，不能复用吞异常的 getConfig 来返回错误的个性化结果。每次读取当前数据库里的 Star 状态，沿用 `/auth/check-star` / OAuth 更新规则，不声称每次 API 请求都会实时查询 GitHub。

- [ ] **Step 3: 实现 session 写路由与来源校验。**

api-keys router 在当前 index.tsx 的 contextStorage/authMiddleware 后通过 `app.route("/api-keys", apiKeysRoute)` 挂载，任务 6 再随 wiring 搬到 app.tsx。POST/DELETE 先要求 user，接着检查 `Origin === new URL(c.req.url).origin`；POST 还要求 JSON Content-Type 和空对象 body，POST 仅有 Star 用户可生成。DELETE 允许失去 Star 的已登录用户撤销。GET 只返回是否存在，所有响应设 `Cache-Control: private, no-store`。不要输出 request headers、摘要或 key 到日志。

```ts
const requireSessionOrigin = (c: Context<Env>) => {
  if (!c.get("user")) throw new HTTPException(401);
  if (c.req.method !== "GET" && c.req.header("Origin") !== new URL(c.req.url).origin)
    throw new HTTPException(403);
};
```

测试带有效 Bearer 但无 session 的 POST 返回 401；跨域 session POST 返回 403；旧域名和 dash 域名分别使用自己的同源 Origin 能工作。

- [ ] **Step 4: 在配置页新增独立的密钥操作区域。**

复用 `SettingSection`、`Button`、`Input`、`toast`。`ApiKeySettings` 内部维护 `{hasKey,sk,busy}`，挂载时 GET `/api-keys`；点击“生成密钥”或“重新生成密钥”执行 POST，成功后只在该组件内显示只读密码输入框和复制按钮；显示“重新生成后，旧密钥立即失效”。点击“撤销密钥”执行 DELETE，成功后清空组件状态。失败保留当前状态并 toast “操作失败，请重试”；busy 时禁用操作。

```tsx
const response = await fetch("/api-keys", {
  method: "POST", headers: { "Content-Type": "application/json" },
  credentials: "same-origin", body: "{}",
});
if (!response.ok) throw new Error("key request failed");
const { sk } = await response.json() as { sk: string };
setSk(sk);
setHasKey(true);
```

输入框有 label，按钮必须 `type="button"`，不触发外层配置表单提交；不将 sk 保存到 localStorage、表单 Config 或 SSR initialData。对未登录 / 未 Star 用户显示现有登录 / Star 引导，不新增权益方案。

- [ ] **Step 5: 限制 SSR user 字段并验证界面。**

当前 configureProps 直接传数据库 User，会包含 GitHub access token；新增 `PublicUser = Pick<User,"id"|"githubLogin"|"githubAvatarUrl"|"hasStarred">` 并逐字段构建公开对象。Configure、StarBanner、UserMenu props 改为 PublicUser；SSR JSON 使用 `JSON.stringify(configureProps).replace(/</g,"\\u003c")`，不传 `githubAccessToken`。

本地 browser 操作生成、复制、替换、撤销；检查按钮不会保存目录配置；页面源代码和网络 GET 响应不包含 key 或 GitHub token。自动测试 SSR body 不包含测试用 GitHub token。执行 core test + build。

- [ ] **Step 6: 提交账号密钥功能。**

```bash
rtk proxy git add apps/core/src/index.tsx apps/core/src/db/schema.ts apps/core/src/libs/api-key.ts apps/core/src/libs/public-user.ts apps/core/src/routes/api-keys.ts apps/core/src/routes/configure.tsx apps/core/src/components apps/core/drizzle apps/core/test/api-keys.test.ts
rtk proxy git commit -m 'feat(core): manage account secret keys' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 6: 命名入口、公开 API 和独立图片访问

**Files:**
- Create: `apps/core/src/app.tsx`、`apps/core/src/routes/internal-api.ts`
- Modify: `apps/core/src/index.tsx`、`apps/core/src/routes/image-proxy.ts`
- Create: `apps/api/package.json`、`apps/api/tsconfig.json`、`apps/api/wrangler.jsonc`、`apps/api/src/index.ts`
- Create: `apps/core/test/internal-api.test.ts`、`apps/core/test/image-proxy.test.ts`、`apps/api/test/forwarding.test.ts`

**Interfaces:**
- Consumes: Task 3 schemas、Task 4 services、Task 5 `authenticateApiKey`。
- Produces: `ApiEntrypoint`；public `/v1/catalog/:collectionId`、`/v1/meta/:doubanId`；`/image-proxy/:userId`；原始 Request URL / headers 的转发语义。

- [ ] **Step 1: 写入口隔离与鉴权前置测试。**

测试网页 `app.fetch(new Request("https://douban-bridge-dash.baran.wang/v1/catalog/movie_top250"),env,ctx)` 返回 404；internal API 相同路径无 Bearer 返回 401；即使传 `X-Internal: true`、`X-User-Id` 或 `mode=stremio`，仍不获得权限。mock `getCatalogPage` 或底层 source 方法，断言拒绝请求的上游调用数为 0。

- [ ] **Step 2: 分开 app 与 runtime entrypoint，让测试不依赖 Node 导入 cloudflare:workers。**

将原 Hono app wiring 移入 app.tsx，导出 `app`。API router 使用 `contextStorage`，不使用 cookie auth；本任务保留原 Stremio mounts，任务 7 再迁出。

```ts
import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { scheduled } from "./cron";
import { internalApi } from "./routes/internal-api";
export class ApiEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  fetch(request: Request) { return internalApi.fetch(request, this.env, this.ctx); }
}
export default { fetch: app.fetch, scheduled };
```

不要在 Node 单测 import index.tsx；真实命名入口由任务 10 的 workerd 测试验证。

- [ ] **Step 3: 实现 API router，先鉴权再读取个性化数据。**

固定顺序：contextStorage → `/v1/*` Bearer 验证 → 按认证 userId 的 USER_RATE_LIMIT → query / path 校验 → service → response schema。每个最终响应含 `private, no-store`，包括 400/401/403/404/429/5xx。对缺失来源返回 404，service / DB 故障返回对应 502/503；未知异常只记录静态错误类别并返回 `{error:"internal_error"}`，不输出请求对象。

```ts
internalApi.get("/v1/catalog/:collectionId", async (c) => {
  const raw = c.req.queries();
  if (Object.keys(raw).some((key) => !["skip", "genre"].includes(key)) ||
      Object.values(raw).some((values) => values.length !== 1) || raw.skip?.[0] === "")
    throw new HTTPException(400);
  const query = catalogQuerySchema.parse({
    collectionId: c.req.param("collectionId"), skip: c.req.query("skip"), genre: c.req.query("genre"),
  });
  const account = c.get("apiAccount");
  const items = await getCatalogPage(query, {
    providers: account.config.imageProviders,
    configId: account.userId, origin: new URL(c.req.url).origin,
  });
  return c.json(catalogResponseSchema.parse({ items }));
});
```

在 router 局部声明 Hono Variables 的 `apiAccount` 类型，不扩散到 Stremio 包。query 的 ZodError 映射为400；meta 路由拒绝所有 query 参数，用 `doubanIdSchema` 和 `getCloudMeta` / `metaResponseSchema`，没有新增客户端批量接口。内部 Stremio query 使用自己的允许字段集合，不经过这段 API query 校验。

- [ ] **Step 4: 复用图片代理，限定允许的上游与请求头。**

API 仍返回 `/image-proxy/:userId?url=...`，不增加新的图片 token 系统。将既有 imageProxyRoute 同时挂在网页 app 和 internalApi 的 `/image-proxy`，该路径不要求 Bearer，但必须像既有流程一样查账号 `hasStarred`。先授权再处理 If-None-Match，避免现有提前 304 绕过权限检查。

```ts
const image = new URL(url);
if (image.protocol !== "https:" || image.username || image.password ||
    (image.port && image.port !== "443") || !image.hostname.endsWith(".doubanio.com"))
  return c.text("Unsupported image source", 400);
const response = await fetch(image, {
  headers: DoubanAPI.BASE_HEADERS, redirect: "manual",
});
if (response.status >= 300 && response.status < 400)
  return c.text("Image source redirected", 502);
```

只转发 image Content-Type / ETag 等显示所需响应头，移除上游 Set-Cookie；不将客户端 Cookie、Authorization、Host 发给图片源。成功的完整图片响应仍带 CORS；图片错误不伪装成 200。测试匿名请求已 Star 账号图片可用、非 Star 不可用、内网 / 非 HTTPS / 域名后缀伪造 / redirect 目标不可访问、撤权后的条件请求不返回 304。用实际豆瓣海报 URL 验证该允许范围；只有观测到必要的其他官方图片域名才增加具体 allowlist 项。

- [ ] **Step 5: 创建 api Worker 的最小转发层和独立构建。**

api 包名 `@douban-bridge/api`，`private:true`、`type:"module"`，仅依赖 Hono、contracts，devDependencies 使用已有 Wrangler、TypeScript 类型工具；build 命令 `wrangler deploy --dry-run --outdir dist`，preview `wrangler dev --local`，deploy `wrangler deploy`，cf-typegen 同 core，test 使用任务2的 runner。runtime Env 是显式 `{CORE_API:Fetcher;PUBLIC_RATE_LIMIT:RateLimit}`，不能通过 Hono 全局类型继承 core bindings。

```json
{
  "name": "douban-bridge-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-28",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [{ "pattern": "douban-bridge-api.baran.wang", "custom_domain": true }],
  "services": [{ "binding": "CORE_API", "service": "douban-bridge-core", "entrypoint": "ApiEntrypoint" }],
  "ratelimits": [{ "name": "PUBLIC_RATE_LIMIT", "namespace_id": "1003", "simple": { "limit": 60, "period": 60 } }]
}
```

先对 public IP 限流再转发；只允许 GET 的两个 `/v1` 路径和图片路径，OPTIONS 由 CORS 处理，其余 404/405。数据请求只转发 Authorization、Accept、User-Agent 和平台提供的客户端 IP；图片只转发 If-None-Match / Accept，不带 Authorization。Request 保持原 URL，避免 core 生成内部 hostname 图片。`CORE_API.fetch` 抛错转 503，并保证 no-store。使用 clone Response 修改头，不读完图片 body。

```ts
const upstream = await c.env.CORE_API.fetch(new Request(c.req.url, {
  method: "GET", headers: forwardedHeaders,
}));
const response = new Response(upstream.body, upstream);
response.headers.set("Cache-Control", "private, no-store");
return response;
```

`forwardedHeaders` 在 handler 中从上述固定字段逐项构建。CORS 允许 GET/OPTIONS 与 Authorization，图片单独无 Bearer；不启用 credentials。

- [ ] **Step 6: 检查跨账号响应和内部不落缓存，提交。**

两个本地测试账号使用同一 catalog URL，分别配置 Douban-only 与空 providers；断言图不同、第二次请求不是第一账号的结果。改变保存配置后下一次请求改变图片；合法空页200且 `{items:[]}`；无 ID 条目200。断言拒绝响应和成功响应都含 no-store，代码未调用 `putResponseCache`。

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/core test
rtk proxy pnpm --filter @douban-bridge/api test
rtk proxy pnpm --filter @douban-bridge/api cf-typegen
rtk proxy pnpm --filter @douban-bridge/api build
rtk proxy pnpm --filter @douban-bridge/core build
rtk proxy git add apps/core/src apps/core/test apps/api pnpm-lock.yaml
rtk proxy git commit -m 'feat(api): expose authenticated bridge endpoints' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 7: 拆出 Stremio，保持安装、网页和 OAuth 兼容

**Files:**
- Move: core 的 `routes/catalog.ts`、`meta.ts`、`manifest.ts` 和 `libs/router.ts`、`response-cache.ts` → `apps/stremio/src/` 对应目录
- Create: `apps/stremio/package.json`、`tsconfig.json`、`wrangler.jsonc`、`src/index.ts`、`src/env.ts`、`src/libs/core-client.ts`、`src/libs/web-proxy.ts`、`src/libs/rate-limit.ts`
- Create: `apps/core/src/routes/internal-stremio.ts`
- Modify: `apps/core/src/index.tsx`、`app.tsx`、`wrangler.jsonc`、`routes/configure.tsx`、`routes/auth.ts`
- Create: `apps/core/src/libs/public-origins.ts`
- Create: `apps/stremio/test/protocol.test.ts`、`apps/stremio/test/web-proxy.test.ts`、`apps/core/test/oauth-origins.test.ts`

**Interfaces:**
- Consumes: `StremioManifestData`、`StremioCatalogItem`、`StremioDetailItem`、固定内部 GET 接口。
- Produces: `StremioEntrypoint`；原双挂载 Stremio 协议；`coreGet<T>(env,path,query):Promise<T>`；`isWebCompatibilityRoute(method,pathname):boolean`；`getStremioOrigin(env):string`。

- [ ] **Step 1: 建立协议 fixture 与显式兼容路由测试。**

用 fake `CORE_STREMIO.fetch` 返回固定内部 item，比较适配后的完整 JSON（包括所有旧兼容字段），不要只检查数量：

```ts
const internalItem = {
  doubanId: 1291546, mediaType: "movie", title: "测试电影", description: "详情",
  year: "1994", rating: 9.7, tmdbId: 278, imdbId: "tt0111161",
  images: { poster: "https://img1.doubanio.com/test.jpg", background: null, logo: null },
  genres: ["剧情"], links: [], actors: [], directors: [],
};
const response = await app.fetch(new Request("https://stremio-addon-douban.baran.wang/meta/movie/douban:1291546.json"), env, ctx);
const { meta } = await response.json();
assert.equal(meta.id, "douban:1291546");
assert.equal(meta.tmdb_id, "tmdb:278");
assert.equal(meta.tmdbId, 278);
assert.equal(meta.imdb_id, "tt0111161");
assert.equal(meta.behaviorHints.defaultVideoId, "tt0111161");
```

env 的 `CORE_STREMIO.fetch` 在本例返回 `{item:internalItem}`，rate-limit stubs 返回 `{success:true}`，ctx 收集 waitUntil。另测 TV 输出 type 为 series，TMDB-only defaultVideoId 为 `tmdb:278`，无映射时不出现伪造的外部 ID；public 和 config-scoped 两种 URL 都覆盖。

- [ ] **Step 2: 实现 core 的内部 Stremio router。**

每次请求先 contextStorage。manifest 无 config 返回 `encodeConfig()`，否则用 `getConfig + getCatalogs`。catalog 使用 `getCatalogPage`，meta 使用 `getStremioMeta`。image context 的 configId 保留原编码字符串 / UUID，不改现有用户图片权限语义；origin 校验后传入。此入口无 cookie / Bearer 认证，权限来自既有配置模型，只可通过指定的 binding 到达。

```ts
internalStremio.get("/stremio/manifest", async (c) => {
  const configId = c.req.query("config");
  if (!configId) return c.json({ redirectConfig: encodeConfig() });
  const config = await getConfig(c.env, configId);
  return c.json({ catalogs: await getCatalogs(config) });
});
```

在 index.tsx 导入 internalStremio，并新增以下 class；不把内部路径挂在默认 app。core 默认 app 删除原 manifest/catalog/meta mounts，只保留网页、auth、api-keys、image-proxy、dash 和静态资源。

```ts
export class StremioEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  fetch(request: Request) { return internalStremio.fetch(request, this.env, this.ctx); }
}
```

- [ ] **Step 3: 让 Stremio 路由只转换协议字段。**

保留现有 `matchResourceRoute`、`getExtraFactory` 与 response cache。`coreGet` 构造 `https://core.internal` 的固定内部路径，通过 binding.fetch 请求；转发上游 HTTP 错误，绝不调用公网 core 域名；query 用 URLSearchParams 编码。

```ts
export async function coreGet<T>(env: { CORE_STREMIO: Fetcher }, path: string,
  query: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path, "https://core.internal");
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  const response = await env.CORE_STREMIO.fetch(new Request(url));
  if (!response.ok) throw new HTTPException(response.status as ContentfulStatusCode);
  return response.json() as Promise<T>;
}
```

`ContentfulStatusCode` 从 `hono/utils/http-status` 引入。catalog 路由用内部 item 生成原 `id/type/name/description/poster/background/logo/year/genres/links/imdb_id/tmdb_id/tmdbId`；meta 增加原 `language/country/awards/behaviorHints`。只有有值的外部 ID 才设置对应字段；null 图片投影为 undefined，以保持旧 JSON 省略行为。

`src/env.ts` 定义 `export type StremioEnv = { Bindings: CloudflareBindings }`，其中 CloudflareBindings 来自 stremio 自己生成的声明。迁入的 Hono routes / router / response-cache 全部改用该类型，不能 import core 的 global.d.ts。api 同样只在自己包内使用自己的 binding 类型。

```ts
const meta = {
  id: `douban:${item.doubanId}`, type: item.mediaType === "tv" ? "series" : "movie",
  name: item.title, description: item.description,
  poster: item.images.poster ?? undefined, background: item.images.background ?? undefined,
  logo: item.images.logo ?? undefined, genres: item.genres, links: item.links,
};
```

继续返回原 `cacheMaxAge/staleRevalidate/staleError`，继续使用旧 response cache；API 不能 import 这份缓存。旧 manifest 使用 ADDON 和原 logo URL，缺 config 的 302 保持相对 Location。

- [ ] **Step 4: 用完整 allowlist 转发旧网页与 assets。**

允许以下方法 / 路径，未列举的一律不调用 CORE_WEB：

| 方法 | 路径 |
| --- | --- |
| GET/HEAD | `/`、`/configure`、`/:config/configure` |
| POST | `/configure`、`/:config/configure` |
| GET | `/auth/github`、`/auth/github/callback`、`/auth/me`、`/auth/check-star` |
| POST | `/auth/logout` |
| GET/POST/DELETE | `/api-keys` |
| GET/HEAD | `/image-proxy/:userId` |
| GET | `/dash/tidy-up`、`/dash/tidy-up/`、`/dash/tidy-up/:doubanId` |
| POST | `/dash/tidy-up/:doubanId` |
| GET/HEAD | `/icon.png`、构建产物 `/assets/*` |

所有 path 参数只能占一段；doubanId 为正整数字符串，asset path 拒绝解码后包含 `..` 或反斜线的路径。GET/HEAD 的处理要真实支持 HEAD，不能只在 allowlist 放行而目标 handler 返回 404。

```ts
return c.env.CORE_WEB.fetch(c.req.raw);
```

直接传 Request，不重写 URL、Host、Cookie、Origin、请求体或 redirect；直接返回 Response，避免合并多条 Set-Cookie。不要手动拼接 Set-Cookie。测试恶意 `/v1/*`、`/stremio/*`、`/internal/*`、任意未知路径不触达 CORE_WEB，原 Basic auth header 对 dash 正常透传。

core 配置 assets binding `ASSETS`。core 默认 app 对 `/icon.png`、`/assets/*` 调用 `env.ASSETS.fetch(c.req.raw)`，其他未知路径404。生产构建后的 HTML 资源引用必须落在这两类路径；开发时在 core Vite 端口验证 HMR，旧域名兼容验证使用构建后的 Wrangler preview，不能把 `/src/*` 作为生产公开源码代理。

- [ ] **Step 5: 修正安装 origin，并为两种网页 origin 保持独立 OAuth Cookie。**

core 新增非秘密变量 `STREMIO_ORIGIN=https://stremio-addon-douban.baran.wang`、`DASH_ORIGIN=https://douban-bridge-dash.baran.wang`。configure GET/POST 全部用 STREMIO_ORIGIN 生成 manifestUrl；旧域名和新域名上的页面均生成相同安装 host，本地测试用 localhost 的 Stremio 端口覆盖。

GitHub OAuth App 每个应用使用一个 callback URL。为新 dash 域名准备独立 OAuth App，避免扩大 Cookie domain 或设计一次性跨域登录协议：

| 配置项 | 新 OAuth App 值 |
| --- | --- |
| Application name | Douban Bridge Dashboard |
| Homepage URL | `https://douban-bridge-dash.baran.wang` |
| Authorization callback URL | `https://douban-bridge-dash.baran.wang/auth/github/callback` |

原 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET` 继续用于旧域名；新增 `DASH_GITHUB_CLIENT_ID/DASH_GITHUB_CLIENT_SECRET` 只存 core。注册应用及写入 secrets 属于部署阶段，当前规划不执行。`auth.ts` 在登录和 callback 两处以实际 request origin 选择同一 credential pair，禁止使用 X-Forwarded-Host 决定；未知 origin 返回400，新 pair 未配置返回503。callback 的 state / JWT cookie 继续 host-only、HttpOnly、Secure、SameSite=Lax；JWT_SECRET 从旧部署保留到 core，让旧登录继续有效。

测试两套 OAuth URL 的 client_id 正确、错域 state 无效、原 `/auth/me` session 仍有效；不把“成功收到302”当作 OAuth 登录成功。新旧网页分别登录是预期，账号仍按 GitHub id 共用同一 users / userConfigs 行。

- [ ] **Step 6: 配置最后的资源归属并验证。**

core Wrangler name 改为 `douban-bridge-core`，custom domain 改为 dash；D1/KV 实例不变，保留 `0 * * * *` cron、既有上游变量和 rate limits。stremio Worker 继续使用原生产 name `stremio-addon-douban` 与原 custom domain，仅绑定以下 services 和原 PUBLIC/USER rate limits，不绑定业务 D1/KV 或 cron：

```json
[
  { "binding": "CORE_STREMIO", "service": "douban-bridge-core", "entrypoint": "StremioEntrypoint" },
  { "binding": "CORE_WEB", "service": "douban-bridge-core" }
]
```

只对 Stremio 协议请求在 edge 执行原限流规则；网页兼容请求交给 core 原限流，避免同一次网页请求计两次。将原 isUserId 检测替换成 stremio 本地 `z.uuid().safeParse(id).success`，不要为这一行导入 core config。

stremio 包名 `@douban-bridge/stremio`，`private:true`、`type:"module"`；依赖 Hono、contracts、path-to-regexp、Zod，devDependencies 使用已有 Stremio SDK 和 Wrangler。build=`wrangler deploy --dry-run --outdir dist`，preview=`wrangler dev --local`，deploy=`wrangler deploy`，cf-typegen=`wrangler types --env-interface CloudflareBindings`，test=`node ../../scripts/test.mjs`。分别生成类型、跑 core/stremio/api tests 和三个 build；启动三个 preview 后检查网页资源、协议 JSON 和内部404。

- [ ] **Step 7: 提交完成的 Worker 边界。**

```bash
rtk proxy git add apps/core apps/stremio pnpm-lock.yaml
rtk proxy git diff --cached --check
rtk proxy git commit -m 'refactor(stremio): preserve compatibility through core bindings' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 8: 建立不携带云端凭据的 Widget 基础模式

**Files:**
- Create: `apps/rex-widget/package.json`、`tsconfig.json`、`src/host.ts`、`src/basic.ts`、`test/basic.test.ts`
- Move: `apps/core/src/libs/api/douban/schema.ts` → `packages/contracts/src/douban.ts`
- Create: `apps/core/src/libs/api/douban/schema.ts`（重导出）
- Modify: `packages/contracts/package.json`

**Interfaces:**
- Consumes: shared Douban schema / collection constants；通过任务 1 验证的 Widget HTTP / TMDB 能力。
- Produces: `getBasicCatalog(query:CatalogQuery):Promise<BridgeItem[]>`、`getBasicMeta(id:number):Promise<BridgeDetail>`、`findBasicTmdb(source):Promise<BasicTmdbMatch|null>`。
- `BasicTmdbMatch = {id:number;poster_path?:string|null;backdrop_path?:string|null}`；`source = {type:"movie"|"tv";title:string;original_title?:string|null;year?:string|null}`。

规划时的只读验证：2026-09-14，Frodo 无 apikey 请求返回400；公开 `https://m.douban.com/rexxar/api/v2` 的13个默认集合、年度 `ECE472UNY`、`subject/1291546` 均返回200。`subject_collection/movie_comedy?for_mobile=1` 返回 category_tabs。基础模式使用这一公开网页数据入口，避免把 core 的 DOUBAN_API_KEY 打入 Widget。这是本机 HTTP 证据，Rex 网络环境仍要实测。

- [ ] **Step 1: 搬出纯 schema，定义最小宿主接口。**

Douban schema 文件本身只有 Zod / es-toolkit，可移入 contracts。core 原文件重导出 `@douban-bridge/contracts/douban`，contracts 增加该 export，避免复制容错解析规则。Widget 包名 `@douban-bridge/rex-widget`，`private:true`、`type:"module"`、`version:"0.1.0"`，依赖 contracts 和现有版本的 Zod，test 使用任务2的 runner；不得 import core 的 BaseAPI、db、config 或 Node adaptor。

```ts
export type HostResponse = { statusCode: number; data: unknown };
export type HostWidget = {
  http: { get(url: string, options?: { headers?: Record<string, string> }): Promise<HostResponse> };
  tmdb: { get(path: string, options?: { params?: Record<string, string> }): Promise<unknown> };
  storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
};
declare global { var Widget: HostWidget; }
```

host.ts 的字段和异步返回方式必须与任务 1 实测一致；若真实 `statusCode` 字段或 storage API 不同，以实测适配此单一边界，不能在多个业务文件猜字段。

- [ ] **Step 2: 写不会调用云端的基础模式测试。**

`basic.test.ts` 用 fake `globalThis.Widget` 提供记录 URL 的 http.get / tmdb.get。返回一个有 ID/title/type 的有效源条目和一个匹配 TMDB 条目，再断言：

```ts
const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 20 });
assert.equal(requests.some((url) => url.includes("douban-bridge-api")), false);
assert.equal(requests.some((url) => url.includes("start=20") && url.includes("count=20")), true);
assert.equal(result[0].doubanId, 1291546);
assert.equal(result[0].tmdbId, 278);
```

fake 源 envelope 为 `{subject_collection_items:[{id:1291546,type:"movie",title:"肖申克的救赎",year:"1994",cover_url:"https://img1.doubanio.com/test.jpg"}],total:1}`；fake TMDB 为 `{results:[{id:278,title:"肖申克的救赎",release_date:"1994-09-23",poster_path:"/test.jpg"}]}`。先运行 Widget test 确认失败。

- [ ] **Step 3: 实现公开豆瓣请求和已有类别 / 年度解析。**

```ts
const DOUBAN_BASE = "https://m.douban.com/rexxar/api/v2";
const DOUBAN_HEADERS = {
  Referer: "https://m.douban.com/",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
};
async function doubanGet(path: string): Promise<unknown> {
  const response = await Widget.http.get(`${DOUBAN_BASE}/${path}`, { headers: DOUBAN_HEADERS });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("Douban request failed");
  return response.data;
}
```

集合 ID 先过 catalogQuerySchema；年度虚拟 ID 使用 shared `getLatestYearlyRanking`；有 genre 时读取 `subject_collection/:id?for_mobile=1`，解析当前 category tab 并按 name 取 id，找不到时沿用原集合，和 core 行为一致。列表请求 `subject_collection/:id/items?start=:skip&count=20` 用 `doubanSubjectCollectionSchema`；详情请求 `subject/:id` 用 `doubanSubjectDetailSchema`。本地来源失败要 throw；只有真实源空列表返回 `[]`。

- [ ] **Step 4: 实现最小、保守的 TMDB 匹配及字段投影。**

调用 `Widget.tmdb.get("search/movie" 或 "search/tv", {params:{query:source.title,language:"zh-CN"}})`。候选只有 numeric positive id，标题/原名与豆瓣 title/original_title 去空白和大小写后完全相同，并在双方都有年份时一致；恰好一个候选才采用，零个/多个/网络失败均返回 null，不取搜索第一条。

```ts
const normalize = (value: string) => value.trim().toLocaleLowerCase();
const titles = new Set([source.title, source.original_title].filter((v): v is string => !!v).map(normalize));
const candidates = results.filter((item) => {
  const names = [item.title, item.name, item.original_title, item.original_name]
    .filter((v): v is string => typeof v === "string");
  const date = item.release_date ?? item.first_air_date;
  const year = typeof date === "string" ? date.slice(0, 4) : "";
  return Number.isSafeInteger(item.id) && item.id > 0 && names.some((name) => titles.has(normalize(name))) &&
    (!source.year || !year || source.year === year);
});
return candidates.length === 1 ? candidates[0] : null;
```

用 Zod 在 basic.ts 为 `results` 定义只含这里实际使用字段的 schema，拒绝无 results 的响应并在匹配层 catch 为 null。TMDB 相对海报 / 背景图转换为 `https://image.tmdb.org/t/p/original${path}`；无对应图才用源 cover/photos，logo=null。标题、评分、简介保留豆瓣数据；没有 IMDb 信息时 `imdbId=null`。

列表不读每条完整详情来获取演员。详情单独读取源 intro / actors / directors / genres 并尽力匹配，满足不经列表直接打开的情况。使用 `Promise.all(items.map(...))` 保持源顺序，单项 TMDB 失败不影响其余条目；不增加本地持久映射库。

- [ ] **Step 5: 验证回退语义并提交。**

新增测试：TMDB 失败仍保留豆瓣图和 ID；多个候选不匹配；电影/TV 同名不会跨 type 搜索；豆瓣失败 reject；真实空页 `[]`；直接详情 actors 来自豆瓣且没有云端调用；年度参数和 genre 使用相同集合映射。运行 core/contracts/Widget tests，确认 schema 搬迁无行为变化。

```bash
rtk proxy pnpm install
rtk proxy pnpm --filter @douban-bridge/contracts test
rtk proxy pnpm --filter @douban-bridge/core test
rtk proxy pnpm --filter @douban-bridge/rex-widget test
rtk proxy git add apps/rex-widget packages/contracts apps/core/src/libs/api/douban/schema.ts pnpm-lock.yaml
rtk proxy git commit -m 'feat(widget): provide local Douban and TMDB mode' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 9: 交付多模块云端优先 Widget 与静态构建

**Files:**
- Create: `apps/rex-widget/src/cloud.ts`、`src/index.ts`、`scripts/build.mjs`、`test/cloud.test.ts`、`test/bundle.test.mjs`
- Modify: `apps/rex-widget/package.json`、`docs/testing/rex-host.md`

**Interfaces:**
- Consumes: `getBasicCatalog/getBasicMeta`、public schemas、Task 1 的已验证宿主适配方式。
- Produces: `loadCatalog(query,sk):Promise<BridgeItem[]>`、`loadMeta(id,sk):Promise<BridgeDetail>`；宿主全局 `WidgetMetadata`、`loadDefaultCatalog`、`loadGenreCatalog`、`loadYearlyCatalog`、`loadDetail`；静态 `dist/douban-bridge.js`、`dist/manifest.json`。

- [ ] **Step 1: 写请求次数和失败分类测试。**

`cloud.test.ts` 使用 mock Widget HTTP 和 basic 模块调用计数，测试以下完整矩阵：

| 云端输入 | cloud 次数 | basic 次数 | 结果 |
| --- | --- | --- | --- |
| sk 为空 | 0 | 1 | 基础结果 |
| 200，完整列表 | 1 | 0 | 云端列表与原图 |
| 200，items=[] | 1 | 0 | 空列表 |
| 200，某项 tmdbId=null | 1 | 0 | 云端豆瓣条目 |
| 200，缺 items / 非法 item | 1 | 1 | 基础结果 |
| 401/403/404/429/500 | 1 | 1 | 基础结果，不修改保存的 sk |
| HTTP promise reject | 1 | 1 | 基础结果 |
| 云端失败且 basic reject | 1 | 1 | 向宿主抛错 |

```ts
test("valid empty cloud page never calls local sources", async () => {
  let calls = 0;
  globalThis.Widget = { ...hostFixture, http: { get: async (url) => {
    calls += 1;
    assert.equal(new URL(url).hostname, "douban-bridge-api.baran.wang");
    return { statusCode: 200, data: { items: [] } };
  } } };
  assert.deepEqual(await loadCatalog({ collectionId: "movie_top250", skip: 0 }, "sk_test"), []);
  assert.equal(calls, 1);
});
```

`hostFixture` 在测试文件内定义 storage 为 Map、tmdb.get 为抛错函数；测试密钥无需是真实 key，服务端鉴权测试已覆盖真实格式。直接详情执行同样的矩阵。

- [ ] **Step 2: 实现一条云端路径和一次基础回退。**

```ts
const API_ORIGIN = "https://douban-bridge-api.baran.wang";
export async function loadCatalog(query: CatalogQuery, sk: string): Promise<BridgeItem[]> {
  if (sk) {
    try {
      const url = new URL(`/v1/catalog/${encodeURIComponent(query.collectionId)}`, API_ORIGIN);
      url.searchParams.set("skip", String(query.skip));
      if (query.genre) url.searchParams.set("genre", query.genre);
      const response = await Widget.http.get(url.toString(), { headers: { Authorization: `Bearer ${sk}` } });
      if (response.statusCode !== 200) throw new Error("Cloud unavailable");
      return catalogResponseSchema.parse(response.data).items;
    } catch { /* 使用本次调用的基础模式 */ }
  }
  return getBasicCatalog(query);
}
export async function loadMeta(id: number, sk: string): Promise<BridgeDetail> {
  if (sk) {
    try {
      const response = await Widget.http.get(`${API_ORIGIN}/v1/meta/${id}`, {
        headers: { Authorization: `Bearer ${sk}` },
      });
      if (response.statusCode !== 200) throw new Error("Cloud unavailable");
      return metaResponseSchema.parse(response.data).item;
    } catch { /* 使用本次调用的基础模式 */ }
  }
  return getBasicMeta(id);
}
```

基础请求放在 catch 之外，使基础失败自然传播。cloud 成功后禁止再次 basic 匹配或本地补图。无需 Promise.race、自定义重试队列、后台渐进更新或最终列表缓存。网络等待方式采用 Task 1 实测的宿主行为；不得直接加入未经验证的 setTimeout / AbortController。

- [ ] **Step 3: 处理共同凭证与稳定详情链接。**

当 Task 1 确认 storage 方案时，使用一个 namespaced key 保存当前 Widget 凭证；清空参数必须移除旧值。不同详情不能在 link 中携带 sk。实现：

```ts
const SK_STORAGE = "douban.bridge.sk";
function readSk(params?: { sk?: string }): string {
  if (params && Object.hasOwn(params, "sk")) {
    const sk = (params.sk ?? "").trim();
    if (sk) Widget.storage.set(SK_STORAGE, sk);
    else Widget.storage.remove(SK_STORAGE);
    return sk;
  }
  return Widget.storage.get(SK_STORAGE) || "";
}
function detailLink(id: number): string {
  return `https://douban-bridge-api.baran.wang/v1/meta/${id}`;
}
function readDetailId(link: string): number {
  const url = new URL(link);
  if (url.origin !== "https://douban-bridge-api.baran.wang") throw new Error("Invalid detail link");
  const match = /^\/v1\/meta\/([1-9]\d*)$/.exec(url.pathname);
  if (!match || url.search || url.hash) throw new Error("Invalid detail link");
  return doubanIdSchema.parse(match[1]);
}
```

Task 1 若确认宿主直接参数读取，应在同一 `readSk` 边界采用实测 API，不新增隐式第二份配置。单个 Widget 使用一个账号，两个模块不能在后台永久保留不同账号的 final list。

- [ ] **Step 4: 从 shared collections 生成实际模块。**

13个默认集合各生成一个模块：模块 id 与集合 id 相同、title 使用现有中文名、functionName=`loadDefaultCatalog`，params 包括 constant `collectionId` 和 page。另设 `movie_genre` / `tv_genre`，functionName=`loadGenreCatalog`，collectionId enumeration 来自 MOVIE/TV_GENRE_CONFIGS，genre 为可选 input，描述“填写该榜单已有的筛选名称”；另设 `movie_yearly` / `tv_yearly`，functionName=`loadYearlyCatalog`，collectionId enumeration 包含对应 YEARLY_RANKINGS 中的所有年度 ID 和“最新年度”虚拟 ID。所有模块都采用 Task 1 已验证的缓存禁用设置。

```ts
function queryFromParams(params: { collectionId: string; page?: string | number; offset?: string | number; genre?: string }) {
  const page = Number(params.page ?? 1);
  const skip = params.offset === undefined ? (page - 1) * 20 : Number(params.offset);
  if (params.offset === undefined && (!Number.isSafeInteger(page) || page < 1)) throw new Error("Invalid page");
  return catalogQuerySchema.parse({ collectionId: params.collectionId, skip, genre: params.genre || undefined });
}
async function loadDefaultCatalog(params: WidgetParams) {
  const items = await loadCatalog(queryFromParams(params), readSk(params));
  return items.map(toHostItem);
}
const loadGenreCatalog = loadDefaultCatalog;
const loadYearlyCatalog = loadDefaultCatalog;
async function loadDetail(link: string) {
  return toHostItem(await loadMeta(readDetailId(link), readSk()));
}
```

`WidgetParams` 定义为上述 query 参数加 `{sk?:string}`。Task 1 必须验证下面这一候选投影能在保留媒体识别的同时经 link 调用 loadDetail；若不能，该任务不得按此投影继续，须先用实测证据修订适配契约。`link` 保存豆瓣身份，不依赖宿主保留额外自定义字段。API 的 logo 首版不透传，因为已检查的宿主字段没有明确对应项。

```ts
function toHostItem(item: BridgeItem) {
  return {
    id: item.tmdbId ?? item.imdbId ?? String(item.doubanId),
    type: item.tmdbId ? "tmdb" : item.imdbId ? "imdb" : "douban",
    title: item.title, description: item.description, mediaType: item.mediaType,
    posterPath: item.images.poster ?? undefined,
    backdropPath: item.images.background ?? undefined,
    rating: item.rating === undefined ? undefined : String(item.rating),
    releaseDate: item.year, link: detailLink(item.doubanId),
  };
}
```

- [ ] **Step 5: 构建单脚本并自动验证产物。**

沿用现有 Vite 作为 Widget devDependency；scripts/build.mjs 调用 `build`，configFile=false，lib entry 为 `src/index.ts`，formats=["iife"]，name=`DoubanBridge`，fileName 固定 `douban-bridge.js`，outDir=`dist`。index.ts 尾部用 `Object.assign(globalThis, {WidgetMetadata,loadDefaultCatalog,loadGenreCatalog,loadYearlyCatalog,loadDetail})` 暴露入口。若该 globalThis 方案未通过 Task 1，先修正探针，不在构建脚本里猜另一个宿主全局。

使用现有 GitHub 仓库的 Release assets 分发静态文件，不新增托管服务。Widget 独立版本首版为 `0.1.0`，tag 为 `widget-v0.1.0`；script URL 为 `https://github.com/baranwang/stremio-addon-douban/releases/download/widget-v0.1.0/douban-bridge.js`，manifest URL 为同目录 `manifest.json`。构建阶段只生成文件，发布在任务 10 执行。后续版本使用对应 version/tag，不依赖仓库全局 latest release。

官方 manifest 顶层是 `{title,description,icon,widgets}`（2026-09-14读取）；生成同样的 envelope。WidgetMetadata 与包版本同为 `0.1.0`，build 脚本断言二者相等；不从根 Stremio 插件的 `1.1.0` 推导 Widget 版本。scripts/build.mjs 使用：

```js
import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await build({ configFile: false, build: { outDir: "dist", lib: {
  entry: "src/index.ts", name: "DoubanBridge", formats: ["iife"], fileName: () => "douban-bridge.js",
} } });
const manifest = {
  title: "Douban Bridge", description: "豆瓣影视列表与详情",
  icon: "https://stremio-addon-douban.baran.wang/icon.png",
  widgets: [{ id: "douban.bridge", title: "豆瓣", version, requiredVersion: "0.0.1",
    author: "Baran", description: "豆瓣影视列表与详情",
    url: `https://github.com/baranwang/stremio-addon-douban/releases/download/widget-v${version}/douban-bridge.js` }],
};
await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
```

WidgetMetadata 从本包 package.json 导入 version，避免手工同步；requiredVersion 采用任务 1 实测确认可用的宿主最低版本，不能只因为官方脚本写0.0.1就声称全部新能力从该版本可用。上面的0.0.1是探针起点，发布时替换为实际通过的版本值。

bundle.test.mjs 使用 `node:vm` 执行产物、注入 fake Widget，断言上述全局函数存在、13个默认集合模块均存在、年度参数可选、脚本无 ESM import/require、无 core secret 名与 Node builtin imports，且云端空页不触发本地请求。VM 测试只证明打包，不代替 Rex。

给 VM context 同时注入 Node 的 `URL`、`URLSearchParams` 与 console，避免把 VM 缺少 URL 当成 Rex 缺失。Widget 的 test script 在此任务改为 `node scripts/build.mjs && node ../../scripts/test.mjs`，保证 bundle test 永远检查本轮产物；开发 cloud 逻辑的首次失败测试可单独执行 `rtk proxy node --import tsx --test test/cloud.test.ts`，不依赖尚未完成的 bundle。

- [ ] **Step 6: 在 Rex 复测完整流程并提交。**

验证两个默认模块、一个类别模块、两个年度、第二页；有 key 的成功请求没有第二份本地列表；空页不回退；401 / 断网回退；云端、本地都失败显示宿主错误；直接详情走云端；替换 key / 变更网页图源后下次请求生效。记录真实请求计数和可见图片，不记录 key。执行 Widget test、build、bundle test，提交：

```bash
rtk proxy git add apps/rex-widget docs/testing/rex-host.md pnpm-lock.yaml
rtk proxy git commit -m 'feat(widget): load cloud catalogs with local fallback' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Task 10: 联调、部署说明和可回滚的发布准备

**Files:**
- Create: `scripts/smoke.mjs`、`docs/deployment/douban-bridge.md`
- Modify: `package.json`、`README.md`、`AGENTS.md`、`docs/testing/rex-host.md`
- Modify: 三个 Worker 的 Wrangler 配置与各包 scripts（只落实本计划约定）

**Interfaces:**
- Consumes: 三个已构建 Worker、Widget 产物、本地 D1 fixtures。
- Produces: 真实 Service Binding 联调证据、构建和发布命令、按顺序部署与回滚清单；部署本身只有在执行任务获得相应授权后进行。

- [ ] **Step 1: 补全根 workspace 命令，启动三个本地 Worker。**

根 `build` 顺序为 core → stremio → api → rex-widget；`test` 执行有 test script 的所有 workspace 包；`cf-typegen` 分别对三个 Worker 执行。不要让 `pnpm deploy` 自动同时部署所有 Worker 或自动应用远端 migration。

```bash
rtk proxy pnpm --filter @douban-bridge/core build
rtk proxy pnpm --filter @douban-bridge/stremio build
rtk proxy pnpm --filter @douban-bridge/api build
rtk proxy pnpm --filter @douban-bridge/rex-widget build
```

在三个独立终端从各包启动 preview，分别 `--port 8787`（core）、`--port 8788`（stremio）、`--port 8790`（api），都附加 `--persist-to ../../.wrangler/bridge-smoke`。core preview 使用 Cloudflare Vite 生成的部署配置（由 `.wrangler/deploy/config.json` 指向），不要拿未转换的 SSR TSX 直接启动；两个适配器使用各自源 Wrangler 配置。Service Bindings 的 service name 与 core 一致，使用 Wrangler 本地开发注册表；确认证明请求进入本地 core，不能启用 remote bindings 绕到生产。

本地覆盖 `STREMIO_ORIGIN=http://localhost:8788`、`DASH_ORIGIN=http://localhost:8787`；GET `/configure` 的 HTML 里生成的安装地址必须指向8788。真实 OAuth / Secure Cookie 最终在 HTTPS 环境验证，本地HTTP只验证 router 和字段，不宣称登录通过。

- [ ] **Step 2: 编写真实 HTTP smoke 脚本。**

```js
import assert from "node:assert/strict";
const core = "http://localhost:8787";
const stremio = "http://localhost:8788";
const api = "http://localhost:8790";
assert.equal((await fetch(`${core}/v1/catalog/movie_top250`)).status, 404);
assert.equal((await fetch(`${core}/stremio/manifest`)).status, 404);
const denied = await fetch(`${api}/v1/catalog/movie_top250`);
assert.equal(denied.status, 401);
assert.equal(denied.headers.get("cache-control"), "private, no-store");
const install = await fetch(`${stremio}/manifest.json`, { redirect: "manual" });
assert.equal(install.status, 302);
assert.match(install.headers.get("location"), /^\/[^/]+\/manifest\.json$/);
assert.equal((await fetch(`${stremio}/internal/anything`)).status, 404);
const configure = await fetch(`${stremio}/configure`);
assert.equal(configure.status, 200);
const html = await configure.text();
assert.match(html, /localhost:8788/);
assert.equal((await fetch(`${stremio}/icon.png`)).status, 200);
```

增加对 HTML 内所有 `/assets/` script/link URL 的真实请求，断言200和对应 Content-Type。每个 fetch 使用 Node 的 `AbortSignal.timeout(15000)` 防止 smoke 无限等待。这个脚本使用本地网络 URL，无生产 key。

- [ ] **Step 3: 用本地账号执行允许访问的完整链路。**

先执行 `rtk proxy pnpm --filter @douban-bridge/core exec wrangler d1 migrations apply stremio-addon-douban --local --persist-to ../../.wrangler/bridge-smoke`。在 smoke.mjs 中从根 devDependency 引入已有相同版本的 Wrangler，通过 `getPlatformProxy({configPath:resolve("apps/core/wrangler.jsonc"),persist:{path:resolve(".wrangler/bridge-smoke")}})` 连接同一个本地 D1；根只为这个检查增加对已有 Wrangler 的显式 devDependency，不依赖 pnpm 的偶然提升。

```js
const db = platform.env.STREMIO_ADDON_DOUBAN;
const testKeys = [];
for (const [index, providers] of [[0, [{ provider: "douban", extra: {} }]], [1, []]]) {
  const userId = crypto.randomUUID();
  const sk = `sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sk))).toString("hex");
  await db.prepare("INSERT INTO users (id, github_id, github_login, has_starred) VALUES (?, ?, ?, 1)")
    .bind(userId, Date.now() + index, `smoke-${userId}`).run();
  await db.prepare("INSERT INTO user_configs (user_id, image_providers) VALUES (?, ?)")
    .bind(userId, JSON.stringify(providers)).run();
  await db.prepare("INSERT INTO api_keys (user_id, key_hash, created_at) VALUES (?, ?, ?)")
    .bind(userId, hash, Date.now()).run();
  testKeys.push({ userId, sk });
}
```

`platform` 是上面的 getPlatformProxy 结果；在 finally 逐一删除本次 userId 的 api_keys / user_configs / users，再 dispose。不要输出 testKeys。用每个 sk 请求同一 API 列表，得到200且图片规则不同；撤销其中一个 key 后下一次401。mock来源的单元测试与真实公网豆瓣读取分别标注，不能混成同一种证据。至少一次真实 catalog 请求和一次 meta 请求要跨 api → 命名入口 → core → 数据源并返回可展示数据。

从有效旧 manifest 安装测试 Stremio，打开列表、详情、配置与图片；确认 Forward 兼容字段仍无条件输出。通过 core 独立 cron 测试入口确认 scheduled context 能运行；stremio/api 没有 scheduled export 或 triggers。不要在本地模拟里执行整库历史 cron，只使用少量本地 fixture。

- [ ] **Step 4: 写清生产绑定、secrets、资源和迁移顺序。**

deployment 文档列出三张实际配置清单：

| Worker | 资源与凭据 |
| --- | --- |
| core | 原 D1 `STREMIO_ADDON_DOUBAN`、原 KV、PUBLIC_RATE_LIMIT / USER_RATE_LIMIT、ASSETS、DOUBAN_API_KEY / TRAKT_CLIENT_ID / TMDB_API_KEY / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / JWT_SECRET、DASH_GITHUB_CLIENT_ID / DASH_GITHUB_CLIENT_SECRET、两个 public origin、cron |
| stremio | CORE_STREMIO → StremioEntrypoint、CORE_WEB → 默认入口、PUBLIC_RATE_LIMIT / USER_RATE_LIMIT、旧 custom domain |
| api | CORE_API → ApiEntrypoint、PUBLIC_RATE_LIMIT、新 api custom domain |

先用 `wrangler secret list` / provider 控制台核对实际存在的名称，列出的上游 key 有的可能属于 vars，不复制秘密值到文档。core 保持原 JWT_SECRET；不从部署日志恢复秘密；旧 Worker 切换后清除残留 secrets，确认两个适配器最终不再持有上游 credentials。

生产步骤必须分开执行：

1. 记录旧 Worker deployment/version ID；导出 D1 备份，保存到工作区外受控位置；记录 D1/KV ID、OAuth callback 和当前 cron。此时只读。
2. 用 `wrangler d1 migrations list stremio-addon-douban --remote` 核对待应用 SQL，审阅只新增 api_keys；测试环境应用并确认旧表未变，再在 core 包目录执行 `wrangler d1 migrations apply stremio-addon-douban --remote`。该增量迁移兼容仍在线的旧 Worker。
3. 为 core 配置现有资源及 secrets、新 dash OAuth App；首次 core 部署先禁用 cron，保留旧 Worker 的唯一 cron，避免两个写入者重叠。上传 core 并验证默认入口拒绝内部路径、dash HTTPS / OAuth / assets 正常。
4. 验证旧 users / config / mappings 仍能读取，新 api_keys 的生成、替换、撤销功能可用。
5. 部署 stremio 覆盖原 Worker 名称，原域名继续指向这个 Worker；新配置不含 D1/KV/cron。核对旧安装、登录、配置、图片后，从旧 Worker 清除多余 secrets。
6. 确认旧 Worker 已无 cron，再将 `0 * * * *` 放到 core 并部署，观察一次正常运行。生产期间最多一份映射 cron。
7. 部署 api 和 custom domain，验证401/403/200、账号配置、无 Bearer 图片加载及内部隔离。
8. 为已验证并整合到远端仓库的 commit 创建 `widget-v0.1.0` draft Release，上传 `douban-bridge.js` 和 `manifest.json` 两个 assets；核对构建 commit、版本和资源校验值后发布该 Release。最后在 Rex 导入发布 manifest URL，并完成任务9的实测矩阵。Release 发布前404是预期，不把本地文件存在当成分发成功。

文档中的每条 Wrangler 命令均写 `rtk proxy pnpm --filter @douban-bridge/core exec wrangler ...` 对应的完整命令；部署 stremio/api 用各自包 deploy script。实际生产部署、注册 OAuth App、写 secrets 和发布脚本应在成品可审阅后按执行任务的授权范围进行，不能把本次“写计划”视为这些动作已获执行授权。

- [ ] **Step 5: 写回滚操作并做最后一次验证。**

回滚顺序：先停发新 Widget / api 流量；若回滚旧 Stremio Worker 版本，先停 core cron，再恢复旧 Worker 部署及其旧绑定 / secrets / cron；新加 api_keys 表可保留，不能 DROP 原表或用旧备份覆盖用户新配置。若旧 Worker secrets 已清理，从受控备份恢复后再回滚。保留 core 和其资源直到旧路由验证通过，最后处理不再使用的部署。

执行 `pnpm test`、四 app build、三份类型生成、`node scripts/smoke.mjs`；每项记录实际 exit code。只有新增失败或新修改才重复相关检查。再运行 `git diff --check`，README 更新用户的安装域名、网页配置、Widget key 参数及开发命令，AGENTS 更新目录地图；不要在用户文档暴露 Service Binding 实现细节。

- [ ] **Step 6: 提交集成文档与检查结果。**

```bash
rtk proxy git add scripts/smoke.mjs docs/deployment/douban-bridge.md docs/testing/rex-host.md package.json README.md AGENTS.md apps/core/wrangler.jsonc apps/api/wrangler.jsonc apps/stremio/wrangler.jsonc
rtk proxy git diff --cached --check
rtk proxy git commit -m 'docs(bridge): document verified rollout and compatibility' -m 'Co-authored-by: Codex <noreply@openai.com>'
```

## Spec 覆盖检查

| Spec | 负责的任务 |
| --- | --- |
| 1–3：三个 Worker、资源归属、命名入口、静态 Widget | 2、6、7、9、10 |
| 4：13个默认集合、类别 / 年度模块、分页 | 3、8、9 |
| 5：完整云端列表、直接详情、静默回退、空页 | 4、6、8、9 |
| 6：HTTP 字段与输入 / 错误校验 | 3、6 |
| 7：映射复用、人工锁定、图片源顺序 | 4、7 |
| 8：key、账号隔离、no-store、图片独立加载 | 5、6、9 |
| 9：宿主实际能力门槛 | 1、9 |
| 10：验收矩阵和旧路径兼容 | 每任务测试、7、9、10 |
| 11：绑定配置、迁移、部署依赖 | 2、7、10 |

## 查阅依据

- [Cloudflare 多 Worker 本地开发](https://developers.cloudflare.com/workers/local-development/multi-workers/)：Service Bindings 与 Vite auxiliaryWorkers；本计划用独立 preview 端口核对各公开入口。
- [Cloudflare 命名入口](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)：services.entrypoint 与 WorkerEntrypoint，内部调用仍使用 fetch。
- [Cloudflare Vite API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)：configPath 和独立构建；core 继续用现有 SSR 插件链。
- [官方 Rex TMDB 脚本](https://assets.rexnow.tv/scripts/rex-tmdb.js)、[模块清单](https://assets.rexnow.tv/scripts/manifest.json)：模块 / params / Widget.tmdb.get；2026-09-14 读取，不能代替详情能力实测。
- 本机 `/Volumes/ExternalSSD/workspace/forward-widget-libs/packages/libs/src/env/` 与 `widget-adaptor.ts` 仅用于发现候选接口，不作为原生宿主通过证明。
