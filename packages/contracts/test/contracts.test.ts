import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COLLECTION_IDS, getLatestYearlyRanking, MOVIE_YEARLY_RANKING_ID } from "../src/collections";
import { doubanRecommendSchema, doubanSearchSchema, doubanSubjectCollectionSchema } from "../src/douban";
import {
  imageProviderSchema,
  imageProvidersSchema,
  isTmdbReadAccessToken,
  resolveTmdbAccessToken,
  TMDB_IMAGE_LANGUAGE,
} from "../src/image-providers";
import {
  bridgeItemSchema,
  catalogQuerySchema,
  catalogResponseSchema,
  doubanIdSchema,
  itemsRequestSchema,
  metaResponseSchema,
} from "../src/index";

test("image provider contract accepts supported providers and rejects unknown providers", () => {
  assert.deepEqual(TMDB_IMAGE_LANGUAGE, ["zh", "en", "ja", "ko", "null"]);
  assert.equal(imageProviderSchema.safeParse({ provider: "douban", extra: {} }).success, true);
  assert.equal(imageProviderSchema.safeParse({ provider: "fanart", extra: { apiKey: "fanart-key" } }).success, true);
  assert.equal(
    imageProviderSchema.safeParse({
      provider: "tmdb",
      extra: { apiKey: "tmdb-token", imageLanguages: ["zh", "en", "null"] },
    }).success,
    true,
  );
  assert.equal(imageProviderSchema.safeParse({ provider: "unknown", extra: {} }).success, false);
  assert.equal(imageProvidersSchema.safeParse([]).success, true);
});

test("TMDB user tokens must look like a v4 JWT, otherwise the system token is used", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.e30.sig";
  assert.equal(isTmdbReadAccessToken(jwt), true);
  assert.equal(isTmdbReadAccessToken(` ${jwt} `), true);
  assert.equal(isTmdbReadAccessToken("0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d"), false);
  assert.equal(isTmdbReadAccessToken("tmdb-token"), false);
  assert.equal(isTmdbReadAccessToken(""), false);
  assert.equal(isTmdbReadAccessToken(), false);
  assert.equal(resolveTmdbAccessToken("0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d", "system-jwt"), "system-jwt");
  assert.equal(resolveTmdbAccessToken(jwt, "system-jwt"), jwt);
  assert.equal(resolveTmdbAccessToken("", "system-jwt"), "system-jwt");
});

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
    images: { poster: "/poster.jpg", background: null, logo: "https://cdn.example.com/logo.png" },
  });
  assert.equal(parsed.tmdbId, null);
  assert.equal(parsed.imdbId, null);
  assert.deepEqual(parsed.images, {
    poster: "/poster.jpg",
    background: null,
    logo: "https://cdn.example.com/logo.png",
  });
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

test("batch items request keeps 1-20 positive ids and rejects junk", () => {
  assert.deepEqual(itemsRequestSchema.parse({ ids: ["1291546", 278] }).ids, [1291546, 278]);
  assert.equal(itemsRequestSchema.safeParse({ ids: [] }).success, false);
  assert.equal(itemsRequestSchema.safeParse({ ids: Array.from({ length: 21 }, (_, i) => i + 1) }).success, false);
  assert.equal(itemsRequestSchema.safeParse({ ids: [0] }).success, false);
  assert.equal(itemsRequestSchema.safeParse({ ids: [1291546], extra: true }).success, false);
});

test("weixin search keeps movie/tv subjects and drops the rest", () => {
  const parsed = doubanSearchSchema.parse({
    items: [
      { layout: "doulist_cards", target_type: "doulist_cards" },
      {
        layout: "subject",
        target_type: "movie",
        target: {
          id: "38581618",
          title: "牛来",
          year: "2026",
          cover_url: "https://img.example/a.jpg",
          rating: { value: 6 },
        },
      },
      {
        layout: "subject",
        target_type: "book",
        target: { id: "34794569", title: "犀牛来了" },
      },
      {
        layout: "subject",
        target_type: "tv",
        target: { id: "2162905", title: "终极一班", year: "2005", card_subtitle: "中国大陆 / 剧情" },
      },
    ],
    total: 4,
  });
  assert.deepEqual(
    parsed.items.map((item) => [item.id, item.type, item.title]),
    [
      [38581618, "movie", "牛来"],
      [2162905, "tv", "终极一班"],
    ],
  );
  assert.equal(parsed.items[0]?.cover, "https://img.example/a.jpg");
});

test("recommend envelope keeps movie/tv subjects and object comments", () => {
  const parsed = doubanRecommendSchema.parse({
    items: [
      {
        id: "26752088",
        type: "movie",
        title: "我不是药神",
        year: "2018",
        pic: { large: "https://img.example/a.jpg" },
        comment: { comment: "真实事件改编" },
      },
      { id: "x", type: "book", title: "一本书" },
    ],
    total: 2,
  });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.id, 26752088);
  assert.equal(parsed.items[0]?.cover, "https://img.example/a.jpg");
  assert.equal(parsed.items[0]?.description, undefined);
});
