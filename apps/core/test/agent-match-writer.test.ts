import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { parseAgent } from "../src/libs/agent-match/blob";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

function runningAgent(token = "tok", leaseUntil = Date.now() + 60_000) {
  return JSON.stringify({ token, leaseUntil });
}

test("auto verdict writes ids only when claim still running", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 1,
      agent: runningAgent(),
    });
    const registry = new CandidateRegistry();
    const candidate = registry.register({ type: "movie", tmdbId: 10, title: "A", originalTitle: "A", imdbId: "tt10" });
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
      agentToken: "tok",
      verdict,
      confidence: 0.95,
      reason: "ok",
    });
    assert.equal(status, "written");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 1) });
    assert.equal(row?.tmdbId, 10);
    assert.equal(row?.calibrated, false);
    const blob = parseAgent(row?.agent);
    assert.equal(blob?.tmdbId, 10);
    assert.equal(blob?.token, undefined);
  });
});

test("stale token does not write", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 2,
      agent: runningAgent("other"),
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

test("medium confidence stores a suggestion without official ids", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 3,
      agent: runningAgent(),
    });
    const registry = new CandidateRegistry();
    const candidate = registry.register({ type: "movie", tmdbId: 10 });
    const verdict = verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence: 0.7,
      reason: "比较像",
      registry,
      douban: { type: "movie", title: "A" },
    });
    const status = await applyAgentVerdict({
      doubanId: 3,
      agentToken: "tok",
      verdict,
      confidence: 0.7,
      reason: "比较像",
    });
    assert.equal(status, "suggested");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 3) });
    assert.equal(parseAgent(row?.agent)?.status, "suggested");
    assert.equal(row?.tmdbId ?? null, null);
  });
});

test("auto write overwrites a conflicting imdb at high confidence", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 4,
      imdbId: "tt-new",
      agent: runningAgent(),
    });
    const registry = new CandidateRegistry();
    const candidate = registry.register({
      type: "movie",
      tmdbId: 10,
      title: "A",
      originalTitle: "A",
      imdbId: "tt-old",
    });
    const verdict = verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence: 0.95,
      reason: "ok",
      registry,
      douban: { type: "movie", title: "A", imdbId: "tt-old" },
    });
    const status = await applyAgentVerdict({
      doubanId: 4,
      agentToken: "tok",
      verdict,
      confidence: 0.95,
      reason: "ok",
    });
    assert.equal(status, "written");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 4) });
    assert.equal(row?.tmdbId, 10);
    assert.equal(row?.imdbId, "tt-old");
  });
});
