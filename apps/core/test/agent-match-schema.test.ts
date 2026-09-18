import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { tmdbSearchResultItemSchema } from "../src/libs/api/tmdb/schema";
import { withTestContext } from "./context";

test("new mapping rows get a null agent blob", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 42, imdbId: "tt1" });
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 42) });
    assert.equal(row?.agent ?? null, null);
  });
});

test("tmdb search schema keeps tv names", () => {
  const parsed = tmdbSearchResultItemSchema.parse({
    id: 1396,
    name: "Breaking Bad",
    original_name: "Breaking Bad",
    first_air_date: "2008-01-20",
  });
  assert.equal(parsed.title, "Breaking Bad");
  assert.equal(parsed.original_title, "Breaking Bad");
  assert.equal(parsed.first_air_date, "2008-01-20");
});
