import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { createAgentMatchTools } from "../src/libs/agent-match/tools";
import { api } from "../src/libs/api";
import { TmdbAPI } from "../src/libs/api/tmdb";
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

test("search_trakt registers parent show from episode hits", async () => {
  await withTestContext(async () => {
    try {
      mock.method(api.traktAPI, "search", async () => [
        {
          type: "episode" as const,
          show: { title: "Only Show", year: 2020, ids: { trakt: 9, tmdb: 99, imdb: "tt-show" } },
        },
      ]);
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry, { doubanType: "tv" });
      const search = tools.find((t) => t.name === "search_trakt")!;
      const out = await search.execute({ type: "episode", query: "Only Show" });
      assert.equal(out.results[0].candidateId, "tmdb:tv:99");
      assert.equal(registry.has("tmdb:tv:99"), true);
    } finally {
      mock.restoreAll();
    }
  });
});

test("exa_search returns trimmed titles and urls", async () => {
  await withTestContext(async (env) => {
    try {
      (env as CloudflareBindings & { EXA_API_KEY?: string }).EXA_API_KEY = "test-exa";
      const { default: Exa } = await import("exa-js");
      mock.method(Exa.prototype, "search", async () => ({
        results: [{ title: "Inception", url: "https://example.com/inception", publishedDate: "2010-01-01" }],
      }));
      const tools = createAgentMatchTools(new CandidateRegistry());
      const search = tools.find((t) => t.name === "exa_search");
      assert.ok(search);
      const out = await search.execute({ query: "盗梦空间 2010" });
      assert.equal(out.results[0].url, "https://example.com/inception");
    } finally {
      mock.restoreAll();
    }
  });
});

test("exa_get_contents trims page text", async () => {
  await withTestContext(async (env) => {
    try {
      (env as CloudflareBindings & { EXA_API_KEY?: string }).EXA_API_KEY = "test-exa";
      const { default: Exa } = await import("exa-js");
      mock.method(Exa.prototype, "getContents", async () => ({
        results: [{ title: "Inception", url: "https://example.com/inception", text: "x".repeat(2000) }],
      }));
      const tools = createAgentMatchTools(new CandidateRegistry());
      const getContents = tools.find((t) => t.name === "exa_get_contents");
      assert.ok(getContents);
      const out = await getContents.execute({ urls: "https://example.com/inception" });
      assert.equal(out.results[0].text.length, 1500);
    } finally {
      mock.restoreAll();
    }
  });
});

test("get_douban_subject ignores a hallucinated doubanId when a job id is pinned", async () => {
  await withTestContext(async () => {
    try {
      mock.method(api.doubanAPI, "getSubjectDetail", async (id: number) => {
        if (id !== 41) throw new Error(`unexpected douban id ${id}`);
        return {
          id: 41,
          type: "tv",
          title: "Pinned",
          original_title: "Pinned",
          aka: ["别名"],
          year: "2010",
          episodes_count: 24,
        };
      });
      const tools = createAgentMatchTools(new CandidateRegistry(), { doubanType: "tv", doubanId: 41 });
      const getSubject = tools.find((t) => t.name === "get_douban_subject")!;
      const out = await getSubject.execute({ doubanId: 999 });
      assert.equal(out.doubanId, 41);
      assert.deepEqual(out.aka, ["别名"]);
      assert.equal(out.episodes_count, 24);
      assert.equal("tmdbId" in out, false);
      assert.equal("traktId" in out, false);
    } finally {
      mock.restoreAll();
    }
  });
});

for (const name of ["exa_search", "exa_get_contents"]) {
  test(`${name} reuses concurrent and repeated calls, including across tool instances`, async () => {
    await withTestContext(async (env, ctx) => {
      try {
        env.EXA_API_KEY = "test-exa";
        const { default: Exa } = await import("exa-js");
        const method = name === "exa_search" ? "search" : "getContents";
        let calls = 0;
        mock.method(Exa.prototype, method, async () => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { results: [{ title: "Cached", url: "https://example.com/cached", text: "Evidence" }] };
        });
        const pending: Promise<unknown>[] = [];
        mock.method(ctx, "waitUntil", (promise: Promise<unknown>) => pending.push(promise));
        const args = name === "exa_search" ? { query: "重复查询 2012" } : { urls: "https://example.com/cached" };
        const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(tool);
        const [first, concurrent] = await Promise.all([tool.execute(args), tool.execute(args)]);
        assert.deepEqual(concurrent, first);
        assert.deepEqual(await tool.execute(args), first);
        assert.equal(calls, 1);
        await Promise.all(pending);
        const another = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(another);
        assert.deepEqual(await another.execute(args), first);
        assert.equal(calls, 1);
        await tool.execute(name === "exa_search" ? { query: "另一查询" } : { urls: "https://example.com/other" });
        assert.equal(calls, 2);
        await Promise.all(pending);
        const future = Date.now() + 10 * 60 * 1000 + 1;
        mock.method(Date, "now", () => future);
        const refreshed = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(refreshed);
        assert.deepEqual(await refreshed.execute(args), first);
        assert.equal(calls, 3);
        await Promise.all(pending);
        env.EXA_API_KEY = "";
        await assert.rejects(tool.execute(args), /EXA_API_KEY is required/);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test(`${name} retries failures and refreshes expired results`, async () => {
    await withTestContext(async (env) => {
      try {
        env.EXA_API_KEY = "test-exa";
        const { default: Exa } = await import("exa-js");
        const method = name === "exa_search" ? "search" : "getContents";
        let calls = 0;
        mock.method(Exa.prototype, method, async () => {
          if (++calls === 1) throw new Error("upstream failed");
          return { results: [] };
        });
        // Keep expiry deterministic without depending on KV's wall clock.
        env.KV = { get: async () => null, put: async () => {} } as KVNamespace;
        let now = Date.now();
        mock.method(Date, "now", () => now);
        const args = name === "exa_search" ? { query: "重试" } : { urls: "https://example.com/retry" };
        const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(tool);
        await assert.rejects(tool.execute(args), /upstream failed/);
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.equal(calls, 2);
        now += 10 * 60 * 1000 + 1;
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.equal(calls, 3);
      } finally {
        mock.restoreAll();
      }
    });
  });
}

test("Exa cache failures preserve successful results and per-job reuse", async () => {
  await withTestContext(async (env) => {
    try {
      env.EXA_API_KEY = "test-exa";
      env.KV = {
        get: async () => {
          throw new Error("KV unavailable");
        },
        put: async () => {
          throw new Error("KV unavailable");
        },
      } as KVNamespace;
      const { default: Exa } = await import("exa-js");
      let calls = 0;
      mock.method(Exa.prototype, "search", async () => {
        calls++;
        return { results: [{ title: "Available", url: "https://example.com/available" }] };
      });
      const warnings: unknown[][] = [];
      mock.method(console, "warn", (...args) => warnings.push(args));
      const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === "exa_search");
      assert.ok(tool);
      const first = await tool.execute({ query: "查询" });
      assert.equal(first.results[0].title, "Available");
      assert.deepEqual(await tool.execute({ query: " 查询 " }), first);
      assert.equal(calls, 1);
      assert.equal(warnings.length, 1);
    } finally {
      mock.restoreAll();
    }
  });
});
