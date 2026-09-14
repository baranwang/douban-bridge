import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COLLECTION_IDS,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
  YEARLY_RANKINGS,
} from "@douban-bridge/contracts/collections";
import { loadCatalog, loadMeta } from "../src/cloud";
import { loadDefaultCatalog, loadDetail, WidgetMetadata } from "../src/index";

type TestWidget = {
  http: { get: (url: string, options?: { headers?: Record<string, string> }) => Promise<{ statusCode: number; data: unknown }> };
  tmdb: { get: (path: string, options?: { params?: Record<string, string> }) => Promise<unknown> };
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
};

const DOUBAN_SOURCE = {
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

const DOUBAN_DETAIL = {
  id: 1291546,
  type: "movie",
  title: "肖申克的救赎",
  intro: "一个银行家的故事",
  cover_url: "https://img1.doubanio.com/test.jpg",
  year: "1994",
  actors: [{ name: "Tim Robbins" }],
  directors: [{ name: "Frank Darabont" }],
  genres: ["剧情"],
  rating: { value: 9.7 },
};

const CLOUD_ITEM = {
  doubanId: 1291546,
  mediaType: "movie" as const,
  title: "云端标题",
  description: "cloud-list",
  year: "1994",
  rating: 9.7,
  tmdbId: 278,
  imdbId: "tt0111161",
  images: {
    poster: "https://cdn.example.com/poster.jpg",
    background: "https://cdn.example.com/bg.jpg",
    logo: null,
  },
};

const CLOUD_DETAIL = {
  ...CLOUD_ITEM,
  description: "cloud-detail",
  actors: ["云端演员"],
  directors: ["云端导演"],
  genres: ["剧情"],
};

const SK = "sk_test";
const SK_STORAGE = "douban.bridge.sk";

function hostFixture(): TestWidget {
  const storage = new Map<string, string>();
  return {
    http: {
      get: async () => {
        throw new Error("unexpected http");
      },
    },
    tmdb: {
      get: async () => {
        throw new Error("tmdb");
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
}

function install(
  handler: (
    url: string,
    options?: { headers?: Record<string, string> },
  ) => Promise<{ statusCode: number; data: unknown }>,
) {
  const counts = { cloud: 0, basic: 0 };
  const widget = hostFixture();
  widget.http.get = async (url, options) => {
    const host = new URL(url).hostname;
    if (host === "douban-bridge-api.baran.wang") {
      counts.cloud += 1;
      return handler(url, options);
    }
    counts.basic += 1;
    if (url.includes("/subject/1291546") && !url.includes("subject_collection")) {
      return { statusCode: 200, data: DOUBAN_DETAIL };
    }
    return { statusCode: 200, data: DOUBAN_SOURCE };
  };
  globalThis.Widget = widget;
  return { widget, counts };
}

test("valid empty cloud page never calls local sources", async () => {
  let calls = 0;
  globalThis.Widget = {
    ...hostFixture(),
    http: {
      get: async (url) => {
        calls += 1;
        assert.equal(new URL(url).hostname, "douban-bridge-api.baran.wang");
        return { statusCode: 200, data: { items: [] } };
      },
    },
  };
  assert.deepEqual(await loadCatalog({ collectionId: "movie_top250", skip: 0 }, "sk_test"), []);
  assert.equal(calls, 1);
});

test("empty sk uses basic catalog only", async () => {
  const { counts } = install(async () => {
    throw new Error("cloud should not be called");
  });
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, "");
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 1);
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(result[0].title, "肖申克的救赎");
});

test("complete cloud catalog never calls basic and keeps original images", async () => {
  const { counts } = install(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/v1/catalog/movie_top250");
    assert.equal(parsed.searchParams.get("skip"), "0");
    assert.equal(options?.headers?.Authorization, `Bearer ${SK}`);
    return { statusCode: 200, data: { items: [CLOUD_ITEM] } };
  });
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
  assert.equal(result[0].title, "云端标题");
  assert.equal(result[0].images.poster, "https://cdn.example.com/poster.jpg");
  assert.equal(result[0].tmdbId, 278);
});

test("cloud item with null tmdbId stays on the cloud item", async () => {
  const { counts } = install(async () => ({
    statusCode: 200,
    data: { items: [{ ...CLOUD_ITEM, tmdbId: null, imdbId: null }] },
  }));
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
  assert.equal(result[0].tmdbId, null);
  assert.equal(result[0].doubanId, 1291546);
  assert.equal(result[0].images.poster, "https://cdn.example.com/poster.jpg");
});

test("missing items falls back to basic", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: {} }));
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result[0].title, "肖申克的救赎");
});

