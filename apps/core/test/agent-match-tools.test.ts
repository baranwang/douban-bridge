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
        };
      });
      const tools = createAgentMatchTools(new CandidateRegistry(), { doubanType: "tv", doubanId: 41 });
      const getSubject = tools.find((t) => t.name === "get_douban_subject")!;
      const out = await getSubject.execute({ doubanId: 999 });
      assert.equal(out.doubanId, 41);
      assert.deepEqual(out.aka, ["别名"]);
      assert.equal("tmdbId" in out, false);
      assert.equal("traktId" in out, false);
    } finally {
      mock.restoreAll();
    }
  });
});
