import assert from "node:assert/strict";
import test from "node:test";
import { MOVIE_YEARLY_RANKING_ID } from "@douban-bridge/contracts/collections";
import { findBasicTmdb, getBasicCatalog, getBasicMeta } from "../src/basic";

type TestWidget = {
  http: { get: (url: string, options?: { headers?: Record<string, string> }) => Promise<{ statusCode: number; data: unknown }> };
  tmdb: { get: (path: string, options?: { params?: Record<string, string> }) => Promise<unknown> };
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
};

const SOURCE = {
  subject_collection_items: [
    {
      id: 1291546,
      type: "movie",
      title: "肖申克的救赎",
      year: "1994",
      cover_url: "https://img1.doubanio.com/test.jpg",
    },
  ],
  total: 1,
};

const TMDB = {
  results: [{ id: 278, title: "肖申克的救赎", release_date: "1994-09-23", poster_path: "/test.jpg" }],
};

const DETAIL = {
  id: 1291546,
  type: "movie",
  title: "肖申克的救赎",
  intro: "一个银行家的故事",
  cover_url: "https://img1.doubanio.com/test.jpg",
  year: "1994",
  actors: [{ name: "Tim Robbins" }, { name: "Morgan Freeman" }],
  directors: [{ name: "Frank Darabont" }],
  genres: ["剧情", "犯罪"],
  rating: { value: 9.7 },
};

const CATEGORY = {
  category_tabs: [
    {
      category: "类型",
      items: [
        { current: true, id: "movie_comedy", name: "全部" },
        { current: false, id: "film_genre_27", name: "剧情" },
      ],
    },
  ],
};

function installWidget(opts?: {
  http?: (url: string) => { statusCode: number; data: unknown };
  tmdb?: (path: string) => unknown;
}) {
  const requests: string[] = [];
  const storage = new Map<string, string>();
  const widget: TestWidget = {
    http: {
      get: async (url) => {
        requests.push(url);
        if (opts?.http) return opts.http(url);
        return { statusCode: 200, data: SOURCE };
      },
    },
    tmdb: {
      get: async (path) => {
        requests.push(path);
        if (opts?.tmdb) return opts.tmdb(path);
        return TMDB;
      },
    },
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => {
        storage.set(key, value);
      },
      remove: async (key) => {
        storage.delete(key);
      },
    },
  };
  globalThis.Widget = widget;
  return requests;
}

test("basic catalog uses public Douban paging and never calls the cloud API", async () => {
  const requests = installWidget();
  const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 20 });
  assert.equal(
    requests.some((url) => url.includes("douban-bridge-api")),
    false,
  );
  assert.equal(
    requests.some((url) => url.includes("start=20") && url.includes("count=20")),
    true,
  );
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(result[0].tmdbId, 278);
  assert.equal(result[0].title, "肖申克的救赎");
  assert.equal(result[0].imdbId, null);
  assert.equal(result[0].images.poster, "https://image.tmdb.org/t/p/original/test.jpg");
  assert.equal(result[0].images.logo, null);
  assert.equal(
    requests.some((url) => url.includes("/subject/1291546") && !url.includes("subject_collection")),
    false,
  );
});

test("TMDB failure keeps Douban id and cover", async () => {
  installWidget({
    tmdb: () => {
      throw new Error("network");
    },
  });
  const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(result[0].tmdbId, null);
  assert.equal(result[0].images.poster, "https://img1.doubanio.com/test.jpg");
});

test("multiple TMDB candidates do not match", async () => {
  installWidget({
    tmdb: () => ({
      results: [
        { id: 278, title: "肖申克的救赎", release_date: "1994-09-23" },
        { id: 999, title: "肖申克的救赎", release_date: "1994-01-01" },
      ],
    }),
  });
  const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
  assert.equal(result[0].tmdbId, null);
  assert.equal(await findBasicTmdb({ type: "movie", title: "肖申克的救赎", year: "1994" }), null);
});

