# Agent ID Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在小时 cron 的确定性回扫之后，用 Pi agent 离线处理无法唯一命中的豆瓣条目，按置信度直写或进入 tidy-up 建议，且不把模型放进 catalog/meta 热路径。

**Architecture:** 确定性匹配仍由 `cron.ts` / `findExternalId()` 负责。cron 成功写入后，从剩余合格行随机抽有上限的条目，先 D1 claim 再投递 `AGENT_MATCH_QUEUE`。同一 Worker 的 `queue` handler 在 ALS 上下文中启动 `pi-agent-core`，只暴露 Douban/TMDB/IMDb 只读工具和唯一出口 `conclude_match`。落库走独立条件 UPDATE，不复用 `persistIdMapping()` 作为授权边界。

**Tech Stack:** Cloudflare Workers + D1 + Queues、Drizzle、Hono、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、Zod v4、`node:test`。

**Spec:** `docs/superpowers/specs/2026-09-17-agent-id-matching-design.md`

## Global Constraints

- 请求路径（catalog/meta / `findExternalId`）不得调用模型。
- 禁止依赖 `@earendil-works/pi-coding-agent`。只允许 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai`。
- Agent 不得写 `calibrated=true`。该字段仍是人工锁。
- 模型不得发明 TMDB ID；`conclude_match.candidateId` 必须来自本轮工具登记的候选表。
- 不给 Trakt 搜索工具、封面工具、任意 URL 工具。
- 不把搜索原始 JSON、对话 trace、封面 URL 写入 D1。`agent_result.reason` 最长 400 字，同行覆盖。
- 阈值必须用命名常量：`AGENT_AUTO_WRITE_MIN_CONFIDENCE = 0.9`、`AGENT_SUGGEST_MIN_CONFIDENCE = 0.6`、`AGENT_REASON_MAX_CHARS = 400`、`AGENT_MATCH_HOURLY_LIMIT = 20`。
- D1 schema 不加 `.references()`。
- API 客户端只能在 `asyncLocalStorage` 请求/scheduled/queue 上下文中调用。
- 测试用 `withTestContext`（`apps/core/test/context.ts`）。Queue 在测试中 mock `send()`，不依赖本地 Queue 运行时。
- 单包测试：`pnpm --filter @douban-bridge/core test`。根目录 `pnpm test` 也可。
- 提交信息末尾附 `Co-authored-by: Codex <noreply@openai.com>`。
- 每个 task 结束再提交。不要把无关文件打进同一个 commit。

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `apps/core/src/db/schema.ts` | 修改 | `douban_mapping` 增加 agent 列 |
| `apps/core/drizzle/0004_agent_matching.sql` | 创建 | 对应 migration |
| `apps/core/src/libs/agent-match/constants.ts` | 创建 | 阈值、退避、租约、策略版本 |
| `apps/core/src/libs/agent-match/types.ts` | 创建 | 消息、候选、`agentResult` schema |
| `apps/core/src/libs/agent-match/candidates.ts` | 创建 | 本轮候选登记与 `candidateId` |
| `apps/core/src/libs/agent-match/verifier.ts` | 创建 | `conclude_match` 核验与分档 |
| `apps/core/src/libs/agent-match/tools.ts` | 创建 | Douban/TMDB/IMDb 只读工具 |
| `apps/core/src/libs/agent-match/writer.ts` | 创建 | 条件 UPDATE |
| `apps/core/src/libs/agent-match/pool.ts` | 创建 | 随机抽、claim、回收 |
| `apps/core/src/libs/agent-match/prompt.ts` | 创建 | 系统提示 |
| `apps/core/src/libs/agent-match/runner.ts` | 创建 | 组装 Pi agent 并跑一轮 |
| `apps/core/src/libs/agent-match/queue.ts` | 创建 | Queue consumer |
| `apps/core/src/cron.ts` | 修改 | 确定性修复 + 入队 |
| `apps/core/src/libs/api/index.ts` | 修改 | persist 护栏与 revision |
| `apps/core/src/index.tsx` | 修改 | 导出 `queue` |
| `apps/core/wrangler.jsonc` | 修改 | Queue producer/consumer |
| `apps/core/wrangler.test.jsonc` | 修改 | 测试用 Queue binding 名（可选 dummy） |
| `apps/core/src/routes/dash/tidy-up/index.tsx` | 修改 | 三个视图 |
| `apps/core/src/routes/dash/tidy-up/detail.tsx` | 修改 | 空表单、确认/驳回 |
| `apps/core/test/cron.test.ts` | 修改 | 年份/IMDb catch |
| `apps/core/test/agent-match-*.test.ts` | 创建 | 各模块测试 |
| `apps/core/package.json` | 修改 | 增加 Pi 依赖（Task 8） |

---

### Task 1: Mapping schema

给 `douban_mapping` 加上 agent 工作列。不在本 task 写业务逻辑。

**Files:**
- Modify: `apps/core/src/db/schema.ts`
- Create: `apps/core/drizzle/0004_agent_matching.sql`
- Test: `apps/core/test/agent-match-schema.test.ts`

**Interfaces:**
- Consumes: 现有 `doubanMapping` 表。
- Produces: Drizzle 列 `matchSource`、`mappingRevision`、`agentState`、`agentToken`、`agentLeaseUntil`、`nextAgentAt`、`agentAttempts`、`agentInputHash`、`agentResult`；Zod `doubanMappingSchema` 同步这些可选字段。`mappingRevision` 默认 `0`，`agentAttempts` 默认 `0`。

- [ ] **Step 1: 写失败测试**

创建 `apps/core/test/agent-match-schema.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("new mapping rows get agent columns with defaults", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 42, imdbId: "tt1" });
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 42) });
    assert.equal(row?.mappingRevision, 0);
    assert.equal(row?.agentAttempts, 0);
    assert.equal(row?.matchSource, null);
    assert.equal(row?.agentState, null);
    assert.equal(row?.agentResult, null);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-schema.test.ts`

Expected: FAIL，Drizzle/SQLite 抱怨未知列或 schema 没有这些字段。

- [ ] **Step 3: 改 schema**

在 `apps/core/src/db/schema.ts` 的 `doubanMapping` 中 `calibrated` 之后追加：

```ts
  matchSource: text("match_source"),
  mappingRevision: int("mapping_revision").notNull().default(0),
  agentState: text("agent_state"),
  agentToken: text("agent_token"),
  agentLeaseUntil: int("agent_lease_until"),
  nextAgentAt: int("next_agent_at"),
  agentAttempts: int("agent_attempts").notNull().default(0),
  agentInputHash: text("agent_input_hash"),
  agentResult: text("agent_result"),
