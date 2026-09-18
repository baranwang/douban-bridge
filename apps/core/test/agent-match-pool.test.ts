import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { parseAgent } from "../src/libs/agent-match/blob";
import { claimAgentJobs, recoverExpiredClaims } from "../src/libs/agent-match/pool";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("claimAgentJobs only returns unevaluated missing-tmdb rows", async () => {
  await withTestContext(async () => {
    const now = 1_000_000;
    await api.db.insert(doubanMapping).values([
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