test("illegal cloud item falls back to basic", async () => {
  const { counts } = install(async () => ({
    statusCode: 200,
    data: { items: [{ doubanId: 1 }] },
  }));
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result[0].title, "肖申克的救赎");
});

for (const statusCode of [401, 403, 404, 429, 500]) {
  test(`cloud ${statusCode} falls back to basic without clearing sk`, async () => {
    const { widget, counts } = install(async () => ({ statusCode, data: null }));
    await widget.storage.set(SK_STORAGE, SK);
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    assert.equal(counts.cloud, 1);
    assert.equal(counts.basic, 1);
    assert.equal(result[0].title, "肖申克的救赎");
    assert.equal(await widget.storage.get(SK_STORAGE), SK);
  });
}

test("cloud HTTP reject falls back to basic", async () => {
  const { counts } = install(async () => {
    throw new Error("network");
  });
  const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result[0].title, "肖申克的救赎");
});

test("cloud and basic catalog failure rejects to the host", async () => {
  const counts = { cloud: 0, basic: 0 };
  const widget = hostFixture();
  widget.http.get = async (url) => {
    if (new URL(url).hostname === "douban-bridge-api.baran.wang") {
      counts.cloud += 1;
      return { statusCode: 500, data: null };
    }
    counts.basic += 1;
    throw new Error("douban down");
  };
  globalThis.Widget = widget;
  await assert.rejects(() => loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK));
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
});

test("empty sk uses basic meta only", async () => {
  const { counts } = install(async () => {
    throw new Error("cloud should not be called");
  });
  const result = await loadMeta(1291546, "");
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 1);
  assert.deepEqual(result.actors, ["Tim Robbins"]);
});

test("complete cloud meta never calls basic and keeps original images", async () => {
  const { counts } = install(async (url, options) => {
    assert.equal(url, "https://douban-bridge-api.baran.wang/v1/meta/1291546");
    assert.equal(options?.headers?.Authorization, `Bearer ${SK}`);
    return { statusCode: 200, data: { item: CLOUD_DETAIL } };
  });
  const result = await loadMeta(1291546, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
  assert.equal(result.description, "cloud-detail");
  assert.equal(result.images.poster, "https://cdn.example.com/poster.jpg");
  assert.deepEqual(result.actors, ["云端演员"]);
});

test("cloud meta with null tmdbId stays on the cloud item", async () => {
  const { counts } = install(async () => ({
    statusCode: 200,
    data: { item: { ...CLOUD_DETAIL, tmdbId: null, imdbId: null } },
  }));
  const result = await loadMeta(1291546, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
  assert.equal(result.tmdbId, null);
  assert.equal(result.images.poster, "https://cdn.example.com/poster.jpg");
});

test("missing cloud meta item falls back to basic", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: {} }));
  const result = await loadMeta(1291546, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result.title, "肖申克的救赎");
});

test("illegal cloud meta item falls back to basic", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: { item: { doubanId: 1 } } }));
  const result = await loadMeta(1291546, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result.title, "肖申克的救赎");
});

for (const statusCode of [401, 403, 404, 429, 500]) {
  test(`cloud meta ${statusCode} falls back to basic without clearing sk`, async () => {
    const { widget, counts } = install(async () => ({ statusCode, data: null }));
    await widget.storage.set(SK_STORAGE, SK);
    const result = await loadMeta(1291546, SK);
    assert.equal(counts.cloud, 1);
    assert.equal(counts.basic, 1);
    assert.equal(result.title, "肖申克的救赎");
    assert.equal(await widget.storage.get(SK_STORAGE), SK);
  });
}

