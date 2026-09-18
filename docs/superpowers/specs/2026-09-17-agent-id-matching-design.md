# Agent ID 匹配设计

- 日期：2026-09-17
- 状态：方向已确认，本文供书面审阅与实现计划引用。
- 源码基线：`f2193bc`
- 讨论来源：定时回扫无法 100% 命中的条目，用 Pi agent 做离线消歧；Oracle 评审 `agent-matching-signed-profile`。

## 1. 背景

`douban_mapping` 把豆瓣 ID 映射到 TMDB / IMDb / Trakt。Stremio 海报和跨插件链接依赖正确的 TMDB/IMDb。错配比漏配更贵。

现有两条确定性路径，且不相同：

- 请求路径 `api.findExternalId()`：从豆瓣简介抠 IMDb，Trakt 唯一命中才写；否则按标题搜。不升季 IMDb 父剧，不比年份，不标 `calibrated`。
- 小时 cron `apps/core/src/cron.ts`：选 `tmdb_id IS NULL` 且未校准的行。先按已有 IMDb 搜 Trakt；0 条且是剧时用非官方 IMDb API 升父剧。再按中文标题 / 原名 / 电影年份做唯一命中。成功时构造 `calibrated: true`，但 `persistIdMapping()` 的冲突更新**只写三个 ID**，现有行的 `calibrated` 实际不会变。

人工路径 `/dash/tidy-up` 列出缺 TMDB 的行。

本设计不替换确定性唯一命中，只处理它吃不掉的剩余项。请求路径（catalog/meta）不跑模型。

## 2. 已确认决策

| 项目 | 决策 |
| --- | --- |
| 包 | 用 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`。禁止把 `@earendil-works/pi-coding-agent` 打进 Worker |
| 入口 | 队列消息对模型只暴露 `doubanId`。Worker 在启动 agent 前自动拉取豆瓣详情放进首轮上下文 |
| 工具 | `get_douban_subject`、`search_tmdb`、`find_tmdb_by_imdb`、`get_tmdb_external_ids`、`lift_imdb_series`、`conclude_match` |
| 不做 | 封面/视觉工具、Trakt 搜索工具、任意 URL、Investigator 规划循环之外的自由浏览 |
| 写库出口 | 只有 `conclude_match`。模型不能发明候选 ID，必须引用本轮工具返回的 `candidateId` |
| 分档 | 置信度决定写哪一档；代码核验决定能不能直写。没有豆瓣 IMDb 也可以直写 |
| 直写 | `confidence >= 0.9` 且 verifier 通过 → 正式 ID，`matchSource=agent`，`calibrated=false` |
| 建议 | `0.6 <= confidence < 0.9` 且 verifier 的闭集/类型规则通过 → 只写 `agentResult`，`agentState=suggested` |
| 放弃 | `decision=none`、置信度 `< 0.6`、或直写核验失败且不够建议档 → `agentState=no_match` 并退避 |
| `calibrated` | 继续只表示人工锁。cron 不再构造 `calibrated: true`。Agent 永不写 `true` |
| 入队 | 只由小时 cron 在**自己的确定性尝试之后**入队。请求路径失败不入队 |
| 池子 | 每小时随机抽有上限的条数；agent 已给出结论的默认不再进池，直到退避到期或人审处理 |
| Trakt ID | 不给搜索工具。若选中 TMDB 经 `get_tmdb_external_ids` / 后续唯一补全能带到 Trakt，由代码写入 |
| `reason` | 落库，截断到 400 字符，同一行覆盖，不追加历史 |

## 3. 流水线

```
小时 cron
  1. 对 tmdb 为空且未校准的行跑现有确定性匹配（修过的年份/IMDb 异常）
  2. await persistIdMapping 写确定性结果；不写 calibrated。禁止 waitUntil 后立刻抽池
  3. 从剩余合格行随机抽 N 条
  4. 先 claim（pending + token + lease + revision），再 queue.send
