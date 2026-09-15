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

const runtimeWidget = {
  http: { get: async () => ({ statusCode: 200, data: {}, headers: {} }) },
  tmdb: { get: async () => ({}) },
  storage: {
    get: async () => null,
    set: async () => {},
    remove: async () => {},
  },
} as TestWidget;
globalThis.Widget = runtimeWidget;
Object.assign(globalThis, {
  WidgetMetadata: undefined,
  loadDefaultCatalog: undefined,
  loadGenreCatalog: undefined,
  loadYearlyCatalog: undefined,
});
const { loadCatalog } = await import("../src/cloud");
await import("../src/index");

test("metadata translates broad labels to English", () => {
  const metadata = Reflect.get(globalThis, "WidgetMetadata") as {
    description?: string;
    i18n?: { en?: Record<string, string> };
    modules: unknown[];
  };
  assert.notEqual(metadata.description, "todo");
  assert.equal(WidgetMetadata.id, "douban.bridge");
  assert.equal(WidgetMetadata.iconurl, "https://fastly.jsdelivr.net/gh/baranwang/douban-bridge@main/icon.png");
  assert.deepEqual(
    Object.keys(metadata.i18n?.en ?? {}).sort(),
    [
      "分类",
      "密钥",
      "年度",
      "页码",
      "榜单",
      "最新年度",
      "豆瓣年度评分最高剧集",
      "豆瓣年度评分最高电影",
      "豆瓣榜单",
      "豆瓣电影、剧集排行榜",
      "剧集类型榜",
      "电影类型榜",
    ].sort(),
  );
  assert.equal(metadata.i18n?.en?.电影类型榜, "Movies by Genre");
  assert.equal(metadata.i18n?.en?.豆瓣年度评分最高电影, "Douban's Top-Rated Movies by Year");
});

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

const SK = "sk_test";

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
    if (host === "douban-bridge.baran.wang") {
      counts.cloud += 1;
      return handler(url, options).then((response) => ({ ...response, headers: {} }));
    }
    counts.basic += 1;
    return { statusCode: 200, data: DOUBAN_SOURCE, headers: {} };
  };
  runtimeWidget.http.get = widget.http.get;
  runtimeWidget.tmdb = widget.tmdb;
  runtimeWidget.storage = widget.storage;
  return { widget: runtimeWidget, counts };
}

test("valid empty cloud page never calls local sources", async () => {
  let calls = 0;
  runtimeWidget.http.get = async (url) => {
    calls += 1;
    assert.equal(new URL(url).hostname, "douban-bridge.baran.wang");
    return { statusCode: 200, data: { items: [] }, headers: {} };
  };
  assert.deepEqual(await loadCatalog({ collectionId: "movie_top250", skip: 0 }, "sk_test"), []);
  assert.equal(calls, 1);
});

test("cloud catalog works without a global URL constructor", async () => {
  const originalURL = globalThis.URL;
  let requested = "";
  let authorization = "";
  runtimeWidget.http.get = async (url, options) => {
    requested = url;
    authorization = options?.headers?.Authorization ?? "";
    return { statusCode: 200, data: { items: [CLOUD_ITEM] }, headers: {} };
  };
  Reflect.set(globalThis, "URL", undefined);
  try {
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 20 }, SK);
    assert.equal(requested, "https://douban-bridge.baran.wang/v1/catalog/movie_top250?skip=20");
    assert.equal(authorization, `Bearer ${SK}`);
    assert.equal(result[0].title, "云端标题");
  } finally {
    Reflect.set(globalThis, "URL", originalURL);
  }
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
  test(`cloud ${statusCode} falls back to basic`, async () => {
    const { counts } = install(async () => ({ statusCode, data: null }));
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    assert.equal(counts.cloud, 1);
    assert.equal(counts.basic, 1);
    assert.equal(result[0].title, "肖申克的救赎");
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
    if (new URL(url).hostname === "douban-bridge.baran.wang") {
      counts.cloud += 1;
      return { statusCode: 500, data: null };
    }
    counts.basic += 1;
    throw new Error("douban down");
  };
  runtimeWidget.http.get = widget.http.get;
  await assert.rejects(() => loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK));
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 1);
});

test("page maps to skip", async () => {
  const skips: string[] = [];
  install(async (url) => {
    skips.push(new URL(url).searchParams.get("skip") ?? "");
    return { statusCode: 200, data: { items: [] } };
  });
  await loadDefaultCatalog({ collectionId: "movie_top250", page: 1, sk: SK });
  await loadDefaultCatalog({ collectionId: "movie_top250", page: "2", sk: SK });
  await loadDefaultCatalog({ collectionId: "movie_top250", page: 3, sk: SK });
  assert.deepEqual(skips, ["0", "20", "40"]);
});

test("genre catalog uses only the selected parent's subcollection id", async () => {
  let requested = "";
  install(async (url) => {
    requested = url;
    return { statusCode: 200, data: { items: [] } };
  });
  const load = Reflect.get(globalThis, "loadGenreCatalog") as (
    params: Record<string, string | number>,
  ) => Promise<VideoItem[]>;
  await load({
    collectionId: "movie_love",
    subCollectionId_movie_love: "ECOIOTUGY",
    subCollectionId_movie_comedy: "ECVUOUD7A",
    sk: SK,
  });
  const url = new URL(requested);
  assert.equal(url.pathname, "/v1/catalog/ECOIOTUGY");
  assert.equal(url.searchParams.has("genre"), false);
});

