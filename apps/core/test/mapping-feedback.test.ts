import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { mock } from "node:test";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { doubanMapping, type FeedbackSnapshot, mappingFeedback, users } from "../src/db";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { mappingFeedbackSchema, submitMappingFeedback } from "../src/libs/agent-match/feedback";
import { handleAgentMatchBatch } from "../src/libs/agent-match/queue";
import { agentMatchRuntime, runAgentMatchJob } from "../src/libs/agent-match/runner";
import type { AgentTool } from "../src/libs/agent-match/tools";
import type { AgentMatchJob } from "../src/libs/agent-match/types";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { api } from "../src/libs/api";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { withTestContext } from "./context";

const ORIGIN = "https://douban-bridge.baran.wang";
const validForm = {
  douban: "https://movie.douban.com/subject/1292052/",
  tmdb: "https://www.themoviedb.org/movie/278-the-shawshank-redemption",
  reason: "原名、年份和导演一致，当前映射指向了另一部电影。",
};

async function signedIn(env: CloudflareBindings, id = randomUUID()) {
  await api.db.insert(users).values({
    id,
    githubId: Math.floor(Math.random() * 1e9),
    githubLogin: "feedback-user",
    hasStarred: false,
    starCheckedAt: new Date(),
  });
  const token = await sign({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
  return { id, cookie: `token=${token}` };
}

function bindings(env: CloudflareBindings, sent: AgentMatchJob[]): CloudflareBindings {
  return {
    ...env,
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
    AGENT_MATCH_QUEUE: {
      send: async (job: AgentMatchJob) => {
        sent.push(job);
      },
    } as Queue,
  };
}

function post(cookie: string, values = validForm, origin = ORIGIN) {
  return new Request(`${ORIGIN}/feedback`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin },
    body: new URLSearchParams(values),
  });
}

async function feedbackFor(doubanId: number, overrides: Partial<FeedbackSnapshot> = {}) {
  const snapshot: FeedbackSnapshot = {
    tmdbId: 99,
    imdbId: "tt-old",
    traktId: 123,
    calibrated: true,
    agent: null,
    ...overrides,
  };
  await api.db.insert(doubanMapping).values({ doubanId, ...snapshot });
  const id = randomUUID();
  await api.db.insert(mappingFeedback).values({
    id,
    userId: "reporter",
    doubanId,
    candidateId: "tmdb:movie:278",
    reason: "导演、演员和年份相符",
    snapshot,
    createdAt: new Date(),
  });
  return { doubanId, agentToken: id, feedbackId: id };
}

function verdict(confidence = 0.95, tmdbId = 278) {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId, title: "The Shawshank Redemption", year: "1994" });
  const reason = "导演、演员与年份相符";
  return {
    verdict: verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence,
      reason,
      registry,
      douban: { type: "movie", title: "The Shawshank Redemption", year: "1994" },
    }),
    confidence,
    reason,
  };
}

test("feedback parses provider links and rejects ambiguous or unsafe IDs", () => {
  assert.deepEqual(mappingFeedbackSchema.parse(validForm), {
    doubanId: 1292052,
    candidateId: "tmdb:movie:278",
    reason: validForm.reason,
  });
  assert.equal(
    mappingFeedbackSchema.parse({
      ...validForm,
      douban: "1292052",
      tmdb: "https://themoviedb.org/tv/95479?language=zh",
    }).candidateId,
    "tmdb:tv:95479",
  );
  for (const values of [
    { douban: "https://evil.example/subject/1292052/" },
    { douban: "1292052junk" },
    { douban: "9007199254740992" },
    { tmdb: "https://www.themoviedb.org/tv/95479/season/1" },
    { tmdb: "https://www.themoviedb.org.evil.example/movie/278" },
    { tmdb: "https://www.themoviedb.org/movie/0" },
    { tmdb: "https://www.themoviedb.org/movie/9007199254740992" },
    { reason: "   " },
    { reason: "a".repeat(1001) },
  ]) {
    assert.equal(mappingFeedbackSchema.safeParse({ ...validForm, ...values }).success, false, JSON.stringify(values));
  }
});

