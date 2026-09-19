import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { parseAgent } from "../src/libs/agent-match/blob";
import {
  claimAgentJobs,
  enqueueUnmatchedAgentJobs,
  parseEnqueueIds,
  persistAndEnqueueUnmatched,
  recoverExpiredClaims,
} from "../src/libs/agent-match/pool";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("claimAgentJobs only returns unevaluated missing-tmdb rows", async () => {
  await withTestContext(async () => {
    const now = 1_000_000;
    await api.db
      .insert(doubanMapping)
      .values([
        { doubanId: 1 },
        { doubanId: 2, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }) },
        { doubanId: 3, agent: JSON.stringify({ status: "no_match", reason: "none" }) },
        { doubanId: 4, tmdbId: 99 },
        { doubanId: 5, calibrated: true },
      ]);
    const jobs = await claimAgentJobs(10, now);
    assert.deepEqual(
      jobs.map((job) => job.doubanId),
      [1],
    );
    const claimed = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 1) });
    const blob = parseAgent(claimed?.agent);
    assert.ok(blob?.token);
    assert.ok((blob?.leaseUntil ?? 0) > now);
  });
});

test("recoverExpiredClaims returns expired running rows to the pool", async () => {
  await withTestContext(async () => {
    const now = 2_000_000;
    await api.db.insert(doubanMapping).values({
      doubanId: 6,
      agent: JSON.stringify({ token: "old", leaseUntil: now - 1 }),
    });
    const recovered = await recoverExpiredClaims(now);
    assert.equal(recovered, 1);
    const jobs = await claimAgentJobs(10, now);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].doubanId, 6);
    assert.notEqual(jobs[0].agentToken, "old");
  });
});

test("claimAgentJobs does not claim the same pending row twice", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 7 });
    const first = await claimAgentJobs(1);
    const second = await claimAgentJobs(1);
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(first[0].doubanId, 7);
  });
});

test("parseEnqueueIds drops junk and duplicates", () => {
  assert.deepEqual(parseEnqueueIds(["8", "8", "nope", "0", "-1", "9"]), [8, 9]);
});

test("claimAgentJobs can claim selected unmatched ids only", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values([{ doubanId: 8 }, { doubanId: 9 }, { doubanId: 10, tmdbId: 1 }]);
    const jobs = await claimAgentJobs(10, Date.now(), [9, 10, 9, 11]);
    assert.deepEqual(
      jobs.map((job) => job.doubanId),
      [9],
    );
  });
});

test("claimAgentJobs can requeue selected suggested ids", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values([
      { doubanId: 12, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }) },
      { doubanId: 13, agent: JSON.stringify({ status: "no_match" }) },
    ]);
    const jobs = await claimAgentJobs(10, Date.now(), [12, 13]);
    assert.deepEqual(
      jobs.map((job) => job.doubanId),
      [12],
    );
    const claimed = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 12) });
    const blob = parseAgent(claimed?.agent);
    assert.ok(blob?.token);
    assert.equal(blob?.status, undefined);
  });
});

test("claimAgentJobs without limit claims every eligible row", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values([{ doubanId: 14 }, { doubanId: 15 }, { doubanId: 16 }]);
    const jobs = await claimAgentJobs();
    assert.deepEqual(
      jobs.map((job) => job.doubanId).sort((a, b) => a - b),
      [14, 15, 16],
    );
  });
});

function mockQueue(env: CloudflareBindings, sent: Array<{ doubanId: number; agentToken: string }>) {
  env.AGENT_MATCH_QUEUE = {
    send: async (body: { doubanId: number; agentToken: string }) => {
      sent.push(body);
      return { metadata: { metrics: { retries: 0 } } };
    },
  } as Queue<{ doubanId: number; agentToken: string }>;
}

test("persistAndEnqueueUnmatched queues first misses without tmdb", async () => {
  await withTestContext(async (env) => {
    const sent: Array<{ doubanId: number; agentToken: string }> = [];
    mockQueue(env, sent);
    await persistAndEnqueueUnmatched([
      { doubanId: 17, tmdbId: 1, imdbId: null, traktId: null },
      { doubanId: 18, tmdbId: null, imdbId: null, traktId: null },
    ]);
    assert.deepEqual(
      sent.map((job) => job.doubanId),
      [18],
    );
    const matched = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 17) });
    const missed = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 18) });
    assert.equal(matched?.tmdbId, 1);
    assert.ok(parseAgent(missed?.agent)?.token);
  });
});

test("persistAndEnqueueUnmatched skips when the queue binding is missing", async () => {
  await withTestContext(async () => {
    await persistAndEnqueueUnmatched([{ doubanId: 19, tmdbId: null, imdbId: null, traktId: null }]);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 19) });
    assert.equal(row?.tmdbId, null);
    assert.equal(parseAgent(row?.agent)?.token, undefined);
  });
});

test("enqueueUnmatchedAgentJobs does not requeue suggested rows", async () => {
  await withTestContext(async (env) => {
    const sent: Array<{ doubanId: number; agentToken: string }> = [];
    mockQueue(env, sent);
    await api.db
      .insert(doubanMapping)
      .values({ doubanId: 20, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }) });
    const queued = await enqueueUnmatchedAgentJobs([20]);
    assert.equal(queued, 0);
    assert.deepEqual(sent, []);
  });
});
