import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { verifyConcludeMatch } from "../src/libs/agent-match/verifier";
import { applyAgentVerdict } from "../src/libs/agent-match/writer";
import { app } from "../src/app";
import { api } from "../src/libs/api";
import { enqueueSelectedAgentJobs, tidyUpListFilter } from "../src/routes/dash/tidy-up";
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

test("tidyUpListFilter splits unmatched suggested auto and no_match views", () => {
  const rows = [
    { doubanId: 1, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }), calibrated: false, tmdbId: null },
    { doubanId: 2, agent: JSON.stringify({ tmdbId: 10 }), calibrated: false, tmdbId: 10 },
    { doubanId: 3, agent: JSON.stringify({ status: "no_match" }), calibrated: false, tmdbId: null },
    { doubanId: 4, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }), calibrated: false, tmdbId: 101 },
    { doubanId: 5, agent: null, calibrated: false, tmdbId: null },
    {
      doubanId: 6,
      agent: JSON.stringify({ token: "tok", leaseUntil: Date.now() + 60_000 }),
      calibrated: false,
      tmdbId: null,
    },
  ];
  assert.deepEqual(
    tidyUpListFilter(rows, "unmatched").map((row) => row.doubanId),
    [5, 6],
  );
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

test("enqueueSelectedAgentJobs claims unmatched and suggested ids", async () => {
  await withTestContext(async () => {
    await api.db
      .insert(doubanMapping)
      .values([
        { doubanId: 51 },
        { doubanId: 52, agent: JSON.stringify({ status: "no_match" }) },
        { doubanId: 53, tmdbId: 1 },
        { doubanId: 54, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }) },
      ]);
    const sent: Array<{ doubanId: number; agentToken: string }> = [];
    const queued = await enqueueSelectedAgentJobs(
      [51, 52, 53, 51, 54],
      { send: async (job) => sent.push(job) },
      {
        waitUntil(promise) {
          void promise;
        },
      },
    );
    assert.equal(queued, 2);
    assert.deepEqual(
      sent.map((job) => job.doubanId).sort((a, b) => a - b),
      [51, 54],
    );
    const claimed = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 54) });
    assert.ok(JSON.parse(claimed?.agent ?? "{}").token);
  });
});

test("tidyUpListFilter excludes cron-resolved suggestions from auto", () => {
  const rows = [
    { doubanId: 4, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }), calibrated: false, tmdbId: 101 },
    { doubanId: 5, agent: JSON.stringify({ tmdbId: 101 }), calibrated: false, tmdbId: 101 },
  ];
  assert.deepEqual(
    tidyUpListFilter(rows, "auto").map((row) => row.doubanId),
    [5],
  );
  assert.deepEqual(
    tidyUpListFilter(rows, "suggested").map((row) => row.doubanId),
    [],
  );
});

test("confirming an auto-written mapping keeps the official tuple", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({
      doubanId: 48,
      tmdbId: 101,
      imdbId: "tt-cron",
      traktId: 9,
      agent: JSON.stringify({ status: "suggested", tmdbId: 10, imdbId: "tt-agent", traktId: 7 }),
    });
    const response = await postTidyUp(48, { intent: "confirm" });
    assert.equal(response.status, 302);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 48) });
    assert.equal(row?.tmdbId, 101);
    assert.equal(row?.imdbId, "tt-cron");
    assert.equal(row?.traktId, 9);
    assert.equal(row?.calibrated, true);
    assert.equal(row?.agent ?? null, null);
  });
});

test("tidy-up detail through /dash does not 500 when the mapping row exists", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 38372172, imdbId: "tt38372172" });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 38372172,
        type: "movie",
        title: "Mapped Row",
        original_title: "Mapped Row",
        year: "2024",
      }));
      mock.method(api.traktAPI, "search", async () => []);
      mock.method(api.traktAPI, "searchByImdbId", async () => []);
      mock.method(api.traktAPI, "searchByTmdbId", async () => []);
      const { TmdbAPI } = await import("../src/libs/api/tmdb");
      mock.method(TmdbAPI.prototype, "search", async () => ({ results: [], total_results: 0 }));
      mock.method(TmdbAPI.prototype, "findById", async () => ({
        movie_results: [],
        tv_results: [],
        tv_episode_results: [],
      }));
      const response = await app.fetch(
        new Request("https://douban-bridge.baran.wang/dash/tidy-up/38372172", {
          headers: { Authorization: `Basic ${btoa("dash:dash")}` },
        }),
        env,
        ctx,
      );
      assert.notEqual(response.status, 500);
      assert.equal(response.status, 200);
    } finally {
      mock.restoreAll();
    }
  });
});

test("tidy-up detail returns 404 when the mapping row is missing", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 38372173,
        type: "movie",
        title: "Missing Row",
        original_title: "Missing Row",
        year: "2024",
      }));
      const response = await app.fetch(
        new Request("https://douban-bridge.baran.wang/dash/tidy-up/38372173", {
          headers: { Authorization: `Basic ${btoa("dash:dash")}` },
        }),
        env,
        ctx,
      );
      assert.equal(response.status, 404);
    } finally {
      mock.restoreAll();
    }
  });
});

test("tidy-up detail through /dash stays up when IMDb lookup fails", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 38372172, imdbId: "tt38372172" });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 38372172,
        type: "movie",
        title: "Mapped Row",
        original_title: "Mapped Row",
        year: "2024",
      }));
      mock.method(api.traktAPI, "search", async () => []);
      mock.method(api.traktAPI, "searchByImdbId", async () => {
        throw new Error("trakt imdb down");
      });
      const { TmdbAPI } = await import("../src/libs/api/tmdb");
      mock.method(TmdbAPI.prototype, "search", async () => ({ results: [], total_results: 0 }));
      mock.method(TmdbAPI.prototype, "findById", async () => {
        throw new Error("tmdb imdb down");
      });
      const response = await app.fetch(
        new Request("https://douban-bridge.baran.wang/dash/tidy-up/38372172", {
          headers: { Authorization: `Basic ${btoa("dash:dash")}` },
        }),
        env,
        ctx,
      );
      assert.equal(response.status, 200);
    } finally {
      mock.restoreAll();
    }
  });
});
