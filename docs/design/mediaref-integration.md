# douban-bridge 迁移到 MediaRef 设计稿

状态：第 1 步已实现。

## 目标

逐步废弃 douban-bridge 自己维护的映射数据（`douban_mapping`、agent-match、tidy-up），改成以 MediaRef 为唯一的映射来源。douban-bridge 只做两件事：读 MediaRef，以及在 MediaRef 查不到时提交线索。

不在范围内：D1 里的用户、配置、API key。这些是 douban-bridge 自己的业务数据，继续保留。

## 分三步

| 步骤 | 内容 | 本 PR |
|---|---|---|
| 1 | 停掉 agent；读映射时 MediaRef 优先，本地只读备用；查不到就提交线索；反馈入口改为跳转到 MediaRef 首页；加命中率日志 | ✅ |
| 2 | 在 MediaRef 那边把本地已确认的映射用 seed 导入；观察命中率 | ❌（MediaRef 仓库的事） |
| 3 | 命中率够了之后，删掉本地备用、`douban_mapping`、`mapping_feedback`、`findExternalId` | ❌ |

---

## 1. MediaRef 接口（以 proto 为准）

`@media-ref/client` 没有发布到 npm，所以直接调 Connect 协议的 JSON HTTP：`POST https://api.mediaref.org/mediaref.v1.<Service>/<Method>`，请求头带 `Content-Type: application/json` 和 `X-API-Key`。

| 用途 | RPC | 权限 |
|---|---|---|
| 读映射 | `MediaService/BatchGetMedia`（每次最多 100 个 ref） | read |
| 提交线索 | `ChangeRequestService/CreateChangeRequest` | submit |

一个带 SUBMIT scope 的 key 同时有 read 和 submit 权限。签发前，key 所属账号要先验证邮箱。

接口的关键语义：

- **读**：`{ refs: [{ douban: "1292052" }], includeUnconfirmed }`。命中时，`document.externalIds` 里有 `{namespace:"tmdb", nativeId:"movie:278"}`、`imdb`、`trakt` 等。没查到时，服务端会自动记一条需求，并把这个豆瓣编号排进取证队列，所以“没查到”本身就已经算一次反馈。
- **`includeUnconfirmed: true`**：结果里会多出 `seed_unconfirmed` 关联和还在审核中的变更请求（按变更请求的 target 解析到 media）。但如果 target 指向的 TMDB 条目在 MediaRef 里还没有，就读不到。
- **写**：`{ target: { tmdb: { type: "MEDIA_TYPE_MOVIE", id } }, namespace: "douban", nativeId, segments: [] }`。`douban` 属于需要取证的 namespace，提交后先进 `PENDING_EVIDENCE`，过了取证关卡才生效。

## 2. 停掉 agent（第 1 步）

| 位置 | 改动 |
|---|---|
| `src/index.tsx` | 去掉 `queue: handleAgentMatchBatch` |
| `src/cron.ts` | 去掉 `recoverExpiredClaims` / `claimAgentJobs` 入队部分。前半段 Trakt 回填（只写本地）一并停掉，因为本地库已经改成只读，cron 只剩空壳，整个删掉，`wrangler.jsonc` 的 `triggers.crons` 也一起去掉 |
| `wrangler.jsonc` | 删除 `queues`（producer + consumer）、`AGENT_MATCH_GATEWAY_*` vars；`ai` binding 如果没有其他用途就一起删 |
| `services/catalog.ts`、`services/metadata.ts` | 不再调用 `persistAndEnqueueUnmatched` |
| `routes/dash/tidy-up/*`、`routes/dash` 的 `/feedback` | 下线（移除路由注册和入口链接） |
| `libs/agent-match/` | 删除整个目录 |
| 测试 | 删除 `agent-match-*.test.ts`、`tidy-up-agent.test.ts`、`cron.test.ts`、`mapping-feedback.test.ts`、`feedback-search.test.ts`；修改 `catalog.test.ts`、`metadata.test.ts` |
| 依赖 | `@earendil-works/pi-*`、`exa-js` 如果没有其他引用就移除 |
| secrets | `EXA_API_KEY` 不再需要，部署后可以删掉 |

不做数据库 migration：`douban_mapping.agent` 列、`mapping_feedback` 表和 `pi_token_usage` 表先留着，第 3 步再一起删，免得这一步要回滚时还得恢复表结构。

## 3. 读路径

全部收进 `api.fetchIdMapping(items)`。目前这个函数只接收 `doubanIds`，现在改成接收 `{ doubanId, type, title }[]`，这样它自己就能完成兜底查询和提交线索，两个调用方（catalog 和 metadata 的 `enrich=true` 分支）只需要把参数改一下。

```
fetchIdMapping(items)
  1. 并行：MediaRef BatchGetMedia(includeUnconfirmed=true, 超时 1.5s)
           本地 douban_mapping 只读查询
           KV 线索缓存 mediaref:lead:<doubanId>
  2. 对每个 doubanId，按顺序取第一个有 tmdbId 的：
       a. MediaRef 已确认的关联
       b. MediaRef 未确认的关联（seed / 审核中）
       c. 本地 douban_mapping（只读备用）
       d. KV 线索缓存
  3. 都没有 → findExternalId（豆瓣 IMDb → Trakt，现有逻辑）
       找到 → 写 KV 缓存（TTL 7 天）+ waitUntil(CreateChangeRequest) 提交线索
       没找到 → 写 KV 空缓存（TTL 1 天），避免每次请求都重新查
  4. 打一行命中统计：{ total, mediarefConfirmed, mediarefUnconfirmed, local, lead, miss, mediarefError }
```