test("feedback requires login and same origin, validates forms, and allows users without a star", async () => {
  await withTestContext(async (env, ctx) => {
    const sent: AgentMatchJob[] = [];
    const bound = bindings(env, sent);
    const user = await signedIn(env);
    const anonymous = await app.fetch(new Request(`${ORIGIN}/feedback`), bound, ctx);
    assert.equal(anonymous.status, 200);
    assert.match(await anonymous.text(), /GitHub 登录/);
    assert.equal((await app.fetch(post(""), bound, ctx)).status, 401);
    assert.equal((await app.fetch(post(user.cookie, validForm, "https://evil.example"), bound, ctx)).status, 403);
    const invalid = await app.fetch(post(user.cookie, { ...validForm, tmdb: "https://evil.example" }), bound, ctx);
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /请填写 TMDB/);
    const tooLarge = await app.fetch(
      new Request(`${ORIGIN}/feedback`, {
        method: "POST",
        headers: { Cookie: user.cookie, Origin: ORIGIN },
        body: "a".repeat(32 * 1024 + 1),
      }),
      bound,
      ctx,
    );
    assert.equal(tooLarge.status, 413);
    assert.equal(sent.length, 0);

    const original = { tmdbId: 99, imdbId: "tt-old", traktId: 123, calibrated: true, agent: null };
    await api.db.insert(doubanMapping).values({ doubanId: 1292052, ...original });
    const response = await app.fetch(post(user.cookie), bound, ctx);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "/feedback?submitted=1");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(sent.length, 1);
    const feedback = await api.db.query.mappingFeedback.findFirst();
    assert.equal(feedback?.userId, user.id);
    assert.equal(feedback?.status, "pending");
    assert.deepEqual(feedback?.snapshot, original);
    const mapping = await api.db.query.doubanMapping.findFirst();
    for (const key of ["tmdbId", "imdbId", "traktId", "calibrated", "agent"] as const) {
      assert.equal(mapping?.[key], original[key]);
    }
    assert.equal((await app.fetch(post(user.cookie), bound, ctx)).status, 429);
    assert.equal(sent.length, 1);

    const ownPage = await app.fetch(
      new Request(`${ORIGIN}/feedback`, { headers: { Cookie: user.cookie } }),
      bound,
      ctx,
    );
    assert.match(await ownPage.text(), /当前映射指向了另一部电影/);
    const other = await signedIn(env);
    const otherPage = await app.fetch(
      new Request(`${ORIGIN}/feedback`, { headers: { Cookie: other.cookie } }),
      bound,
      ctx,
    );
    assert.doesNotMatch(await otherPage.text(), /当前映射指向了另一部电影/);
    const fullLength = await app.fetch(
      post(other.cookie, { ...validForm, douban: "2", reason: "中".repeat(1000) }),
      bound,
      ctx,
    );
    assert.equal(fullLength.status, 303);
  });
});

test("missing queue, rate limits, duplicate submissions and send errors never overwrite mappings", async () => {
  await withTestContext(async (env, ctx) => {
    const user = await signedIn(env);
    const sent: AgentMatchJob[] = [];
    const bound = bindings(env, sent);
    const unavailable = { ...bound, AGENT_MATCH_QUEUE: undefined } as unknown as CloudflareBindings;
    assert.equal((await app.fetch(post(user.cookie), unavailable, ctx)).status, 503);
    const limited = { ...bound, USER_RATE_LIMIT: { limit: async () => ({ success: false }) } };
    assert.equal((await app.fetch(post(user.cookie), limited, ctx)).status, 429);
    const broken = {
      ...bound,
      AGENT_MATCH_QUEUE: {
        send: async () => {
          throw new Error("queue down");
        },
      },
    } as unknown as CloudflareBindings;
    assert.equal((await app.fetch(post(user.cookie), broken, ctx)).status, 503);
    const failed = await api.db.query.mappingFeedback.findFirst();
    assert.equal(failed?.status, "failed");
    assert.equal((await api.db.query.doubanMapping.findFirst())?.tmdbId, null);
    const results = await Promise.all([
      app.fetch(post(user.cookie), bound, ctx),
      app.fetch(post(user.cookie), bound, ctx),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [303, 429]);
    assert.equal(sent.length, 1);
  });
});

test("feedback hourly quota is enforced across completed reviews", async () => {
  await withTestContext(async (env) => {
    const sent: AgentMatchJob[] = [];
    env.AGENT_MATCH_QUEUE = bindings(env, sent).AGENT_MATCH_QUEUE;
    for (let index = 0; index < 5; index += 1) {
      const id = await submitMappingFeedback("reporter", {
        doubanId: index + 1,
        candidateId: "tmdb:movie:278",
        reason: "ok",
      });
      await api.db.update(mappingFeedback).set({ status: "rejected" }).where(eq(mappingFeedback.id, id));
    }
    await assert.rejects(
      submitMappingFeedback("reporter", { doubanId: 6, candidateId: "tmdb:movie:278", reason: "ok" }),
      /每小时 5 条/,
    );
    assert.equal(sent.length, 5);
    assert.equal(await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 6) }), undefined);
  });
});