test("invalid page throws before any request", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: { items: [] } }));
  await assert.rejects(() => loadDefaultCatalog({ collectionId: "movie_top250", page: 0, sk: SK }), /Invalid page/);
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 0);
});

test("catalog sk comes only from current params", async () => {
  const { widget, counts } = install(async (_url, options) => {
    assert.equal(options?.headers?.Authorization, `Bearer ${SK}`);
    return { statusCode: 200, data: { items: [] } };
  });
  const unexpectedStorage = async () => {
    throw new Error("storage should not be used");
  };
  widget.storage = { get: unexpectedStorage, set: unexpectedStorage, remove: unexpectedStorage };
  await loadDefaultCatalog({ collectionId: "movie_top250", sk: ` ${SK} ` });
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
});

test("empty sk uses basic only", async () => {
  const { counts } = install(async () => {
    throw new Error("cloud should not be called");
  });
  await loadDefaultCatalog({ collectionId: "movie_top250", sk: "" });
  assert.equal(counts.cloud, 0);
  assert.equal(counts.basic, 1);
});

test("TMDB catalog ids include the media type", async () => {
  const { counts } = install(async () => ({ statusCode: 200, data: { items: [CLOUD_ITEM] } }));
  const [item] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal("link" in item, false);
  assert.equal(item.id, "movie.278");
  assert.equal(item.type, "tmdb");
  assert.equal(item.posterPath, "https://cdn.example.com/poster.jpg");
  assert.equal(item.rating, "9.7");
  assert.equal(item.releaseDate, "1994");
  assert.equal(counts.cloud, 1);
  assert.equal(counts.basic, 0);
});

test("toHostItem uses imdb then douban when tmdb is missing", async () => {
  const { widget } = install(async () => ({
    statusCode: 200,
    data: { items: [{ ...CLOUD_ITEM, tmdbId: null }] },
  }));
  const [imdb] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal(imdb.id, "tt0111161");
  assert.equal(imdb.type, "imdb");

  widget.http.get = async () => ({
    statusCode: 200,
    data: { items: [{ ...CLOUD_ITEM, tmdbId: null, imdbId: null }] },
    headers: {},
  });
  const [douban] = await loadDefaultCatalog({ collectionId: "movie_top250", sk: SK });
  assert.equal(douban.id, "1291546");
  assert.equal(douban.type, "douban");
});

test("WidgetMetadata exposes 13 defaults plus genre and yearly modules", () => {
  assert.equal(WidgetMetadata.requiredVersion, "0.0.1");
  assert.equal(DEFAULT_COLLECTION_IDS.length, 13);
  for (const id of DEFAULT_COLLECTION_IDS) {
    const module = WidgetMetadata.modules.find((item: { id: string }) => item.id === id);
    assert.ok(module, id);
    assert.equal(module.functionName, "loadDefaultCatalog");
    assert.equal(module.cacheDuration, undefined);
    assert.equal(module.params.find((param: { name: string }) => param.name === "collectionId")?.value, id);
    assert.equal(module.params.find((param: { name: string }) => param.name === "page")?.type, "page");
  }
  const movieGenre = WidgetMetadata.modules.find((item: { id: string }) => item.id === "movie_genre");
  const tvGenre = WidgetMetadata.modules.find((item: { id: string }) => item.id === "tv_genre");
  assert.equal(movieGenre.functionName, "loadGenreCatalog");
  assert.equal(tvGenre.functionName, "loadGenreCatalog");
  assert.equal(movieGenre.cacheDuration, undefined);
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
  const loveCategory = movieGenre.params.find((param: { name: string }) => param.name === "subCollectionId_movie_love");
  assert.equal(loveCategory.title, "分类");
  assert.equal(loveCategory.value, "movie_love");
  assert.deepEqual(loveCategory.belongTo, { paramName: "collectionId", value: ["movie_love"] });
  assert.deepEqual(loveCategory.enumOptions.slice(0, 3), [
    { title: "近期热门", value: "ECSAOJFTA" },
    { title: "高分经典", value: "movie_love" },
    { title: "华语", value: "ECOIOTUGY" },
  ]);
  assert.equal(
    movieGenre.params.some((param: { name: string }) => param.name === "genre"),
    false,
  );
  assert.equal(
    movieGenre.params.some((param: { name: string }) => param.name === "subCollectionId_film_genre_27"),
    false,
  );
  const mainlandCategory = tvGenre.params.find((param: { name: string }) => param.name === "subCollectionId_EC74443FY");
  assert.equal(mainlandCategory.title, "分类");
  assert.equal(mainlandCategory.value, "EC74443FY");
  assert.deepEqual(mainlandCategory.belongTo, { paramName: "collectionId", value: ["EC74443FY"] });
  assert.deepEqual(mainlandCategory.enumOptions.slice(0, 3), [
    { title: "近期热门", value: "EC74443FY" },
    { title: "高分经典", value: "ECT45KVZI" },
    { title: "喜剧", value: "ECVQ47BUI" },
  ]);
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
