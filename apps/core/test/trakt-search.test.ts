import assert from "node:assert/strict";
import test from "node:test";
import { TraktAPI } from "../src/libs/api/trakt";
import { withTestContext } from "./context";

test("Trakt search accepts a null year", async () => {
  const previous = (globalThis as { caches?: unknown }).caches;
  (globalThis as { caches: { default: { match: () => Promise<null>; put: () => Promise<void> } } }).caches = {
    default: {
      match: async () => null,
      put: async () => {},
    },
  };
  try {
    await withTestContext(async () => {
      const api = new TraktAPI();
      api.axios.defaults.adapter = async (config) => ({
        data: [
          {
            type: "show",
            show: { title: "凶杀重案实录：纽约 第二季", year: null, ids: { trakt: 1, tmdb: 2, imdb: null } },
            score: 1,
          },
        ],
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
      const results = await api.search("show", "凶杀重案实录：纽约 第二季");
      assert.equal(results.length, 1);
      assert.equal(results[0]?.show?.year ?? null, null);
    });
  } finally {
    if (previous === undefined) delete (globalThis as { caches?: unknown }).caches;
    else (globalThis as { caches: unknown }).caches = previous;
  }
});