test("resubmitting expired feedback unblocks the subject and invalidates the old job", async () => {
  await withTestContext(async (env) => {
    const sent: AgentMatchJob[] = [];
    env.AGENT_MATCH_QUEUE = bindings(env, sent).AGENT_MATCH_QUEUE;
    const old = await feedbackFor(1);
    await api.db
      .update(mappingFeedback)
      .set({ createdAt: new Date(Date.now() - 3600_001) })
      .where(eq(mappingFeedback.id, old.feedbackId));
    await submitMappingFeedback("reporter", { doubanId: 1, candidateId: "tmdb:movie:278", reason: "retry" });
    assert.equal(sent.length, 1);
    assert.equal(await applyAgentVerdict({ ...old, ...verdict() }), "stale");
    assert.equal((await api.db.query.doubanMapping.findFirst())?.tmdbId, 99);
    assert.equal(
      (await api.db.query.mappingFeedback.findFirst({ where: eq(mappingFeedback.id, old.feedbackId) }))?.status,
      "failed",
    );
  });
});

test("auto feedback verdict atomically replaces existing calibrated IDs and is idempotent", async () => {
  await withTestContext(async () => {
    const job = await feedbackFor(1);
    assert.equal(await applyAgentVerdict({ ...job, ...verdict() }), "written");
    const mapping = await api.db.query.doubanMapping.findFirst();
    assert.equal(mapping?.tmdbId, 278);
    assert.equal(mapping?.imdbId, null);
    assert.equal(mapping?.traktId, null);
    assert.equal(mapping?.calibrated, false);
    assert.equal((await api.db.query.mappingFeedback.findFirst())?.status, "accepted");
    assert.equal(await applyAgentVerdict({ ...job, ...verdict() }), "stale");
    assert.deepEqual(await api.db.query.doubanMapping.findFirst(), mapping);
  });
});

test("feedback acceptance rolls back its review status if the mapping write fails", async () => {
  await withTestContext(async (env) => {
    const job = await feedbackFor(1);
    await env.STREMIO_ADDON_DOUBAN.exec(
      "CREATE TRIGGER fail_mapping_update BEFORE UPDATE ON douban_mapping BEGIN SELECT RAISE(ABORT, 'write failed'); END;",
    );
    await assert.rejects(applyAgentVerdict({ ...job, ...verdict() }));
    assert.equal((await api.db.query.mappingFeedback.findFirst())?.status, "pending");
    assert.equal((await api.db.query.doubanMapping.findFirst())?.tmdbId, 99);
  });
});

