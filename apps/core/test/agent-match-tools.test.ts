import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { createAgentMatchTools } from "../src/libs/agent-match/tools";
import { ImdbAPI } from "../src/libs/api/imdb";
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

test("lift_imdb_series throws infrastructure failures", async () => {
  await withTestContext(async () => {
    try {
      mock.method(ImdbAPI.prototype, "search", async () => {
        throw new Error("IMDb down");
      });
      const tools = createAgentMatchTools(new CandidateRegistry());
      const lift = tools.find((t) => t.name === "lift_imdb_series")!;
      await assert.rejects(() => lift.execute({ imdbId: "tt1" }), /IMDb down/);
    } finally {
      mock.restoreAll();
    }
  });
});
