import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { eq } from "drizzle-orm";
import { scheduled } from "../src/cron";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("cron continues after one mapping lookup fails", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values([
        { doubanId: 1, imdbId: "tt-bad" },
        { doubanId: 2, imdbId: "tt-good" },
      ]);
      mock.method(api.traktAPI, "searchByImdbId", async (imdbId: string) =>
        imdbId === "tt-bad"
          ? []
          : [{ type: "movie" as const, movie: { ids: { trakt: 2, tmdb: 22, imdb: "tt-good" } } }],
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({ type: "tv" }) as never);

      env.AGENT_MATCH_QUEUE = { send: async () => ({ metadata: { metrics: { retries: 0 } } }) } as Queue;
      const pending: Promise<unknown>[] = [];
      const ctx = {
        waitUntil(promise: Promise<unknown>) {
          pending.push(promise);
        },
        passThroughOnException() {},
      } as ExecutionContext;
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, ctx);
      await Promise.all(pending);

      const mapped = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 2) });
      assert.equal(mapped?.tmdbId, 22);
    } finally {
      mock.restoreAll();
    }
  });
});

test("cron does not treat missing years as a unique year match", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 10 });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "movie",
        title: "同名电影",
        original_title: "Same Name",
        year: undefined,
      }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "movie" as const, movie: { title: "Other", year: undefined, ids: { trakt: 1, tmdb: 1, imdb: "tt1" } } },
        { type: "movie" as const, movie: { title: "Same Name", year: 1999, ids: { trakt: 2, tmdb: 2, imdb: "tt2" } } },
      ]);
      env.AGENT_MATCH_QUEUE = { send: async () => ({ metadata: { metrics: { retries: 0 } } }) } as Queue;
      const pending: Promise<unknown>[] = [];
      const ctx = {
        waitUntil(p: Promise<unknown>) {
          pending.push(p);
        },
        passThroughOnException() {},
      } as ExecutionContext;
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, ctx);
      await Promise.all(pending);
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 10) });
      assert.equal(row?.tmdbId ?? null, null);
    } finally {
      mock.restoreAll();
    }
  });
});

test("cron continues to title search after IMDb lookup returns nothing", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({ doubanId: 11, imdbId: "tt-season" });
      mock.method(api.traktAPI, "searchByImdbId", async () => []);
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "tv",
        title: "独一部剧",
        original_title: "Only Show",
        year: "2020",
      }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "show" as const, show: { ids: { trakt: 9, tmdb: 99, imdb: "tt-show" } } },
      ]);
      env.AGENT_MATCH_QUEUE = { send: async () => ({ metadata: { metrics: { retries: 0 } } }) } as Queue;
      const pending: Promise<unknown>[] = [];
      const ctx = {
        waitUntil(p: Promise<unknown>) {
          pending.push(p);
        },
        passThroughOnException() {},
      } as ExecutionContext;
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, ctx);
      await Promise.all(pending);
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 11) });
      assert.equal(row?.tmdbId, 99);
      assert.notEqual(row?.calibrated, true);
    } finally {
      mock.restoreAll();
    }
  });
});