test("cloud meta HTTP reject falls back to basic", async () => {
  const { counts } = install(async () => {
    throw new Error("network");
  });
  const result = await loadMeta(1291546, SK);
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
  assert.equal(result.title, "肖申克的救赎");
});

test("cloud and basic meta failure rejects to the host", async () => {
  const counts = { cloud: 0, basic: 0 };
  const widget = hostFixture();
  widget.http.get = async (url) => {
    if (new URL(url).hostname === "douban-bridge-api.baran.wang") {
      counts.cloud += 1;
      throw new Error("network");
    }
    counts.basic += 1;
    throw new Error("douban down");
  };
  globalThis.Widget = widget;
  await assert.rejects(() => loadMeta(1291546, SK));
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
});

test("page 1 maps to skip 0 and page 2 maps to skip 20", async () => {
  const skips: string[] = [];
  const { widget } = install(async (url) => {
    skips.push(new URL(url).searchParams.get("skip") ?? "");
    return { statusCode: 200, data: { items: [] } };
  });
  globalThis.Widget = widget;
  await loadDefaultCatalog({ collectionId: "movie_top250", page: 1, sk: SK });
  await loadDefaultCatalog({ collectionId: "movie_top250", page: "2", sk: SK });
  assert.deepEqual(skips, ["0", "20"]);
});

test("offset is used directly as skip", async () => {
  let skip = "";
  const { widget } = install(async (url) => {
    skip = new URL(url).searchParams.get("skip") ?? "";
    return { statusCode: 200, data: { items: [] } };
  });
  globalThis.Widget = widget;
  await loadDefaultCatalog({ collectionId: "movie_top250", page: 3, offset: 7, sk: SK });
  assert.equal(skip, "7");
});

test("invalid page throws before any request", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: { items: [] } }));
  await assert.rejects(() => loadDefaultCatalog({ collectionId: "movie_top250", page: 0, sk: SK }), /Invalid page/);
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 0);
});

test("storing sk and clearing params updates douban.bridge.sk", async () => {
  const { widget } = install(async () => ({ statusCode: 200, data: { items: [] } }));
  await loadDefaultCatalog({ collectionId: "movie_top250", sk: ` ${SK} ` });
  assert.equal(await widget.storage.get(SK_STORAGE), SK);
  await loadDefaultCatalog({ collectionId: "movie_top250", sk: "" });
  assert.equal(await widget.storage.get(SK_STORAGE), null);
});

test("clearing sk uses basic only on the same call", async () => {
  const { widget, counts } = install(async () => {
    throw new Error("cloud should not be called");
  });
  await widget.storage.set(SK_STORAGE, SK);
  await loadDefaultCatalog({ collectionId: "movie_top250", sk: "" });
  assert.equal(await widget.storage.get(SK_STORAGE), null);
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 1);
});

test("detail links never include sk and loadDetail uses stored sk", async () => {
  const { widget, counts } = install(async (url, options) => {
    if (url.includes("/v1/catalog/")) return { statusCode: 200, data: { items: [CLOUD_ITEM] } };
    assert.equal(url, "https://douban-bridge-api.baran.wang/v1/meta/1291546");
    assert.equal(new URL(url).search, "");
    assert.equal(options?.headers?.Authorization, `Bearer ${SK}`);
    return { statusCode: 200, data: { item: CLOUD_DETAIL } };
  });
  const [item] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal(item.link, "https://douban-bridge-api.baran.wang/v1/meta/1291546");
  assert.equal(item.link.includes("sk"), false);
  assert.equal(item.id, "278");
  assert.equal(item.type, "tmdb");
  assert.equal(item.posterPath, "https://cdn.example.com/poster.jpg");
  assert.equal(item.rating, "9.7");
  assert.equal(item.releaseDate, "1994");
  const detail = await loadDetail(item.link);
  assert.equal(detail.title, "云端标题");
  assert.equal(counts.cloud, 2);
  assert.equal(counts.basic, 0);
  assert.equal(await widget.storage.get(SK_STORAGE), SK);
});