独立 queue consumer（同一 Worker）
  5. 校验 token/revision/lease
  6. 标 running，拉豆瓣详情，跑 Pi agent
  7. conclude_match → verifier → 条件更新
  8. 落库成功后再 ack
```

语义失败与基础设施失败必须分开。Provider 认证/网络/解析异常记 `lookup_error`，做操作重试，不写成自信的 `no_match`，也不为此付模型钱。

## 4. 工具契约

所有只读工具返回裁剪后的 JSON。搜索类工具把每条结果登记到**本轮内存候选表**，并分配稳定 `candidateId`，格式 `tmdb:{movie|tv}:{id}`。季/集必须先升到父 movie/show；升不了就不登记。

### `get_douban_subject`

返回：`doubanId`、`type`、`title`、`original_title`、`year`、`pubdate`、导演最多 3、演员最多 5、`countries`、`languages`、`genres`、`intro` 截到 200 字、当前映射里的 imdb/tmdb/trakt。不返回封面、播放源、荣誉。

### `search_tmdb`

参数：`type: movie|tv`、`query`、可选 `year`。走 `TmdbAPI.search`。最多 8 条：`candidateId`、title、original_title、year、tmdbId。

### `find_tmdb_by_imdb`

参数：`imdbId`。走 `TmdbAPI.findById(imdbId, "imdb_id")`。只登记与豆瓣 `type` 一致的 movie/tv 结果。`tv_episode_results` 不得当作 show ID 登记。

### `get_tmdb_external_ids`

参数：`candidateId` 或 `(type, tmdbId)`，且必须已在候选表。走 `TmdbAPI.getExternalId`。把 IMDb 填回该候选。

### `lift_imdb_series`

参数：`imdbId`。走现有 `ImdbAPI.search`，只返回父剧 `tt`。这不是通用 IMDb 搜索。失败视为基础设施错误。

### `conclude_match`

```ts
{
  decision: "match" | "none";
  candidateId?: string; // decision=match 时必填
  confidence: number;   // 0..1
  reason: string;
}
```

`execute()` 是系统边界：取候选元组、跑 verifier、按分档条件更新 D1。Agent 看不到 D1。若一轮结束没有合法 `conclude_match`，consumer 记 `no_match`，reason=`agent_no_conclusion`，不写正式 ID。

## 5. Verifier 与分档

置信度阈值（实现里用命名常量，禁止散落魔法数）：

- `AGENT_AUTO_WRITE_MIN_CONFIDENCE = 0.9`
- `AGENT_SUGGEST_MIN_CONFIDENCE = 0.6`
- `AGENT_REASON_MAX_CHARS = 400`

Verifier **不**把豆瓣 IMDb 当作直写入场券。能靠 IMDb 唯一命中的条目不应进入 agent。

直写必须同时满足：

1. `decision=match` 且 `confidence >= 0.9`
2. `candidateId` 在本轮候选表
3. 候选是 movie 或 tv/show，与豆瓣 `type` 一致
4. 写入的 tmdb/imdb/trakt 全部来自该候选，缺的就留空；禁止与旧行拼出另一部作品的 ID 元组
5. 若豆瓣侧有 IMDb 且候选也有 IMDb，二者必须相同；冲突则**降级建议**，不直写
6. 标题/年份用作否决与旁证：明显翻拍年份冲突则否决直写；缺年份不单独否决
7. 条件更新成功（见第 6 节）。0 行表示过期，不是匹配成功

建议档：`0.6 <= confidence < 0.9`，仍需满足 2–4（闭集、类型、不发明 ID）。正式 ID 列不动。

`none` 或 `< 0.6`：不写正式 ID，进入 `no_match` 退避。

## 6. 数据

扩展现有 `douban_mapping`，不新建工作流表。无外键。只加一列 `agent` text JSON。正式海报仍用原来的 `tmdb_id` / `imdb_id` / `trakt_id` / `calibrated`。

`agent` 同行覆盖，不追加历史。进行中只放 `token` + `leaseUntil`；评完后清掉 token，留下 `status`（`suggested` / `no_match`）和给人看的 `confidence` / `reason` / 建议 ID。对话、搜索 JSON、封面不进 D1。评过的默认不再入池。

Agent 正式写入的条件：`calibrated` 不是 true、`tmdb_id` 为空、`agent.token` 对得上且租约未过期。成功时一次写上正式 ID，并把 `agent` 收成结论 JSON（去掉 token/lease）。

`persistIdMapping()` 保持「空值保留旧 ID」，**不要**把 `calibrated` 加进通用 upsert。已有非空 `tmdb_id` 时，自动路径不得用不同的 TMDB ID 覆盖。

## 7. 入池与 cron

合格：`tmdb_id` 为空、未校准、`agent` 为空。评过（`suggested` / `no_match`）和租约未过期的 claim 不再入池。

抽取：`ORDER BY RANDOM() LIMIT N`。`N` 来自 `AGENT_MATCH_HOURLY_LIMIT`，默认 20。先 claim（写入 `token` + `leaseUntil`）再 `queue.send`。过期 claim 由后续 cron 清掉 token 后可重新抽取。新 token 作废旧消息。

确定性阶段的必要修复（不是重写匹配策略）：

- 电影年份比较前，两边都必须是有效年份。禁止 `undefined === undefined` 当成唯一年份命中
- `imdbAPI.search` 必须局部 catch，记录后继续标题回退；`Promise.allSettled` 不能代替这一步
- 去掉 cron 里的 `calibrated: true`

小时 cron 仍处理确定性匹配的全量合格行（现有行为），**仅 agent 入队**有条数上限。若确定性全量在未来成为超时点，另开任务，不在本设计扩大范围。

## 8. Queue 运行时

同一 Worker 增加 `queue` handler，binding 名 `AGENT_MATCH_QUEUE`。

- `max_batch_size = 1`
- `max_concurrency = 1`
- 单条 ack：只有 D1 结果持久化后才 ack。临时失败走 Queue 重试；语义失败写入 `agent.status=no_match`，评过不再入池
- 消费者必须跑在 `asyncLocalStorage` 里，与 cron 一样，因为 API 客户端靠 ALS
- 消息：`{ doubanId, agentToken }`
- 不保证模型计费恰好一次：模型已返回但未落库时崩溃可能重打

测试用假 `send()`，不依赖本地 Queue。

## 9. tidy-up

列表从「所有缺 TMDB」改为三个视图：

- 建议：`agent.status = suggested` 且正式 `tmdb_id` 为空
- Agent 已写未校准：正式 `tmdb_id` 有值、未校准、`agent` 非空
- 无匹配：`agent.status = no_match`

详情页展示截断 `reason`、confidence、选中候选。

- 确认：正式 ID（若还没有则采用建议）、`calibrated=true`、清空 `agent`
- 驳回：若正式 ID 是本次 agent 写的，清空正式三 ID；`agent.status=no_match`
- 普通保存清空 `agent`，作废未完成 claim

顺带：空表单字段不得 `z.coerce.number()` 成 `0`。空字符串当 null。

## 10. 明确不做

- 请求路径跑模型
- Agent 写 `calibrated=true`
- 复用 `persistIdMapping()` 作为 agent 授权边界
- 把搜索结果或对话塞进 D1
- Trakt 搜索工具、封面工具、通用 IMDb 搜索
- 重写 `findExternalId()` 的策略（除了与 cron 护栏重叠的、已列出的 bug）
- Cloudflare Agents SDK、Durable Object 工作流框架

## 11. 测试要求

在开启正式 agent 直写之前，至少覆盖：

- 人审与过期 worker 的条件更新（0 行）
- 重复投递同一 token
- 缺年份不得被 cron 当成唯一年份命中
- episode 不得登记为 show TMDB ID
- 不兼容的部分 ID 元组不得直写
- provider 错误 vs 空结果
- 三档结论：auto-write / suggested / no_match
- 评过的 `suggested`/`no_match` 不进随机池
- 空表单保存不得写成 `tmdb_id=0`