test("movie and TV with the same title do not search across type", async () => {
  const movieRequests = installWidget();
  await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
  assert.equal(movieRequests.includes("search/movie"), true);
  assert.equal(movieRequests.includes("search/tv"), false);

  const tvSource = {
    subject_collection_items: [{ id: 1291546, type: "tv", title: "肖申克的救赎", year: "1994" }],
    total: 1,
  };
  const tvRequests = installWidget({
    http: () => ({ statusCode: 200, data: tvSource }),
    tmdb: () => ({ results: [{ id: 1396, name: "肖申克的救赎", first_air_date: "1994-01-01" }] }),
  });
  const tv = await getBasicCatalog({ collectionId: "tv_hot", skip: 0 });
  assert.equal(tvRequests.includes("search/tv"), true);
  assert.equal(tvRequests.includes("search/movie"), false);
  assert.equal(tv[0].tmdbId, 1396);
});

test("Douban source failure rejects", async () => {
  installWidget({ http: () => ({ statusCode: 500, data: null }) });
  await assert.rejects(() => getBasicCatalog({ collectionId: "movie_top250", skip: 0 }), /Douban request failed/);
});

test("a real empty Douban page returns an empty list", async () => {
  const requests = installWidget({
    http: () => ({ statusCode: 200, data: { subject_collection_items: [], total: 0 } }),
  });
  assert.deepEqual(await getBasicCatalog({ collectionId: "movie_top250", skip: 0 }), []);
  assert.equal(requests.includes("search/movie"), false);
});

test("direct meta reads Douban actors without calling the cloud", async () => {
  const requests = installWidget({
    http: (url) => {
      if (url.includes("/subject/1291546")) return { statusCode: 200, data: DETAIL };
      return { statusCode: 404, data: null };
    },
  });
  const item = await getBasicMeta(1291546);
  assert.deepEqual(item.actors, ["Tim Robbins", "Morgan Freeman"]);
  assert.deepEqual(item.directors, ["Frank Darabont"]);
  assert.deepEqual(item.genres, ["剧情", "犯罪"]);
  assert.equal(item.description, "一个银行家的故事");
  assert.equal(item.tmdbId, 278);
  assert.equal(item.imdbId, null);
  assert.equal(
    requests.some((url) => url.includes("douban-bridge-api")),
    false,
  );
});

test("yearly ranking and genre use the same collection mapping", async () => {
  const yearly = installWidget();
  await getBasicCatalog({ collectionId: MOVIE_YEARLY_RANKING_ID, skip: 0 });
  assert.equal(
    yearly.some((url) => url.includes("subject_collection/ECE472UNY/items")),
    true,
  );

  const genre = installWidget({
    http: (url) => {
      if (url.includes("for_mobile=1")) return { statusCode: 200, data: CATEGORY };
      if (url.includes("subject_collection/film_genre_27/items")) return { statusCode: 200, data: SOURCE };
      throw new Error(`unexpected url ${url}`);
    },
  });
  const result = await getBasicCatalog({ collectionId: "movie_comedy", skip: 0, genre: "剧情" });
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(
    genre.some((url) => url.includes("subject_collection/movie_comedy") && url.includes("for_mobile=1")),
    true,
  );
  assert.equal(
    genre.some((url) => url.includes("subject_collection/film_genre_27/items")),
    true,
  );

  const unknown = installWidget({
    http: (url) => {
      if (url.includes("for_mobile=1")) return { statusCode: 200, data: CATEGORY };
      if (url.includes("subject_collection/movie_comedy/items")) return { statusCode: 200, data: SOURCE };
      throw new Error(`unexpected url ${url}`);
    },
  });
  await getBasicCatalog({ collectionId: "movie_comedy", skip: 0, genre: "不存在" });
  assert.equal(
    unknown.some((url) => url.includes("subject_collection/movie_comedy/items")),
    true,
  );
  assert.equal(
    unknown.some((url) => url.includes("film_genre_27/items")),
    false,
  );
});
