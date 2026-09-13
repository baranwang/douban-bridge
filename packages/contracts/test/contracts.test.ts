import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COLLECTION_IDS, getLatestYearlyRanking, MOVIE_YEARLY_RANKING_ID } from "../src/collections";
import { doubanSubjectCollectionSchema } from "../src/douban";
import {
  bridgeItemSchema,
  catalogQuerySchema,
  catalogResponseSchema,
  doubanIdSchema,
  metaResponseSchema,
} from "../src/index";

test("pagination and empty pages have different meanings from failures", () => {
  assert.equal(catalogQuerySchema.parse({ collectionId: "movie_top250", skip: "20" }).skip, 20);
  for (const skip of ["-1", "1.5", "NaN", "Infinity"])
    assert.equal(catalogQuerySchema.safeParse({ collectionId: "movie_top250", skip }).success, false);
  assert.equal(catalogQuerySchema.safeParse({ collectionId: "https://example.com" }).success, false);
  assert.deepEqual(catalogResponseSchema.parse({ items: [] }), { items: [] });
  assert.equal(catalogResponseSchema.safeParse({}).success, false);
});

test("non-critical ids and images degrade without failing the page", () => {
  const parsed = bridgeItemSchema.parse({
    doubanId: 1291546,
    mediaType: "movie",
    title: "霸王别姬",
    tmdbId: "bad",
    imdbId: "not-imdb",
    images: { poster: "not-a-url", background: null, logo: "also-not-a-url" },
  });
  assert.equal(parsed.tmdbId, null);
  assert.equal(parsed.imdbId, null);
  assert.deepEqual(parsed.images, { poster: null, background: null, logo: null });
  assert.equal(bridgeItemSchema.safeParse({ mediaType: "movie", title: "x", images: {} }).success, false);
  assert.equal(doubanIdSchema.safeParse("0123").success, false);
  assert.equal(doubanIdSchema.parse("1291546"), 1291546);
  assert.equal(metaResponseSchema.safeParse({ item: parsed }).success, false);
});

test("default collections and yearly ranking ids stay stable", () => {
  assert.equal(DEFAULT_COLLECTION_IDS.length, 13);
  assert.equal(getLatestYearlyRanking(MOVIE_YEARLY_RANKING_ID)?.id, "ECE472UNY");
  assert.ok(DEFAULT_COLLECTION_IDS.includes("movie_top250"));
  assert.ok(DEFAULT_COLLECTION_IDS.includes("tv_hot"));
});

test("moved Douban schema still parses a public collection envelope", () => {
  const parsed = doubanSubjectCollectionSchema.parse({
    subject_collection_items: [{ id: 1291546, type: "movie", title: "肖申克的救赎", year: "1994" }],
    total: 1,
  });
  assert.equal(parsed.subject_collection_items[0]?.id, 1291546);
  assert.equal(parsed.subject_collection_items[0]?.cover, undefined);
});