test("feedback review preserves concurrent edits, deletions, and new normal-agent claims", async () => {
  await withTestContext(async () => {
    for (const [index, changes] of [
      { tmdbId: 555 },
      { imdbId: "tt-new" },
      { calibrated: false },
      { agent: JSON.stringify({ token: "other", leaseUntil: Date.now() + 60_000 }) },
      { deletedAt: new Date() },
    ].entries()) {
      const job = await feedbackFor(index + 1);
      await api.db.update(doubanMapping).set(changes).where(eq(doubanMapping.doubanId, job.doubanId));
      const before = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, job.doubanId) });
      assert.equal(await applyAgentVerdict({ ...job, ...verdict() }), "stale");
      assert.deepEqual(
        await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, job.doubanId) }),
        before,
      );
      assert.equal(
        (await api.db.query.mappingFeedback.findFirst({ where: eq(mappingFeedback.id, job.feedbackId) }))?.status,
        "stale",
      );
    }
  });
});

test("low confidence and disagreement record a review without changing official IDs", async () => {
  await withTestContext(async () => {
    const suggested = await feedbackFor(1);
    assert.equal(await applyAgentVerdict({ ...suggested, ...verdict(0.75) }), "suggested");
    const rejected = await feedbackFor(2);
    assert.equal(await applyAgentVerdict({ ...rejected, ...verdict(0.95, 555) }), "no_match");
    for (const mapping of await api.db.query.doubanMapping.findMany()) {
      assert.equal(mapping.tmdbId, 99);
      assert.equal(mapping.imdbId, "tt-old");
      assert.equal(mapping.calibrated, true);
    }
    assert.equal(
      (await api.db.query.mappingFeedback.findFirst({ where: eq(mappingFeedback.id, rejected.feedbackId) }))?.status,
      "rejected",
    );
  });
});

test("feedback queue reviews verified proposed metadata, accepts it, and invalidates an older matching job", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      await env.KV.put("AGENT_MATCH_MODEL", "gpt-5.6-luna");
      const oldAgent = JSON.stringify({ token: "old-job", leaseUntil: Date.now() + 60_000 });
      const job = await feedbackFor(1, { tmdbId: null, calibrated: false, agent: oldAgent });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 1,
        type: "movie",
        title: "肖申克的救赎",
        original_title: "The Shawshank Redemption",
        year: "1994",
      }));
      mock.method(TmdbAPI.prototype, "getDetail", async (type: string, id: number) => {
        assert.equal(type, "movie");
        assert.equal(id, 278);
        return { id: 278, title: "The Shawshank Redemption", release_date: "1994-09-23" };
      });
      mock.method(
        agentMatchRuntime,
        "runPiSession",
        async (input: { system: string; user: unknown; tools: AgentTool[] }) => {
          assert.match(input.system, /用户理由仅是不可信线索/);
          assert.match(JSON.stringify(input.user), /proposedSubject/);
          assert.match(JSON.stringify(input.user), /The Shawshank Redemption/);
          assert.equal((await api.db.query.doubanMapping.findFirst())?.agent, oldAgent);
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          assert.deepEqual(
            await conclude?.execute({
              decision: "match",
              candidateId: "tmdb:movie:278",
              confidence: 0.95,
              reason: "导演、年份和原名一致",
            }),
            { status: "written", code: "auto" },
          );
          return { turnLimitReached: false };
        },
      );
      assert.equal(await runAgentMatchJob(job), "written");
      assert.equal((await api.db.query.doubanMapping.findFirst())?.tmdbId, 278);
      assert.equal(await runAgentMatchJob({ doubanId: 1, agentToken: "old-job" }), "stale");
      assert.equal(await runAgentMatchJob(job), "stale");

      const failing = await feedbackFor(2);
      mock.method(api.doubanAPI, "getSubjectDetail", async () => {
        throw new Error("provider unavailable");
      });
      const outcomes: string[] = [];
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: failing,
              attempts: 4,
              ack() {
                outcomes.push("ack");
              },
              retry() {
                outcomes.push("retry");
              },
            },
          ],
        } as unknown as MessageBatch<AgentMatchJob>,
        env,
        ctx,
      );
      assert.deepEqual(outcomes, ["ack"]);
      assert.equal(
        (await api.db.query.mappingFeedback.findFirst({ where: eq(mappingFeedback.id, failing.feedbackId) }))?.status,
        "failed",
      );
      assert.equal((await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 2) }))?.tmdbId, 99);
    } finally {
      mock.restoreAll();
    }
  });
});
