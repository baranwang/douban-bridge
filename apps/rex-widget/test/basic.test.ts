import assert from "node:assert/strict";
import test from "node:test";
import { MOVIE_YEARLY_RANKING_ID } from "@douban-bridge/contracts/collections";

type TestWidget = {
  http: {
    get: (
      url: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<{ statusCode: number; data: unknown }>;
  };
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

const widget: TestWidget = {
  http: { get: async () => ({ statusCode: 200, data: SOURCE, headers: {} }) },
  tmdb: { get: async () => TMDB },
  storage: {
    get: async () => null,
    set: async () => {},
    remove: async () => {},
  },
};
globalThis.Widget = widget;
const { findBasicTmdb, getBasicCatalog } = await import("../src/basic");

function installWidget(opts?: {
  http?: (url: string) => { statusCode: number; data: unknown };
  tmdb?: (path: string) => unknown;
}) {
  const requests: string[] = [];
  const storage = new Map<string, string>();
  widget.http.get = async (url) => {
    requests.push(url);
    const response = opts?.http ? opts.http(url) : { statusCode: 200, data: SOURCE };
    return { ...response, headers: {} };
  };
  widget.tmdb.get = async (path) => {
    requests.push(path);
    if (opts?.tmdb) return opts.tmdb(path);
    return TMDB;
  };
  widget.storage = {
    get: async (key) => storage.get(key) ?? null,
    set: async (key, value) => {
      storage.set(key, value);
    },
    remove: async (key) => {
      storage.delete(key);
    },
  };
  return requests;
}

test("basic catalog uses public Douban paging and never calls the cloud API", async () => {
  const requests = installWidget();
  const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 20 });
  assert.equal(
    requests.some((url) => url.includes("/v1/")),
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

test("yearly rankings resolve the latest id and subcollections load directly", async () => {
  const yearly = installWidget();
  await getBasicCatalog({ collectionId: MOVIE_YEARLY_RANKING_ID, skip: 0 });
  assert.equal(
    yearly.some((url) => url.includes("subject_collection/ECE472UNY/items")),
    true,
  );

  const subcollection = installWidget({
    http: (url) => {
      if (url.includes("subject_collection/ECOIOTUGY/items")) return { statusCode: 200, data: SOURCE };
      throw new Error(`unexpected url ${url}`);
    },
  });
  const result = await getBasicCatalog({ collectionId: "ECOIOTUGY", skip: 0 });
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(
    subcollection.some((url) => url.includes("subject_collection/ECOIOTUGY/items")),
    true,
  );
  assert.equal(
    subcollection.some((url) => url.includes("for_mobile=1")),
    false,
  );
});
