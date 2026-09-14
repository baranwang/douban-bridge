import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { FanartAPI } from "../src/libs/api/fanart";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { getCatalogPage } from "../src/services/catalog";
import { withTestContext } from "./context";

const origin = "https://douban-bridge-api.baran.wang";

describe("catalog service", { concurrency: false }, () => {
  test("fills only missing mappings and keeps source order", async () => {
    await withTestContext(async () => {
      try {
        await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, calibrated: true });
        const items = [
          { id: 2, type: "movie", title: "第二项", cover: undefined, year: "2024", description: undefined },
          { id: 1, type: "movie", title: "第一项", cover: undefined, year: "2023", description: undefined },
        ];
        const requested: number[] = [];
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: items,
          total: 2,
        }));
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
          requested.push(doubanId);
          return { doubanId, tmdbId: null, imdbId: null, traktId: null };
        });
        const result = await getCatalogPage(
          { collectionId: "movie_top250", skip: 0 },
          {
            providers: [],
            origin,
          },
        );
        assert.deepEqual(requested, [2]);
        assert.deepEqual(
          result.map((item) => item.doubanId),
          [2, 1],
        );
        assert.equal(result[1].tmdbId, 101);
        assert.equal(result[0].tmdbId, null);
        assert.deepEqual(result[0].images, { poster: null, background: null, logo: null });
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("empty pages do not call fetchIdMapping", async () => {
    await withTestContext(async () => {
      try {
        let fetchCalls = 0;
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [],
          total: 0,
        }));
        mock.method(api, "fetchIdMapping", async (ids: number[]) => {
          fetchCalls += 1;
          return { mappingCache: new Map(), missingIds: ids };
        });
        const result = await getCatalogPage({ collectionId: "movie_top250", skip: 0 }, { providers: [], origin });
        assert.deepEqual(result, []);
        assert.equal(fetchCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("a failed match keeps the source item", async () => {
    await withTestContext(async () => {
      try {
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [
            { id: 3, type: "movie", title: "第三项", cover: undefined, year: "2022", description: undefined },
          ],
          total: 1,
        }));
        mock.method(api, "findExternalId", async () => {
          throw new Error("match failed");
        });
        const result = await getCatalogPage({ collectionId: "movie_top250", skip: 0 }, { providers: [], origin });
        assert.equal(result.length, 1);
        assert.equal(result[0].doubanId, 3);
        assert.equal(result[0].title, "第三项");
        assert.equal(result[0].tmdbId, null);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("tmdb-only config with no image results leaves images null", async () => {
    await withTestContext(async () => {
      try {
        await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, calibrated: true });
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [
            {
              id: 1,
              type: "movie",
              title: "第一项",
              cover: "https://img.example.com/poster.jpg",
              year: "2023",
              description: undefined,
            },
          ],
          total: 1,
        }));
        mock.method(TmdbAPI.prototype, "getSubjectImages", async () => ({
          posters: [],
          backdrops: [],
          logos: [],
        }));
        const result = await getCatalogPage(
          { collectionId: "movie_top250", skip: 0 },
          {
            providers: [{ provider: "tmdb", extra: { apiKey: "test" } }],
            origin,
          },
        );
        assert.equal(result.length, 1);
        assert.deepEqual(result[0].images, { poster: null, background: null, logo: null });
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("a later image provider is used when the first throws", async () => {
    await withTestContext(async () => {
      try {
        await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, calibrated: true });
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [
            {
              id: 1,
              type: "movie",
              title: "第一项",
              cover: "https://img.example.com/poster.jpg",
              year: "2023",
              description: undefined,
            },
          ],
          total: 1,
        }));
        mock.method(FanartAPI.prototype, "getSubjectImages", async () => {
          throw new Error("fanart down");
        });
        const result = await getCatalogPage(
          { collectionId: "movie_top250", skip: 0 },
          {
            providers: [
              { provider: "fanart", extra: { apiKey: "test" } },
              { provider: "douban", extra: {} },
            ],
            origin,
          },
        );
        assert.equal(result[0].images.poster, "https://img.example.com/poster.jpg");
        assert.equal(result[0].images.background, null);
        assert.equal(result[0].images.logo, null);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("calibrated empty mappings are not rematched on this request", async () => {
    await withTestContext(async () => {
      try {
        await api.db.insert(doubanMapping).values({
          doubanId: 1,
          tmdbId: null,
          imdbId: null,
          traktId: null,
          calibrated: true,
        });
        const requested: number[] = [];
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [
            { id: 1, type: "movie", title: "第一项", cover: undefined, year: "2023", description: undefined },
          ],
          total: 1,
        }));
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
          requested.push(doubanId);
          return { doubanId, tmdbId: 999, imdbId: "tt999", traktId: null };
        });
        const result = await getCatalogPage({ collectionId: "movie_top250", skip: 0 }, { providers: [], origin });
        assert.deepEqual(requested, []);
        assert.equal(result[0].tmdbId, null);
        assert.equal(result[0].imdbId, null);
        const row = await api.db.query.doubanMapping.findFirst({
          where: eq(doubanMapping.doubanId, 1),
        });
        assert.equal(row?.tmdbId, null);
        assert.equal(row?.calibrated, true);
      } finally {
        mock.restoreAll();
      }
    });
  });
});
