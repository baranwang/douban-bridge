import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { api } from "../src/libs/api";
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

test("medium confidence stores a suggestion without official ids", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 3,
      mappingRevision: 1,
      agentState: "running",
      agentToken: "tok",
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
      expectedRevision: 1,
      agentToken: "tok",
      verdict,
      confidence: 0.7,
      reason: "比较像",
    });
    assert.equal(status, "suggested");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 3) });
    assert.equal(row?.agentState, "suggested");
    assert.equal(row?.tmdbId ?? null, null);
  });
});