- **为什么用 `includeUnconfirmed=true`**：过渡期覆盖率优先。douban-bridge 自己提交的线索在审核期间也能读到（前提是 MediaRef 里已有对应的 TMDB 条目），读不到的由 KV 缓存补上。代价是会读到别人还没确认的数据，所以确认的结果优先于未确认的。
- **本地和 MediaRef 冲突时**：MediaRef 优先，包括本地 `calibrated=true` 的条目。本地这些数据在第 2 步会导入 MediaRef，冲突交给 MediaRef 去裁决。命中统计里单独记录冲突数，方便第 2 步排查。
- **失败隔离**：MediaRef 超时、非 2xx、JSON 解析失败、没配 key，一律当作这一批全部没查到，记一次 `mediarefError`，继续走 c、d 和第 3 条。本地查询和 KV 查询不等 MediaRef 出结果。
- **只提交电影**：`type === "tv"` 的条目照样查 `findExternalId` 和写 KV，但不提交给 MediaRef（原因见第 6 节分季问题）。
- **提交线索的去重**：只有在“这次真的调用了 `findExternalId` 并且找到了结果”时才提交，KV 缓存命中时不提交，所以每个条目大约每 7 天最多提交一次。另外每次请求最多提交 N=5 条，防止一次目录页就把提交配额用光。
- **`metadata.ts` 里 `enrich=false` 的分支**：现在会往本地插一条空行（为了让 cron 去补）。cron 删掉以后这一步没有意义了，改成和 `enrich=true` 走同一个 `fetchIdMapping`，或者只读不写。我倾向于只读不写，不引入新的外部调用。

## 4. 用户反馈：跳转到 MediaRef 首页

`GET /feedback` 改为 302 跳转到 `https://mediaref.org/`。

- `page-shell.tsx`、`configure.tsx` 里现有的 `/feedback` 链接都不用改，旧书签也照样能用。
- 删掉 `routes/feedback.tsx` 里的表单提交（`POST /`）、TMDB 搜索（`/search`）和图片（`/image`）子路由，以及 `feedback-form.tsx`（含 `FeedbackSearchItem`）、`mapping-feedback-list.tsx` 这两个组件。
- 用户的反馈历史不再展示。`mapping_feedback` 表保留到第 3 步再删。
- douban-bridge 不再替用户提交。用户在 MediaRef 用自己的账号提交，提交人记录正确，修改理由也能直接写在那边。
- MediaRef 以后有了条目页或带预填参数的提交页，只要把跳转地址换成 `https://mediaref.org/media/douban:<id>` 这一类深链。这需要 MediaRef 那边先定好链接格式。

## 5. 配置

| 名称 | 类型 | 说明 |
|---|---|---|
| `MEDIAREF_API_KEY` | secret | 在 MediaRef 签发一个带 SUBMIT scope 的 key。部署时运行 `wrangler secret put MEDIAREF_API_KEY`。没配时：读映射退回本地 + KV，不提交线索 |

base URL 写死为 `https://api.mediaref.org`，测试里注入 `fetch`。KV 用现有的 `KV` binding，key 加 `mediaref:lead:` 前缀。

## 6. MediaRef 还缺的（写进 PR 描述）

1. **来源 / 置信度**：服务端把 `submitter_type` 写死为 `human`。`findExternalId` 用规则搜出来的线索也会被标成人工提交。LeadService 删掉以后，已经没有“低置信线索”的入口了。
2. **季不确定**：调用方不知道季号时，没有“交给 MediaRef 判断季”的选项。豆瓣常常一季一个条目，按 `segments: []` 提交会和同一部剧其他季的关联冲突，所以自动线索暂时只提交电影。
3. **未确认数据的可见性**：`includeUnconfirmed` 读不到 target 指向的 media 还没创建的那些变更请求。
4. **网站深链**：MediaRef 网站目前只有首页，douban-bridge 的反馈没法跳到具体条目。

## 7. 测试

新增 `test/mediaref.test.ts`，修改现有测试，继续用 vitest + `test/context.ts`，用 mock fetch 模拟 MediaRef：

- **MediaRef 命中**：用 MediaRef 的 tmdb/imdb，不调用 `findExternalId`，也不提交线索。确认的结果优先于未确认的，MediaRef 优先于本地。
- **没查到，退回本地**：MediaRef 没有结果、本地有 → 用本地。本地也没有、KV 有 → 用 KV。
- **MediaRef 报错，退回本地**：fetch 抛错、返回 500、超时三种情况，结果都和第 2 条一致，并记一次 `mediarefError`。
- **提交线索**：`findExternalId` 找到电影 → 发一次 `CreateChangeRequest`，请求体符合 proto，写 KV。电视剧不提交。KV 缓存命中时不重复提交。每次请求最多提交 5 条。提交失败不影响返回结果。
- **反馈**：`GET /feedback` 返回 302，`Location` 是 `https://mediaref.org/`。
- **agent 已移除**：`index.tsx` 导出的对象里没有 `queue`；catalog 和 metadata 不会入队。

## 已定的取舍

- **Q1 本地人工校准 vs MediaRef**：MediaRef 优先，包括 `calibrated=true` 的条目，冲突数记在命中统计的 `conflict` 字段里。唯一的例外：本地 `calibrated=true` 但没有任何编号（人工确认“没有对应”），视为本地命中，不再现查，也不会因此提交线索。
- **Q2 tidy-up**：整个 `/dash` 一起下线（里面只有 tidy-up、反馈列表和给它们用的图片代理），stremio Worker 的转发白名单也去掉了 `/dash/tidy-up`。
- 现查本身出错（`findExternalId` 抛错）时不写 KV，下次请求再查；查完确实没找到才写 1 天的空缓存。
- `metadata.ts` 里 `enrich=false` 的分支只读本地，不再插入空行。