```

`doubanMappingSchema` 追加：

```ts
  matchSource: z.enum(["deterministic", "agent", "human"]).nullish(),
  mappingRevision: z.coerce.number().nullish(),
  agentState: z.enum(["pending", "running", "suggested", "no_match"]).nullish(),
  agentToken: z.string().nullish(),
  agentLeaseUntil: z.coerce.number().nullish(),
  nextAgentAt: z.coerce.number().nullish(),
  agentAttempts: z.coerce.number().nullish(),
  agentInputHash: z.string().nullish(),
  agentResult: z.string().nullish(),
```

创建 `apps/core/drizzle/0004_agent_matching.sql`：

```sql
ALTER TABLE `douban_mapping` ADD `match_source` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `mapping_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_state` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_token` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_lease_until` integer;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `next_agent_at` integer;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_input_hash` text;
--> statement-breakpoint
ALTER TABLE `douban_mapping` ADD `agent_result` text;
```

不要手改 `drizzle/meta` 快照。若随后跑 `drizzle-kit generate` 产生了重复 migration，删掉重复的，只保留 `0004_agent_matching.sql`。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-schema.test.ts`

Expected: PASS。`withTestContext` 会按文件名应用 `drizzle/*.sql`。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/db/schema.ts apps/core/drizzle/0004_agent_matching.sql apps/core/test/agent-match-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add agent matching columns to douban_mapping

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 2: Deterministic cron guards

修 cron 三个已确认坑：假 `calibrated`、IMDb 升主抛错跳过标题回退、缺年份 `undefined === undefined`。

**Files:**
- Modify: `apps/core/src/cron.ts`
- Modify: `apps/core/test/cron.test.ts`

**Interfaces:**
- Consumes: 现有 `scheduled()`、`api.persistIdMapping()`、`ImdbAPI.search()`。
- Produces: 成功映射对象不再包含 `calibrated: true`。`imdbAPI.search` 失败时该条目继续标题搜索。年份比较仅在两边都是有效数字/非空年份字符串时成立。

- [ ] **Step 1: 扩展 cron 测试**

在 `apps/core/test/cron.test.ts` 追加两个测试（保留现有 batch-isolation 测试）：

```ts
test("cron does not treat missing years as a unique year match", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 10 });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "movie",
        title: "同名电影",
        original_title: "Same Name",
        year: undefined,
      }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "movie" as const, movie: { title: "Other", year: undefined, ids: { trakt: 1, tmdb: 1, imdb: "tt1" } } },
        { type: "movie" as const, movie: { title: "Same Name", year: 1999, ids: { trakt: 2, tmdb: 2, imdb: "tt2" } } },
      ]);
      mock.method(api.traktAPI, "getSearchResultField", (item: { movie?: { title?: string; year?: number; ids?: object } }, field: string) => {
        if (field === "ids") return item.movie?.ids;
        if (field === "original_title") return item.movie?.title;
        if (field === "year") return item.movie?.year;
        return null;
      });
      const pending: Promise<unknown>[] = [];
      const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as ExecutionContext;
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, ctx);
      await Promise.all(pending);
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 10) });
      assert.equal(row?.tmdbId ?? null, null);
    } finally {
      mock.restoreAll();
    }
  });
});

test("cron continues to title search after IMDb parent lookup throws", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 11, imdbId: "tt-season" });
      mock.method(api.traktAPI, "searchByImdbId", async () => []);
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "tv",
        title: "独一部剧",
        original_title: "Only Show",
        year: "2020",
      }));
      mock.method(ImdbAPI.prototype, "search", async () => {
        throw new Error("IMDb down");
      });
      mock.method(api.traktAPI, "search", async () => [
        { type: "show" as const, show: { ids: { trakt: 9, tmdb: 99, imdb: "tt-show" } } },
      ]);
      const pending: Promise<unknown>[] = [];
      const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as ExecutionContext;
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, ctx);
      await Promise.all(pending);
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 11) });
      assert.equal(row?.tmdbId, 99);
      assert.notEqual(row?.calibrated, true);
    } finally {
      mock.restoreAll();
    }
  });
});
```

若 `getSearchResultField` 的 mock 与真实实现冲突，直接 `mock.method` 覆盖并保证 `formatIdsToIdMapping` 仍可用；必要时改成只 mock `search`/`searchByImdbId`，让真实 `getSearchResultField` 读取 `movie`/`show`。

- [ ] **Step 2: 跑测试确认新用例失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/cron.test.ts`

Expected: 缺年份用例 FAIL（当前会写入 tmdb 1 或 2）；IMDb throw 用例 FAIL（当前该条被 skipped，tmdb 仍空）。

- [ ] **Step 3: 改 `cron.ts`**

1. `formatIdMapping` 返回值去掉 `calibrated: true`，只返回 `{ ...mapping, doubanId }`。
2. 把 `const resp = await imdbAPI.search(imdbId)` 包进 `try/catch`；失败 `console.warn` 后保持 `data` 为空，不要 throw。
3. 年份过滤改成：

```ts
const doubanYear = doubanDetail.year?.toString();
const yearsMatches = results.filter((item) => {
  const candidateYear = api.traktAPI.getSearchResultField(item, "year")?.toString();
  return Boolean(doubanYear && candidateYear && candidateYear === doubanYear);
});
```

- [ ] **Step 4: 再跑 cron 测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/cron.test.ts`

Expected: 三个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/cron.ts apps/core/test/cron.test.ts
git commit -m "$(cat <<'EOF'
fix(core): stop cron false year matches and keep calibrated human-only

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 3: persistIdMapping write guard

自动路径不得用另一个 TMDB ID 覆盖已有 TMDB；正式 ID 写入时增加 `mappingRevision`。

**Files:**
- Modify: `apps/core/src/libs/api/index.ts`
- Test: `apps/core/test/persist-id-mapping.test.ts`

**Interfaces:**
- Consumes: `persistIdMapping(mappings, skipNil?)`。
- Produces: 同一函数。冲突更新增加：`tmdb_id` 仅当旧值为空或新值等于旧值时更新；`mapping_revision` 在本次 excluded 含任何非空 ID 时 +1；若当前 `match_source` 为空且写入了非空 ID，设为 `deterministic`。`calibrated` 仍不在 upsert set 里。

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("persistIdMapping does not replace an existing tmdb id", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, mappingRevision: 1, matchSource: "agent" });
    await api.persistIdMapping([{ doubanId: 1, tmdbId: 202, imdbId: "tt-new", traktId: 3 }]);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 1) });
    assert.equal(row?.tmdbId, 101);
    assert.equal(row?.imdbId, "tt-new");
    assert.equal(row?.matchSource, "agent");
  });
});

test("persistIdMapping bumps revision when writing ids to an empty row", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 2 });
    await api.persistIdMapping([{ doubanId: 2, tmdbId: 5, imdbId: "tt5", traktId: 5 }]);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 2) });
    assert.equal(row?.tmdbId, 5);
    assert.equal(row?.mappingRevision, 1);
    assert.equal(row?.matchSource, "deterministic");
    assert.notEqual(row?.calibrated, true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/persist-id-mapping.test.ts`

Expected: FAIL（当前会覆盖 tmdb 101→202，revision 保持 0，matchSource 为空）。

- [ ] **Step 3: 改 upsert `set`**

在 `persistIdMapping` 的 `onConflictDoUpdate.set` 使用：

```ts
tmdbId: sql`CASE
  WHEN ${doubanMapping.tmdbId} IS NULL THEN excluded.tmdb_id
  ELSE ${doubanMapping.tmdbId}
END`,
imdbId: sql`COALESCE(excluded.imdb_id, ${doubanMapping.imdbId})`,
traktId: sql`COALESCE(excluded.trakt_id, ${doubanMapping.traktId})`,
mappingRevision: sql`CASE
  WHEN excluded.tmdb_id IS NOT NULL OR excluded.imdb_id IS NOT NULL OR excluded.trakt_id IS NOT NULL
  THEN ${doubanMapping.mappingRevision} + 1
  ELSE ${doubanMapping.mappingRevision}
END`,
matchSource: sql`COALESCE(${doubanMapping.matchSource}, 'deterministic')`,
```

`setWhere` 保持 `or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated))`。不要在 set 里写 `calibrated`。

对已有 tmdb 的行，imdb/trakt 仍允许用 COALESCE 补空；tmdb 不变。这是为了挡住过期自动结果覆盖 agent 已写的 TMDB。

- [ ] **Step 4: 跑 persist 测试 + catalog 测试**

Run:

```bash
pnpm --filter @douban-bridge/core exec node --import tsx --test test/persist-id-mapping.test.ts test/catalog.test.ts test/cron.test.ts
```

Expected: PASS。catalog 仍只补缺失项。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/api/index.ts apps/core/test/persist-id-mapping.test.ts
git commit -m "$(cat <<'EOF'
fix(core): keep existing tmdb ids in persistIdMapping

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 4: Candidate registry and verifier

纯函数。不碰 D1、不碰 Pi。

**Files:**
- Create: `apps/core/src/libs/agent-match/constants.ts`
- Create: `apps/core/src/libs/agent-match/types.ts`
- Create: `apps/core/src/libs/agent-match/candidates.ts`
- Create: `apps/core/src/libs/agent-match/verifier.ts`
- Test: `apps/core/test/agent-match-verifier.test.ts`

**Interfaces:**
- Consumes: 无运行时依赖。
- Produces:

```ts
export const AGENT_AUTO_WRITE_MIN_CONFIDENCE = 0.9;
export const AGENT_SUGGEST_MIN_CONFIDENCE = 0.6;
export const AGENT_REASON_MAX_CHARS = 400;
export const AGENT_MATCH_HOURLY_LIMIT = 20;
export const AGENT_LEASE_MS = 10 * 60 * 1000;
export const AGENT_POLICY_VERSION = "v1";
export const AGENT_BACKOFF_MS = [86_400_000, 259_200_000, 604_800_000] as const;

export type CandidateId = `tmdb:${"movie" | "tv"}:${number}`;
export class CandidateRegistry {
  register(candidate: Omit<CanonicalCandidate, "candidateId"> & { candidateId?: CandidateId }): CanonicalCandidate;
  get(id: string): CanonicalCandidate | undefined;
  has(id: string): boolean;
  list(): CanonicalCandidate[];
}
export function makeCandidateId(type: "movie" | "tv", tmdbId: number): CandidateId;
export function parseCandidateId(id: string): { type: "movie" | "tv"; tmdbId: number } | null;
export function truncateReason(reason: string): string;
export function computeNextAgentAt(attempts: number, now?: number): number;
export function hashAgentInput(input: { doubanId: number; title: string; originalTitle?: string | null; year?: string | null; type: string; imdbId?: string | null }): string;

export function verifyConcludeMatch(input: {
  decision: "match" | "none";
  candidateId?: string;
  confidence: number;
  reason: string;
  registry: CandidateRegistry;
  douban: { type: "movie" | "tv"; title: string; originalTitle?: string | null; year?: string | null; imdbId?: string | null };
}): {
  tier: "auto" | "suggest" | "none";
  code: string;
  candidate?: CanonicalCandidate;
  reason: string;
};
```

`CanonicalCandidate` 字段：`candidateId`、`type`、`tmdbId`、`title?`、`originalTitle?`、`year?`、`imdbId?`、`traktId?`。

- [ ] **Step 1: 写失败测试**

`apps/core/test/agent-match-verifier.test.ts` 覆盖 spec 第 5 节：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch, truncateReason } from "../src/libs/agent-match/verifier";
import { AGENT_REASON_MAX_CHARS } from "../src/libs/agent-match/constants";

const douban = { type: "movie" as const, title: "盗梦空间", originalTitle: "Inception", year: "2010", imdbId: null };

test("high confidence closed-set pick auto-writes without imdb anchor", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception", year: "2010" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.95,
    reason: "原名与年份一致",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "auto");
  assert.equal(verdict.candidate?.tmdbId, 27205);
});

test("imdb conflict downgrades auto-write to suggest", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 1, title: "Foo", imdbId: "tt-other" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.99,
    reason: "猜的",
    registry,
    douban: { ...douban, imdbId: "tt-real" },
  });
  assert.equal(verdict.tier, "suggest");
});

test("unknown candidateId cannot write", () => {
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: "tmdb:movie:1",
    confidence: 0.99,
    reason: "编造",
    registry: new CandidateRegistry(),
    douban,
  });
  assert.equal(verdict.tier, "none");
});

test("medium confidence becomes suggest", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.7,
    reason: "比较像",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "suggest");
});

test("type mismatch cannot write", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "tv", tmdbId: 1396, title: "Breaking Bad" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.99,
    reason: "同名",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "none");
});

test("truncateReason caps length", () => {
  const reason = truncateReason("x".repeat(500));
  assert.equal(reason.length, AGENT_REASON_MAX_CHARS);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-verifier.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现四个文件**

`constants.ts` 按 Interfaces 原样导出数字常量。

`candidates.ts`：`makeCandidateId` 返回 `` `tmdb:${type}:${tmdbId}` ``。`register` 用 candidateId 去重，后写补空字段不覆盖已有非空值。`parseCandidateId` 用 `/^tmdb:(movie|tv):(\d+)$/` 。episode/season 不在本层出现；调用方不得传入。

`verifier.ts` 逻辑顺序：

1. `truncateReason`
2. `decision === "none"` 或 `confidence < 0.6` → `{ tier: "none", code: "low_confidence" | "none" }`
3. 无/未知 `candidateId` → none `unknown_candidate`
4. `candidate.type !== douban.type` → none `type_mismatch`
5. 豆瓣与候选都有 IMDb 且不同 → **最多** suggest `imdb_conflict`（即使 confidence≥0.9）
6. 两边年份都存在且绝对值差 ≥ 3（电影）→ none `year_conflict`；缺年份不否决
7. confidence ≥ 0.9 且未冲突 → auto
8. 否则 suggest

`hashAgentInput` 用 `JSON.stringify` 固定键顺序 + Web Crypto 不可用时用简单 `cyrb53` 或 `createHash("sha256")`（Worker 有 `crypto.subtle`；测试在 Node 也有）。输出 hex。包含 `AGENT_POLICY_VERSION`。

`computeNextAgentAt(attempts, now = Date.now())` 使用 `AGENT_BACKOFF_MS[Math.min(Math.max(attempts, 1) - 1, 2)]`。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-verifier.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/agent-match apps/core/test/agent-match-verifier.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add agent match verifier and candidate registry

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 5: Read-only agent tools

把现有 Douban/TMDB/IMDb 客户端封成工具，写入 CandidateRegistry。

**Files:**
- Create: `apps/core/src/libs/agent-match/tools.ts`
- Test: `apps/core/test/agent-match-tools.test.ts`

**Interfaces:**
- Consumes: `api.doubanAPI`、`TmdbAPI`、`ImdbAPI`、`CandidateRegistry`。
- Produces:

```ts
export function createAgentMatchTools(registry: CandidateRegistry): AgentTool[];
```

每个 tool 为 `{ name, description, parameters, execute(args) }`。`parameters` 用 JSON Schema object。名称必须是：

- `get_douban_subject`
- `search_tmdb`
- `find_tmdb_by_imdb`
- `get_tmdb_external_ids`
- `lift_imdb_series`

`search_tmdb` / `find_tmdb_by_imdb` 最多登记 8 条。`find_tmdb_by_imdb` 只登记与当前豆瓣 `type` 一致的 `movie_results` 或 `tv_results`，**忽略 `tv_episode_results`**。`get_tmdb_external_ids` 若 candidate 不在表中 throw/返回 error 对象，不登记新 ID。`lift_imdb_series` 失败返回 `{ error: "imdb_lookup_failed" }`，不抛到 agent 循环外。

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { createAgentMatchTools } from "../src/libs/agent-match/tools";
import { api } from "../src/libs/api";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { ImdbAPI } from "../src/libs/api/imdb";
import { withTestContext } from "./context";

test("search_tmdb registers closed-set candidate ids", async () => {
  await withTestContext(async () => {
    try {
      mock.method(TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry);
      const search = tools.find((t) => t.name === "search_tmdb")!;
      const out = await search.execute({ type: "movie", query: "Inception", year: "2010" });
      assert.equal(registry.has("tmdb:movie:27205"), true);
      assert.equal(out.results[0].candidateId, "tmdb:movie:27205");
    } finally {
      mock.restoreAll();
    }
  });
});

test("find_tmdb_by_imdb ignores tv episode results", async () => {
  await withTestContext(async () => {
    try {
      mock.method(TmdbAPI.prototype, "findById", async () => ({
        movie_results: [],
        tv_results: [],
        tv_episode_results: [{ id: 999, title: "Pilot" }],
      }));
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry, { doubanType: "tv" });
      const find = tools.find((t) => t.name === "find_tmdb_by_imdb")!;
      const out = await find.execute({ imdbId: "tt-ep" });
      assert.equal(registry.list().length, 0);
      assert.equal(out.results.length, 0);
    } finally {
      mock.restoreAll();
    }
  });
});
```

若 `createAgentMatchTools` 需要豆瓣类型，第二参为 `{ doubanType?: "movie" | "tv" }`。`get_douban_subject` 可在 execute 里读详情并缓存 type。测试里显式传入更简单。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-tools.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 `tools.ts`**

- `get_douban_subject` 调 `api.doubanAPI.getSubjectDetail`，按 spec 裁剪字段；导演 slice(0,3)，演员 slice(0,5)，intro slice(0,200)。同时读 `api.db` 当前 mapping 的 imdb/tmdb/trakt。
- `search_tmdb`：`new TmdbAPI().search(type, { query, year })`，map 成 candidate 并 `registry.register`。
- `find_tmdb_by_imdb`：`findById` 后按 `doubanType` 选 `movie_results` 或 `tv_results`。
- `get_tmdb_external_ids`：解析 candidateId，`getExternalId`，把 `imdb_id` 写回 registry 中该候选。
- `lift_imdb_series`：`new ImdbAPI().search(imdbId)`，返回 `{ seriesImdbId: resp.top?.series?.series?.id ?? null }`。catch 后 `{ error: "imdb_lookup_failed" }`。

工具 `execute` 不要把封面 URL 放进返回值。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-tools.test.ts test/agent-match-verifier.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/agent-match/tools.ts apps/core/test/agent-match-tools.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add douban and tmdb tools for match agent

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 6: Conditional agent writer

`conclude_match` 的 D1 边界。

**Files:**
- Create: `apps/core/src/libs/agent-match/writer.ts`
- Test: `apps/core/test/agent-match-writer.test.ts`

**Interfaces:**
- Consumes: `verifyConcludeMatch` 的 `tier`、`CandidateRegistry`、当前 mapping 行。
- Produces:

```ts
export async function applyAgentVerdict(input: {
  doubanId: number;
  expectedRevision: number;
  agentToken: string;
  verdict: ReturnType<typeof verifyConcludeMatch>;
  confidence: number;
  reason: string;
  now?: number;
}): Promise<"written" | "suggested" | "no_match" | "stale">;
```

成功直写 UPDATE 条件必须与 spec 第 6 节逐字一致：`calibrated IS NOT TRUE AND tmdb_id IS NULL AND mapping_revision = :expected AND agent_token = :token AND agent_state = 'running'`。

`agent_result` JSON：`{ decision, confidence, reason, candidateId, tmdbId, imdbId, traktId, priorMapping }`。reason 已经 truncate。suggested / no_match 不改正式 ID。no_match 设 `agent_state='no_match'`、`next_agent_at=computeNextAgentAt(attempts)`、`agent_attempts+1`。suggested 设 `agent_state='suggested'`。written 设 `match_source='agent'`、`calibrated` 保持 false、`agent_state=null`、`mapping_revision+1`、写入三 ID。0 行 → `"stale"`。

- [ ] **Step 1: 写失败测试**

三条：直写成功；人审改了 revision 后 stale；medium → suggested 且 tmdb 仍空。

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { withTestContext } from "./context";

test("auto verdict writes ids only when claim still running", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 1,
      mappingRevision: 3,
      agentState: "running",
      agentToken: "tok",
    });
    const registry = new CandidateRegistry();
    const candidate = registry.register({ type: "movie", tmdbId: 10, imdbId: "tt10" });
    const verdict = verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence: 0.95,
      reason: "ok",
      registry,
      douban: { type: "movie", title: "A", imdbId: null },
    });
    const status = await applyAgentVerdict({
      doubanId: 1,
      expectedRevision: 3,
      agentToken: "tok",
      verdict,
      confidence: 0.95,
      reason: "ok",
    });
    assert.equal(status, "written");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 1) });
    assert.equal(row?.tmdbId, 10);
    assert.equal(row?.matchSource, "agent");
    assert.equal(row?.calibrated, false);
    assert.equal(row?.mappingRevision, 4);
    assert.equal(row?.agentState, null);
  });
});

test("stale revision does not write", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 2,
      mappingRevision: 9,
      agentState: "running",
      agentToken: "tok",
    });
    const registry = new CandidateRegistry();
    const candidate = registry.register({ type: "movie", tmdbId: 10 });
    const verdict = verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence: 0.95,
      reason: "ok",
      registry,
      douban: { type: "movie", title: "A" },
    });
    const status = await applyAgentVerdict({
      doubanId: 2,
      expectedRevision: 3,
      agentToken: "tok",
      verdict,
      confidence: 0.95,
      reason: "ok",
    });
    assert.equal(status, "stale");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 2) });
    assert.equal(row?.tmdbId ?? null, null);
  });
});
```

再加 suggested 用例，`confidence: 0.7`，断言 `agentState === "suggested"` 且 `tmdbId` 为空。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-writer.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 writer**

用 drizzle `update(doubanMapping).set(...).where(and(...))`。先 `select` 拿 `priorMapping` 与 `agentAttempts`。检查 `rowsAffected === 0`（或再读行对比 token）返回 stale。`agent_result` 用 `JSON.stringify`。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-writer.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/agent-match/writer.ts apps/core/test/agent-match-writer.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add conditional agent mapping writer

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 7: Random pool claim

cron 入队前的抽取、claim、过期回收。

**Files:**
- Create: `apps/core/src/libs/agent-match/pool.ts`
- Test: `apps/core/test/agent-match-pool.test.ts`

**Interfaces:**
- Consumes: `AGENT_MATCH_HOURLY_LIMIT`、`AGENT_LEASE_MS`、`hashAgentInput`。
- Produces:

```ts
export async function recoverExpiredClaims(now?: number): Promise<number>;
export async function claimAgentJobs(limit: number, now?: number): Promise<Array<{
  doubanId: number;
  mappingRevision: number;
  agentToken: string;
  agentInputHash: string;
}>>;
```

合格条件按 spec 第 7 节。SQL 用 `ORDER BY RANDOM() LIMIT :limit`。claim 把 `agent_state='pending'`、新 `agent_token`（`crypto.randomUUID()`）、`agent_lease_until=now+LEASE`、`agent_input_hash` 写上。`recoverExpiredClaims` 把 `pending/running AND lease < now` 设回 `agent_state=null`（token 清空）。`suggested` 永不回收进池。输入哈希未变的 `no_match` 在 `next_agent_at > now` 时不抽；到期但哈希相同也跳过（spec：不重复付费）。实现：claim 查询加 `AND (agent_input_hash IS NULL OR next_agent_at IS NULL OR next_agent_at <= now)` 且 `agent_state IS NULL OR (agent_state='no_match' AND next_agent_at <= now AND 1=0)` —— 更清楚的做法：`no_match` **到期后仍跳过**，除非 `agent_input_hash` 为空。测试锁死这一点。

- [ ] **Step 1: 写失败测试**

插入：缺 tmdb 未评、suggested、no_match 未到期、已有 tmdb、calibrated。`claimAgentJobs(10)` 只返回未评那条。再测 `recoverExpiredClaims` 让过期 running 变可抽。第三条：`claimAgentJobs(1)` 两次不应抽出同一 pending 行。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-pool.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 pool.ts**

先 `recoverExpiredClaims` 再 select。claim 用逐行 update where `douban_id=? AND tmdb_id IS NULL AND agent_state IS NULL`（或 no_match 到期且 hash 空）防止并发双 claim。token 每行新 UUID。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-pool.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/agent-match/pool.ts apps/core/test/agent-match-pool.test.ts
git commit -m "$(cat <<'EOF'
feat(core): claim a bounded random agent match pool

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

### Task 8: Pi runner, queue consumer, cron enqueue

把工具接到 Pi，挂上同一 Worker 的 Queue。测试 mock 模型，不打真实 OpenRouter。

**Files:**
- Create: `apps/core/src/libs/agent-match/prompt.ts`
- Create: `apps/core/src/libs/agent-match/runner.ts`
- Create: `apps/core/src/libs/agent-match/queue.ts`
- Modify: `apps/core/src/cron.ts`
- Modify: `apps/core/src/index.tsx`
- Modify: `apps/core/wrangler.jsonc`
- Modify: `apps/core/package.json`（及 lockfile）
- Test: `apps/core/test/agent-match-queue.test.ts`

**Interfaces:**
- Consumes: `createAgentMatchTools`、`verifyConcludeMatch`、`applyAgentVerdict`、`claimAgentJobs`。
- Produces:

```ts
export async function runAgentMatchJob(job: {
  doubanId: number;
  mappingRevision: number;
  agentToken: string;
  agentInputHash: string;
}): Promise<"written" | "suggested" | "no_match" | "stale">;

export async function handleAgentMatchBatch(
  batch: MessageBatch<{ doubanId: number; mappingRevision: number; agentToken: string; agentInputHash: string }>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void>;
```

`index.tsx`：

```ts
import { handleAgentMatchBatch } from "./libs/agent-match/queue";
export default {
  fetch: app.fetch,
  scheduled,
  queue: handleAgentMatchBatch,
};
```

`wrangler.jsonc` 增加：

```jsonc
"queues": {
  "producers": [{ "binding": "AGENT_MATCH_QUEUE", "queue": "douban-agent-match" }],
  "consumers": [{
    "queue": "douban-agent-match",
    "max_batch_size": 1,
    "max_concurrency": 1
  }]
}
```

依赖：在 `apps/core` 执行 `pnpm add @earendil-works/pi-agent-core@^0.85.1 @earendil-works/pi-ai@^0.85.1`。模型走 OpenRouter：`env.OPENROUTER_API_KEY`（secret，不要写进 wrangler `vars`）。可选 `vars.AGENT_MATCH_MODEL` 默认 `openai/gpt-4.1-mini` 或 pi-ai 已注册的便宜 tool-calling 模型；实现时选 `createModels()` 能 `getModel` 成功的一个，并在 prompt.ts 注释写死实际 id。

`prompt.ts` 中文系统提示，写明：只能用工具；唯一出口 `conclude_match`；禁止编造 candidateId。

`runner.ts`：先把该行 `agent_state` 从 pending 改为 running（token 必须匹配）。拉豆瓣详情放进第一轮 user 消息。注册 `conclude_match` tool：其 `execute` 调 verifier+writer 并把结果存在闭包，避免模型再说话。`Agent` 构造后 `prompt(user)`。若没有 conclude，writer 走 none/`agent_no_conclusion`。

cron 在现有确定性循环之后。**先 await 本轮确定性 persist，再抽池。** 不得继续 `ctx.waitUntil(api.persistIdMapping(...))` 然后立刻 claim，否则刚命中的行仍是 `tmdb_id IS NULL`，会被付费再跑一遍。

```ts
if (validResults.length > 0) {
  await api.persistIdMapping(validResults);
}
await recoverExpiredClaims();
const jobs = await claimAgentJobs(AGENT_MATCH_HOURLY_LIMIT);
for (const job of jobs) {
  ctx.waitUntil(env.AGENT_MATCH_QUEUE.send(job));
}
```

Task 8 测试必须覆盖这条时序：把 `persistIdMapping` 做成未 resolve 的 Promise，在它 resolve 前不得 `queue.send`；resolve 后该行因已有 tmdb 被排除。

测试里给 `env` 一个 `{ send: async (body) => { sent.push(body); } }` mock。不要在本 task 打真实 LLM：`runAgentMatchJob` 抽 `executeAgentLoop` 或对 `runner` 用 mock.method 替换 `runPiSession`，让它直接调用 conclude。

- [ ] **Step 1: 写失败测试**

`agent-match-queue.test.ts`：

1. cron 在确定性无法命中后 claim 1 条并 `send`。插入 3 条缺 tmdb，mock trakt/douban 不命中，mock queue.send，断言 send 次数 ≤ `AGENT_MATCH_HOURLY_LIMIT` 且 ≤ 合格行数。
2. consumer：预置 running+token 行，mock `runPiSession` 直接 `conclude_match` 高置信，断言 tmdb 写入且 mock `batch.messages[0].ack` 被调用。失败路径必须 `message.retry()` 或让 handler throw；不能只省略 `ack()` 就当成功返回。
3. suggested 行不会被 send。
4. 时序：cron 对本轮 `persistIdMapping` 必须 `await`。测试把 persist 挂起，断言挂起期间 0 次 send；persist 写入 tmdb 后该行不再 send。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-queue.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 runner/queue/cron/index/wrangler/deps**

`handleAgentMatchBatch` 必须：

```ts
return asyncLocalStorage.run({ env, ctx }, async () => {
  for (const message of batch.messages) {
    try {
      await runAgentMatchJob(message.body);
      message.ack();
    } catch (error) {
      console.warn("agent match job failed", error);
      message.retry();
    }
  }
});
```

语义上的 no_match 也 ack（已落库）。只有 throw 才 retry。

`CloudflareBindings` 在本 task 后跑 `pnpm --filter @douban-bridge/core cf-typegen` 以生成 `AGENT_MATCH_QUEUE`。不要手写 `worker-configuration.d.ts` 里其它内容。

- [ ] **Step 4: 跑相关测试**

Run:

```bash
pnpm --filter @douban-bridge/core exec node --import tsx --test test/agent-match-queue.test.ts test/cron.test.ts test/agent-match-pool.test.ts test/agent-match-writer.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/libs/agent-match/prompt.ts apps/core/src/libs/agent-match/runner.ts apps/core/src/libs/agent-match/queue.ts apps/core/src/cron.ts apps/core/src/index.tsx apps/core/wrangler.jsonc apps/core/package.json pnpm-lock.yaml apps/core/test/agent-match-queue.test.ts apps/core/worker-configuration.d.ts
git commit -m "$(cat <<'EOF'
feat(core): enqueue and run Pi matching jobs off cron

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

若 `cf-typegen` 没改 worker-configuration.d.ts，就不要 add 它。

---

### Task 9: tidy-up review

三个列表视图、确认/驳回、空表单不得写成 `tmdb_id=0`。

**Files:**
- Modify: `apps/core/src/routes/dash/tidy-up/index.tsx`
- Modify: `apps/core/src/routes/dash/tidy-up/detail.tsx`
- Test: `apps/core/test/tidy-up-agent.test.ts`

**Interfaces:**
- Consumes: `agentState`、`matchSource`、`agentResult`、`apply` 不用 Pi。
- Produces: `GET /dash/tidy-up?view=suggested|auto|no_match`，默认 `suggested`。POST `/:doubanId` 增加 `intent=confirm|reject`（原保存编辑仍可用，空字符串当 null）。

确认：`match_source=human`、`calibrated=true`、采用建议 ID（若正式 tmdb 为空）、清 `agent_state/token/lease`、`mapping_revision+1`。

驳回：若 `match_source=agent` 且有 `priorMapping`，恢复三 ID；把当前 candidateId 追加进 `agentResult.rejectedCandidateIds`；`agent_state=no_match`、写 `next_agent_at`。

普通保存（非 confirm/reject）只要改了正式 ID 或留下人工编辑，也必须 `mapping_revision+1` 并清空 `agent_token` / `agent_state` / `agent_lease_until`。否则人审改了 IMDb、TMDB 仍空、未勾校准，旧 running job 的条件 UPDATE 仍能通过。

空表单：`tmdbId: emptyToNull(form.get("tmdbId"))`，`z.coerce.number()` 之前把 `""` 变成 `null`。已填值必须是正整数；`0` / 负数 / 小数拒绝写入。

- [ ] **Step 1: 写失败测试**

用 Hono `app.request` 或直接 import `tidyUpRoute`/`tidyUpDetailRoute`。至少：

1. `POST` 空 tmdb 字段后行的 `tmdbId` 为 null 而不是 0。提交 `0` 必须拒绝。
2. 先插入 suggested 行，confirm 后 `calibrated===true` 且 `matchSource==='human'`。
3. agent 直写行 reject 后 tmdb 回到 `priorMapping`。
4. 预置 `agent_state=running` + token + revision，普通 POST 只改 imdb、tmdb 留空、不勾校准；随后旧 token 的 `applyAgentVerdict` 必须 0 行。

列表 GET 若 SSR 不便断言 HTML，可抽 `function tidyUpListFilter(view)` 测纯过滤。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @douban-bridge/core exec node --import tsx --test test/tidy-up-agent.test.ts`

Expected: FAIL。

- [ ] **Step 3: 改页面**

`index.tsx` 按 `view` 过滤，标题文案中文：「待确认建议 / Agent 已写未校准 / 无匹配」。详情页展示 `JSON.parse(agentResult)` 的 reason 与 confidence。按钮「确认」和「驳回」。

- [ ] **Step 4: 跑 tidy-up + 全 core 测试**

Run: `pnpm --filter @douban-bridge/core test`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/core/src/routes/dash/tidy-up apps/core/test/tidy-up-agent.test.ts
git commit -m "$(cat <<'EOF'
feat(core): review agent mapping suggestions in tidy-up

Co-authored-by: Codex <noreply@openai.com>
EOF
)"
```

---

## Spec coverage

| Spec 节 | Task |
| --- | --- |
| 1–2 决策 / 不做项 | 全任务 Global Constraints |
| 3 流水线 | 2、7、8 |
| 4 工具契约 | 5、8 |
| 5 Verifier 分档 | 4、6 |
| 6 数据与条件 UPDATE | 1、3、6 |
| 7 入池随机上限 | 7、8 |
| 8 Queue | 8 |
| 9 tidy-up | 9 |
| 11 测试清单 | 2–9 的测试步骤 |

## Placeholder / type check

- 无 TBD。Pi 模型 id 若与默认不符，只允许在 Task 8 改 `prompt.ts` 旁的 `DEFAULT_AGENT_MATCH_MODEL` 常量，并同步测试 mock。
- `verifyConcludeMatch`、`applyAgentVerdict`、`claimAgentJobs`、`runAgentMatchJob`、`handleAgentMatchBatch` 名称在后续 task 中保持一致。
