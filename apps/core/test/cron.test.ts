import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { eq } from "drizzle-orm";
import { scheduled } from "../src/cron";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { ImdbAPI } from "../src/libs/api/imdb";
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
      mock.method(ImdbAPI.prototype, "search", async () => {
        throw new Error("IMDb rejected one id");
      });

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
