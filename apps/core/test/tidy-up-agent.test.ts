import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { api } from "../src/libs/api";
import { tidyUpListFilter } from "../src/routes/dash/tidy-up";
import { tidyUpDetailRoute } from "../src/routes/dash/tidy-up/detail";
import { withTestContext } from "./context";

async function postTidyUp(doubanId: number, body: Record<string, string>) {
  const form = new URLSearchParams(body);
  return tidyUpDetailRoute.request(`/${doubanId}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
}

test("empty tmdb field saves as null instead of zero", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 41, imdbId: "tt41" });
    const response = await postTidyUp(41, { tmdbId: "", imdbId: "tt41", traktId: "" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 41) });
    assert.equal(row?.tmdbId ?? null, null);
  });
});

test("zero tmdb id is rejected", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 42 });
    const response = await postTidyUp(42, { tmdbId: "0" });
    assert.equal(response.status, 400);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 42) });
    assert.equal(row?.tmdbId ?? null, null);
  });
});

test("confirming a suggestion locks it as human", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 43,
      agent: JSON.stringify({
        status: "suggested",
        confidence: 0.7,
        reason: "像",
        candidateId: "tmdb:movie:10",
        tmdbId: 10,
        imdbId: "tt10",
        traktId: 7,
      }),
    });
    const response = await postTidyUp(43, { intent: "confirm" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 43) });
    assert.equal(row?.calibrated, true);
    assert.equal(row?.tmdbId, 10);
    assert.equal(row?.agent ?? null, null);
  });
});

test("rejecting an agent write clears official ids", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 44,
      tmdbId: 999,
      imdbId: "tt999",
      agent: JSON.stringify({
        confidence: 0.95,
        reason: "直写",
        candidateId: "tmdb:movie:999",
        tmdbId: 999,
        imdbId: "tt999",
        traktId: 9,
      }),
    });
    const response = await postTidyUp(44, { intent: "reject" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 44) });
    assert.equal(row?.tmdbId ?? null, null);
    assert.equal(row?.imdbId ?? null, null);
    assert.equal(JSON.parse(row?.agent ?? "{}").status, "no_match");
  });
});

test("human edit invalidates a running agent claim", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 45,
      agent: JSON.stringify({ token: "tok-45", leaseUntil: Date.now() + 60_000 }),
    });
    const response = await postTidyUp(45, { imdbId: "tt-human", tmdbId: "" });
    assert.equal(response.status, 302);
    const registry = new CandidateRegistry();
    const candidate = registry.register({ type: "movie", tmdbId: 10 });
    const verdict = verifyConcludeMatch({
      decision: "match",
      candidateId: candidate.candidateId,
      confidence: 0.95,
      reason: "旧任务",
      registry,
      douban: { type: "movie", title: "A" },
    });
    const status = await applyAgentVerdict({
      doubanId: 45,
      agentToken: "tok-45",
      verdict,
      confidence: 0.95,
      reason: "旧任务",
    });
    assert.equal(status, "stale");
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 45) });
    assert.equal(row?.tmdbId ?? null, null);
    assert.equal(row?.imdbId, "tt-human");
  });
});

test("tidyUpListFilter splits suggested auto and no_match views", () => {
  const rows = [
    { doubanId: 1, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }), calibrated: false, tmdbId: null },
    { doubanId: 2, agent: JSON.stringify({ tmdbId: 10 }), calibrated: false, tmdbId: 10 },
    { doubanId: 3, agent: JSON.stringify({ status: "no_match" }), calibrated: false, tmdbId: null },
  ];
  assert.deepEqual(
    tidyUpListFilter(rows, "suggested").map((row) => row.doubanId),
    [1],
  );
  assert.deepEqual(
    tidyUpListFilter(rows, "auto").map((row) => row.doubanId),
    [2],
  );
  assert.deepEqual(
    tidyUpListFilter(rows, "no_match").map((row) => row.doubanId),
    [3],
  );
});

test("confirming an IMDb-conflict suggestion uses the candidate tuple", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 46,
      imdbId: "tt-old",
      agent: JSON.stringify({
        status: "suggested",
        tmdbId: 10,
        imdbId: "tt-new",
        traktId: 7,
      }),
    });
    const response = await postTidyUp(46, { intent: "confirm" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 46) });
    assert.equal(row?.tmdbId, 10);
    assert.equal(row?.imdbId, "tt-new");
    assert.equal(row?.traktId, 7);
  });
});

test("rejecting a suggestion does not clear deterministic ids", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 47,
      tmdbId: 101,
      imdbId: "tt-cron",
      agent: JSON.stringify({ status: "suggested", tmdbId: 10, imdbId: "tt-agent" }),
    });
    const response = await postTidyUp(47, { intent: "reject" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 47) });
    assert.equal(row?.tmdbId, 101);
    assert.equal(row?.imdbId, "tt-cron");
    assert.equal(JSON.parse(row?.agent ?? "{}").status, "no_match");
  });
});

test("confirming no_match without a candidate is rejected", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 48,
      agent: JSON.stringify({ status: "no_match", reason: "none" }),
    });
    const response = await postTidyUp(48, { intent: "confirm" });
    assert.equal(response.status, 400);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 48) });
    assert.equal(row?.calibrated, false);
  });
});
