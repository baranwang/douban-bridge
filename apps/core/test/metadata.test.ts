import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import { api } from "../src/libs/api";
import { getCloudMeta, getStremioMeta } from "../src/services/metadata";
import { withTestContext } from "./context";

const images = { providers: [], origin: "https://douban-bridge.baran.wang" };

const detail = {
  id: 1,
  type: "movie" as const,
  title: "第一项",
  intro: "简介",
  year: "2023",
  genres: ["剧情"],
  actors: [{ name: "演员" }],
  directors: [{ name: "导演" }],
  rating: { value: 8.5 },
  url: "https://movie.douban.com/subject/1/",
  linewatches: [],
  languages: ["汉语普通话"],
  countries: ["中国"],
  honor_infos: [],
  cover_url: "https://img.example.com/cover.jpg",
};

describe("metadata service", { concurrency: false }, () => {
  test("opening cloud meta matches the missing id once", async () => {
    await withTestContext(async () => {
      try {
        const requested: number[] = [];
        mock.method(api.doubanAPI, "getSubjectDetail", async () => detail);
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
          requested.push(doubanId);
          return { doubanId, tmdbId: 201, imdbId: null, traktId: null };
        });
        const result = await getCloudMeta(1, images);
        assert.deepEqual(requested, [1]);
        assert.equal(result.doubanId, 1);
        assert.equal(result.tmdbId, 201);
        assert.equal(result.description, "简介");
        assert.deepEqual(result.actors, ["演员"]);
        assert.deepEqual(result.directors, ["导演"]);
        assert.deepEqual(result.genres, ["剧情"]);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("opening stremio meta does not match", async () => {
    await withTestContext(async () => {
      try {
        const requested: number[] = [];
        mock.method(api.doubanAPI, "getSubjectDetail", async () => detail);
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
          requested.push(doubanId);
          return { doubanId, tmdbId: 201, imdbId: null, traktId: null };
        });
        const result = await getStremioMeta(1, images);
        assert.deepEqual(requested, []);
        assert.equal(result.doubanId, 1);
        assert.equal(result.tmdbId, null);
        assert.equal(result.title, "第一项");
      } finally {
        mock.restoreAll();
      }
    });
  });
});