test("toHostItem uses imdb then douban when tmdb is missing", async () => {
  const { widget } = install(async () => ({
    statusCode: 200,
    data: { items: [{ ...CLOUD_ITEM, tmdbId: null }] },
  }));
  globalThis.Widget = widget;
  const [imdb] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal(imdb.id, "tt0111161");
  assert.equal(imdb.type, "imdb");

  widget.http.get = async () => ({
    statusCode: 200,
    data: { items: [{ ...CLOUD_ITEM, tmdbId: null, imdbId: null }] },
  });
  const [douban] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal(douban.id, "1291546");
  assert.equal(douban.type, "douban");
});

test("WidgetMetadata exposes 13 defaults plus genre and yearly modules", () => {
  assert.equal(WidgetMetadata.version, "0.1.0");
  assert.equal(WidgetMetadata.requiredVersion, "0.0.1");
  assert.equal(WidgetMetadata.detailCacheDuration, 0);
  assert.equal(DEFAULT_COLLECTION_IDS.length, 13);
  for (const id of DEFAULT_COLLECTION_IDS) {
    const module = WidgetMetadata.modules.find((item: { id: string }) => item.id === id);
    assert.ok(module, id);
    assert.equal(module.functionName, "loadDefaultCatalog");
    assert.equal(module.cacheDuration, 0);
    assert.equal(module.params.find((param: { name: string }) => param.name === "collectionId")?.value, id);
    assert.equal(module.params.find((param: { name: string }) => param.name === "page")?.type, "page");
  }
  const movieGenre = WidgetMetadata.modules.find((item: { id: string }) => item.id === "movie_genre");
  const tvGenre = WidgetMetadata.modules.find((item: { id: string }) => item.id === "tv_genre");
  assert.equal(movieGenre.functionName, "loadGenreCatalog");
  assert.equal(tvGenre.functionName, "loadGenreCatalog");
  assert.equal(movieGenre.cacheDuration, 0);
  const movieGenreIds = movieGenre.params
    .find((param: { name: string }) => param.name === "collectionId")
    .enumOptions.map((option: { value: string }) => option.value);
  const tvGenreIds = tvGenre.params
    .find((param: { name: string }) => param.name === "collectionId")
    .enumOptions.map((option: { value: string }) => option.value);
  assert.deepEqual(
    movieGenreIds,
    MOVIE_GENRE_CONFIGS.map((item) => item.id),
  );
  assert.deepEqual(
    tvGenreIds,
    TV_GENRE_CONFIGS.map((item) => item.id),
  );
  assert.equal(
    movieGenre.params.find((param: { name: string }) => param.name === "genre")?.description,
    "填写该榜单已有的筛选名称",
  );
  const movieYearly = WidgetMetadata.modules.find((item: { id: string }) => item.id === "movie_yearly");
  const tvYearly = WidgetMetadata.modules.find((item: { id: string }) => item.id === "tv_yearly");
  assert.equal(movieYearly.functionName, "loadYearlyCatalog");
  assert.equal(tvYearly.functionName, "loadYearlyCatalog");
  const movieYearValues = movieYearly.params
    .find((param: { name: string }) => param.name === "collectionId")
    .enumOptions.map((option: { title: string; value: string }) => option.value);
  const tvYearValues = tvYearly.params
    .find((param: { name: string }) => param.name === "collectionId")
    .enumOptions.map((option: { title: string; value: string }) => option.value);
  assert.equal(
    movieYearly.params.find((param: { name: string }) => param.name === "collectionId")?.required,
    undefined,
  );
  assert.ok(movieYearValues.includes(MOVIE_YEARLY_RANKING_ID));
  assert.ok(tvYearValues.includes(TV_YEARLY_RANKING_ID));
  for (const item of YEARLY_RANKINGS[MOVIE_YEARLY_RANKING_ID]) assert.ok(movieYearValues.includes(item.id));
  for (const item of YEARLY_RANKINGS[TV_YEARLY_RANKING_ID]) assert.ok(tvYearValues.includes(item.id));
  assert.equal(
    movieYearly.params.find((param: { name: string }) => param.name === "collectionId").enumOptions[0].title,
    "最新年度",
  );
});
