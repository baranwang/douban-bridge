import {
  COLLECTION_CONFIGS,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
  YEARLY_RANKINGS,
} from "@douban-bridge/contracts/collections";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { loadCatalog, loadSearch as loadCloudSearch } from "../src/cloud";
import { clearDynamicOptionsCache } from "../src/dynamic-options";
import "../src/index";

const DEFAULT_CATALOG_IDS = COLLECTION_CONFIGS.filter((item) => !item.hasGenre).map((item) => item.id);

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

const SEARCH_SOURCE = {
  items: [
    {
      layout: "subject",
      target_type: "movie",
      target: { id: "1291546", title: "肖申克的救赎", year: "1994", cover_url: "https://img1.doubanio.com/test.jpg" },
    },
    {
      layout: "subject",
      target_type: "book",
      target: { id: "1001", title: "一本书" },
    },
  ],
  total: 2,
};

const SK = "sk_test";

function install(
  handler: (
    url: string,
    options?: { headers?: Record<string, string> },
  ) => Promise<{ statusCode: number; data: unknown }>,
) {
  const counts = { cloud: 0, basic: 0 };
  rs.spyOn(Widget.http, "get").mockImplementation(async (url, options) => {
    const host = new URL(url).hostname;
    if (host === "douban-bridge.baran.wang") {
      counts.cloud += 1;
      const response = await handler(url, options);
      return { ...response, headers: {} } as never;
    }
    counts.basic += 1;
    return { statusCode: 200, data: DOUBAN_SOURCE, headers: {} } as never;
  });
  rs.spyOn(Widget.tmdb, "get").mockImplementation(async () => {
    throw new Error("tmdb");
  });
  return { counts };
}

describe("cloud mode, fallback, and metadata", () => {
  beforeEach(() => {
    clearDynamicOptionsCache();
    Widget.storage.clear();
  });

  afterEach(() => {
    rs.restoreAllMocks();
    clearDynamicOptionsCache();
    Widget.storage.clear();
  });

  test("metadata translates broad labels to English", () => {
    expect(WidgetMetadata.search?.id).toBe("search");
    expect(WidgetMetadata.search?.functionName).toBe("loadSearch");
    expect(WidgetMetadata.search?.title).toBe("搜索");
    expect(typeof loadSearch).toBe("function");
    expect(WidgetMetadata.description).not.toBe("todo");
    expect(WidgetMetadata.id).toBe("douban.bridge");
    expect(WidgetMetadata.iconurl).toBe("https://fastly.jsdelivr.net/gh/baranwang/douban-bridge@main/icon.png");
    expect(Object.keys(WidgetMetadata.i18n?.en ?? {}).sort()).toEqual(
      [
        "分类",
        "密钥",
        "搜索",
        "搜索关键词",
        "年度",
        "页码",
        "榜单",
        "最新年度",
        "类型",
        "电影",
        "剧集",
        "豆瓣年度评分最高剧集",
        "豆瓣年度评分最高电影",
        "豆瓣精选榜单",
        "豆瓣榜单",
        "豆瓣电影、剧集排行榜",
        "剧集类型榜",
        "电影类型榜",
        "自定义标签",
      ].sort(),
    );
    expect(WidgetMetadata.i18n?.en?.电影类型榜).toBe("Movies by Genre");
    expect(WidgetMetadata.i18n?.en?.豆瓣年度评分最高电影).toBe("Douban's Top-Rated Movies by Year");
    expect(WidgetMetadata.i18n?.en?.豆瓣精选榜单).toBe("Douban Featured Charts");
    expect(WidgetMetadata.i18n?.en?.自定义标签).toBe("Custom Tag");
  });

  test("valid empty cloud page never calls local sources", async () => {
    let calls = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      calls += 1;
      expect(new URL(url).hostname).toBe("douban-bridge.baran.wang");
      return { statusCode: 200, data: { items: [] }, headers: {} } as never;
    });
    await expect(loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK)).resolves.toEqual([]);
    expect(calls).toBe(1);
  });

  test("cloud catalog works without a global URL constructor", async () => {
    const originalURL = globalThis.URL;
    let requested = "";
    let authorization = "";
    rs.spyOn(Widget.http, "get").mockImplementation(async (url, options) => {
      requested = url;
      authorization = options?.headers?.Authorization ?? "";
      return { statusCode: 200, data: { items: [CLOUD_ITEM] }, headers: {} } as never;
    });
    Reflect.set(globalThis, "URL", undefined);
    try {
      const result = await loadCatalog({ collectionId: "movie_top250", skip: 20 }, SK);
      expect(requested).toBe("https://douban-bridge.baran.wang/v1/catalog/movie_top250?skip=20");
      expect(authorization).toBe(`Bearer ${SK}`);
      expect(result[0]?.title).toBe("云端标题");
    } finally {
      Reflect.set(globalThis, "URL", originalURL);
    }
  });

  test("empty sk uses basic catalog only", async () => {
    const { counts } = install(async () => {
      throw new Error("cloud should not be called");
    });
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, "");
    expect(counts.cloud).toBe(0);
    expect(counts.basic).toBe(1);
    expect(result[0]?.id).toBe("1291546");
    expect(result[0]?.type).toBe("douban");
    expect(result[0]?.title).toBe("肖申克的救赎");
    expect("description" in (result[0] ?? {})).toBe(false);
  });

  test("complete cloud catalog never calls basic and keeps original images", async () => {
    const { counts } = install(async (url, options) => {
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/v1/catalog/movie_top250");
      expect(parsed.searchParams.get("skip")).toBe("0");
      expect(options?.headers?.Authorization).toBe(`Bearer ${SK}`);
      return { statusCode: 200, data: { items: [CLOUD_ITEM] } };
    });
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(0);
    expect(result[0]?.title).toBe("云端标题");
    expect(result[0]?.posterPath).toBe("https://cdn.example.com/poster.jpg");
    expect(result[0]?.id).toBe("278");
    expect("description" in (result[0] ?? {})).toBe(false);
  });

  test("cloud item with null tmdbId stays on the cloud item", async () => {
    const { counts } = install(async () => ({
      statusCode: 200,
      data: { items: [{ ...CLOUD_ITEM, tmdbId: null, imdbId: null }] },
    }));
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(0);
    expect(result[0]?.id).toBe("1291546");
    expect(result[0]?.type).toBe("douban");
    expect(result[0]?.posterPath).toBe("https://cdn.example.com/poster.jpg");
  });

  test("missing items falls back to basic", async () => {
    const { counts } = install(async () => ({ statusCode: 200, data: {} }));
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(1);
    expect(result[0]?.title).toBe("肖申克的救赎");
  });

  test("illegal cloud item falls back to basic", async () => {
    const { counts } = install(async () => ({
      statusCode: 200,
      data: { items: [{ doubanId: 1 }] },
    }));
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(1);
    expect(result[0]?.title).toBe("肖申克的救赎");
  });

  for (const statusCode of [401, 403, 404, 429, 500]) {
    test(`cloud ${statusCode} falls back to basic`, async () => {
      const { counts } = install(async () => ({ statusCode, data: null }));
      const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
      expect(counts.cloud).toBe(1);
      expect(counts.basic).toBe(1);
      expect(result[0]?.title).toBe("肖申克的救赎");
    });
  }

  test("cloud HTTP reject falls back to basic", async () => {
    const { counts } = install(async () => {
      throw new Error("network");
    });
    const result = await loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK);
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(1);
    expect(result[0]?.title).toBe("肖申克的救赎");
  });

  test("cloud and basic catalog failure rejects to the host", async () => {
    const counts = { cloud: 0, basic: 0 };
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      if (new URL(url).hostname === "douban-bridge.baran.wang") {
        counts.cloud += 1;
        return { statusCode: 500, data: null, headers: {} } as never;
      }
      counts.basic += 1;
      throw new Error("douban down");
    });
    await expect(loadCatalog({ collectionId: "movie_top250", skip: 0 }, SK)).rejects.toThrow("Douban request failed");
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(1);
  });

  test("page maps to skip", async () => {
    const skips: string[] = [];
    install(async (url) => {
      skips.push(new URL(url).searchParams.get("skip") ?? "");
      return { statusCode: 200, data: { items: [] } };
    });
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "2", sk: SK, userId: "" });
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "3", sk: SK, userId: "" });
    expect(skips).toEqual(["0", "20", "40"]);
  });

  test("yearly catalog uses subCollectionId when selected and falls back to latest yearly id", async () => {
    let requested = "";
    install(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [] } };
    });
    await loadYearlyCatalog({
      collectionId: "ECE472UNY",
      subCollectionId: "ECB5AE5EQ",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(new URL(requested).pathname).toBe("/v1/catalog/ECB5AE5EQ");

    await loadYearlyCatalog({
      collectionId: MOVIE_YEARLY_RANKING_ID,
      subCollectionId: "ECB5AE5EQ",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(new URL(requested).pathname).toBe("/v1/catalog/ECB5AE5EQ");

    await loadYearlyCatalog({
      collectionId: MOVIE_YEARLY_RANKING_ID,
      subCollectionId: "",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(new URL(requested).pathname).toBe("/v1/catalog/ECE472UNY");
  });

  test("genre catalog uses subCollectionId when selected and falls back to collectionId", async () => {
    let requested = "";
    install(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [] } };
    });
    await loadGenreCatalog({
      collectionId: "movie_love",
      subCollectionId: "ECOIOTUGY",
      page: "1",
      sk: SK,
      userId: "",
    });
    const url = new URL(requested);
    expect(url.pathname).toBe("/v1/catalog/ECOIOTUGY");
    expect(url.searchParams.has("genre")).toBe(false);

    await loadGenreCatalog({
      collectionId: "movie_love",
      subCollectionId: "",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(new URL(requested).pathname).toBe("/v1/catalog/movie_love");
  });

  test("invalid page throws before any request", async () => {
    const { counts } = install(async () => ({ statusCode: 200, data: { items: [] } }));
    await expect(loadDefaultCatalog({ collectionId: "movie_top250", page: "0", sk: SK, userId: "" })).rejects.toThrow(
      "Invalid page",
    );
    expect(counts.cloud).toBe(0);
    expect(counts.basic).toBe(0);
  });

  test("catalog sk comes only from current params", async () => {
    const { counts } = install(async (_url, options) => {
      expect(options?.headers?.Authorization).toBe(`Bearer ${SK}`);
      return { statusCode: 200, data: { items: [] } };
    });
    const unexpectedStorage = () => {
      throw new Error("storage should not be used");
    };
    rs.spyOn(Widget.storage, "get").mockImplementation(unexpectedStorage);
    rs.spyOn(Widget.storage, "set").mockImplementation(unexpectedStorage);
    rs.spyOn(Widget.storage, "remove").mockImplementation(unexpectedStorage);
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: ` ${SK} `, userId: "" });
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(0);
  });

  test("catalog userId is sent as X-User-Id and not required", async () => {
    let headers: Record<string, string> | undefined;
    const { counts } = install(async (_url, options) => {
      headers = options?.headers;
      return { statusCode: 200, data: { items: [] } };
    });
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: " user-1 " });
    expect(headers?.Authorization).toBe(`Bearer ${SK}`);
    expect(headers?.["X-User-Id"]).toBe("user-1");
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect(headers?.Authorization).toBe(`Bearer ${SK}`);
    expect(headers?.["X-User-Id"]).toBeUndefined();
    expect(counts.cloud).toBe(2);
    expect(counts.basic).toBe(0);
  });

  test("empty sk uses basic only", async () => {
    const { counts } = install(async () => {
      throw new Error("cloud should not be called");
    });
    await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: "", userId: "" });
    expect(counts.cloud).toBe(0);
    expect(counts.basic).toBe(1);
  });

  test("TMDB catalog ids use the tmdb id", async () => {
    const { counts } = install(async () => ({ statusCode: 200, data: { items: [CLOUD_ITEM] } }));
    const [item] = await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect("link" in item).toBe(false);
    expect(item.id).toBe("278");
    expect(item.type).toBe("tmdb");
    expect(item.posterPath).toBe("https://cdn.example.com/poster.jpg");
    expect(item.rating).toBe("9.7");
    expect(item.releaseDate).toBe("1994");
    expect(counts.cloud).toBe(1);
    expect(counts.basic).toBe(0);
  });

  test("catalog items omit description and keep host image paths", async () => {
    install(async () => ({ statusCode: 200, data: { items: [CLOUD_ITEM] } }));
    const [item] = await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect("description" in item).toBe(false);
    expect(item.posterPath).toBe("https://cdn.example.com/poster.jpg");
  });

  test("catalog genreTitle comes from genres not description", async () => {
    install(async () => ({
      statusCode: 200,
      data: {
        items: [
          {
            ...CLOUD_ITEM,
            description: "一场警察与特务的较量，却展开满是烟火与温情的百姓人生。",
            genres: ["剧情", "喜剧"],
          },
        ],
      },
    }));
    const [item] = await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect(item.genreTitle).toBe("剧情, 喜剧");
    expect("description" in item).toBe(false);
  });

  test("catalog items keep imdb then douban ids", async () => {
    install(async () => ({
      statusCode: 200,
      data: { items: [{ ...CLOUD_ITEM, tmdbId: null }] },
    }));
    const [imdb] = await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect(imdb.id).toBe("tt0111161");
    expect(imdb.type).toBe("imdb");

    rs.spyOn(Widget.http, "get").mockResolvedValue({
      statusCode: 200,
      data: { items: [{ ...CLOUD_ITEM, tmdbId: null, imdbId: null }] },
      headers: {},
    } as never);
    const [douban] = await loadDefaultCatalog({ collectionId: "movie_top250", page: "1", sk: SK, userId: "" });
    expect(douban.id).toBe("1291546");
    expect(douban.type).toBe("douban");
  });

  test("WidgetMetadata exposes Stremio catalog order plus dynamicOptions modules", () => {
    expect(WidgetMetadata.requiredVersion).toBe("0.0.6");
    expect(
      WidgetMetadata.modules.filter((item) => item.functionName === "loadDefaultCatalog").map((item) => item.id),
    ).toEqual(DEFAULT_CATALOG_IDS);
    expect(DEFAULT_CATALOG_IDS).toContain("tv_american");
    expect(DEFAULT_CATALOG_IDS).toContain("tv_documentary");

    for (const id of DEFAULT_CATALOG_IDS) {
      const mod = WidgetMetadata.modules.find((item) => item.id === id);
      expect(mod).toBeDefined();
      expect(mod?.functionName).toBe("loadDefaultCatalog");
      expect(mod?.cacheDuration).toBeUndefined();
      expect(mod?.params?.find((param) => param.name === "collectionId")?.value).toBe(id);
      expect(mod?.params?.find((param) => param.name === "page")?.type).toBe("page");
    }

    const movieGenre = WidgetMetadata.modules.find((item) => item.id === "movie_genre");
    const tvGenre = WidgetMetadata.modules.find((item) => item.id === "tv_genre");
    expect(movieGenre?.functionName).toBe("loadGenreCatalog");
    expect(tvGenre?.functionName).toBe("loadGenreCatalog");
    expect(movieGenre?.cacheDuration).toBeUndefined();
    expect(
      movieGenre?.params?.find((param) => param.name === "collectionId")?.enumOptions?.map((option) => option.value),
    ).toEqual(MOVIE_GENRE_CONFIGS.map((item) => item.id));
    expect(
      tvGenre?.params?.find((param) => param.name === "collectionId")?.enumOptions?.map((option) => option.value),
    ).toEqual(TV_GENRE_CONFIGS.map((item) => item.id));

    for (const mod of [movieGenre, tvGenre]) {
      const subParam = mod?.params?.find((param) => param.name === "subCollectionId");
      expect(subParam).toEqual({
        name: "subCollectionId",
        title: "分类",
        type: "enumeration",
        dynamicOptions: {
          functionName: "loadSubCollections",
          dependsOn: ["collectionId"],
        },
      });
      expect(mod?.params?.some((param) => param.name.startsWith("subCollectionId_"))).toBe(false);
    }

    const movieYearly = WidgetMetadata.modules.find((item) => item.id === "movie_yearly");
    const tvYearly = WidgetMetadata.modules.find((item) => item.id === "tv_yearly");
    expect(movieYearly?.functionName).toBe("loadYearlyCatalog");
    expect(tvYearly?.functionName).toBe("loadYearlyCatalog");

    const movieYearOptions = movieYearly?.params?.find((param) => param.name === "collectionId")?.enumOptions ?? [];
    const tvYearOptions = tvYearly?.params?.find((param) => param.name === "collectionId")?.enumOptions ?? [];
    expect(movieYearOptions[0]).toEqual({ title: "最新年度", value: MOVIE_YEARLY_RANKING_ID });
    expect(tvYearOptions[0]).toEqual({ title: "最新年度", value: TV_YEARLY_RANKING_ID });
    expect(movieYearOptions.map((option) => option.value)).toEqual([
      MOVIE_YEARLY_RANKING_ID,
      ...YEARLY_RANKINGS[MOVIE_YEARLY_RANKING_ID].map((item) => item.id),
    ]);
    expect(tvYearOptions.map((option) => option.value)).toEqual([
      TV_YEARLY_RANKING_ID,
      ...YEARLY_RANKINGS[TV_YEARLY_RANKING_ID].map((item) => item.id),
    ]);

    for (const mod of [movieYearly, tvYearly]) {
      expect(mod?.params?.find((param) => param.name === "subCollectionId")?.dynamicOptions).toEqual({
        functionName: "loadSubCollections",
        dependsOn: ["collectionId"],
      });
      expect(mod?.params?.some((param) => param.name.startsWith("subCollectionId_"))).toBe(false);
    }

    const selected = WidgetMetadata.modules.find((item) => item.id === "selected_collections");
    expect(selected?.title).toBe("豆瓣精选榜单");
    expect(selected?.functionName).toBe("loadSelectedCatalog");
    expect(selected?.params?.find((param) => param.name === "type")).toEqual({
      name: "type",
      title: "类型",
      type: "enumeration",
      value: "movie",
      enumOptions: [
        { title: "电影", value: "movie" },
        { title: "剧集", value: "tv" },
      ],
    });
    expect(selected?.params?.find((param) => param.name === "collectionId")).toEqual({
      name: "collectionId",
      title: "榜单",
      type: "enumeration",
      dynamicOptions: {
        functionName: "loadSelectedCollections",
        dependsOn: ["type"],
      },
    });

    const tvRecommend = WidgetMetadata.modules.find((item) => item.id === "tv_recommend");
    expect(tvRecommend?.params?.some((param) => param.name === "tv_genre" || param.name === "variety_genre")).toBe(
      false,
    );
    expect(tvRecommend?.params?.find((param) => param.name === "subGenre")).toEqual({
      name: "subGenre",
      title: "分类",
      type: "enumeration",
      belongTo: { paramName: "genre", value: ["电视剧", "综艺"] },
      dynamicOptions: {
        functionName: "loadTvRecommendSubGenres",
        dependsOn: ["genre"],
      },
    });
  });

  test("cloud search matches Douban ids through POST /v1/items", async () => {
    const posts: Array<{ url: string; body: unknown; headers?: Record<string, string> }> = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      expect(url).toContain("frodo.douban.com/api/v2/search/weixin");
      return { statusCode: 200, data: SEARCH_SOURCE, headers: {} } as never;
    });
    rs.spyOn(Widget.http, "post").mockImplementation(async (url, body, options) => {
      posts.push({ url, body, headers: options?.headers });
      return { statusCode: 200, data: { items: [CLOUD_ITEM] }, headers: {} } as never;
    });
    const result = await loadCloudSearch("肖申克", SK, "user-1");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe("https://douban-bridge.baran.wang/v1/items");
    expect(posts[0]?.body).toEqual({ ids: [1291546] });
    expect(posts[0]?.headers?.Authorization).toBe(`Bearer ${SK}`);
    expect(posts[0]?.headers?.["X-User-Id"]).toBe("user-1");
    expect(result[0]?.id).toBe("278");
    expect(result[0]?.title).toBe("云端标题");
  });

  test("search without sk stays on Douban and never posts items", async () => {
    let posted = 0;
    rs.spyOn(Widget.http, "get").mockResolvedValue({ statusCode: 200, data: SEARCH_SOURCE, headers: {} } as never);
    rs.spyOn(Widget.http, "post").mockImplementation(async () => {
      posted += 1;
      throw new Error("cloud should not be called");
    });
    rs.spyOn(Widget.tmdb, "get").mockRejectedValue(new Error("tmdb"));
    const result = await loadCloudSearch("肖申克", "");
    expect(posted).toBe(0);
    expect(result[0]?.id).toBe("1291546");
    expect(result[0]?.type).toBe("douban");
  });

  test("partial cloud matching keeps unmatched search hits", async () => {
    const extra = {
      layout: "subject",
      target_type: "movie",
      target: { id: "1292064", title: "阿甘正传", year: "1994", cover_url: "https://img1.doubanio.com/forrest.jpg" },
    };
    rs.spyOn(Widget.http, "get").mockResolvedValue({
      statusCode: 200,
      data: { items: [...SEARCH_SOURCE.items, extra], total: 3 },
      headers: {},
    } as never);
    rs.spyOn(Widget.http, "post").mockResolvedValue({
      statusCode: 200,
      data: { items: [CLOUD_ITEM] },
      headers: {},
    } as never);
    rs.spyOn(Widget.tmdb, "get").mockResolvedValue({ results: [] } as never);
    const result = await loadCloudSearch("肖申克", SK);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("278");
    expect(result[0]?.title).toBe("云端标题");
    expect(result[1]?.id).toBe("1292064");
    expect(result[1]?.type).toBe("douban");
    expect(result[1]?.title).toBe("阿甘正传");
  });

  test("failed item matching keeps the Douban search result", async () => {
    rs.spyOn(Widget.http, "get").mockResolvedValue({ statusCode: 200, data: SEARCH_SOURCE, headers: {} } as never);
    rs.spyOn(Widget.http, "post").mockResolvedValue({ statusCode: 500, data: null, headers: {} } as never);
    rs.spyOn(Widget.tmdb, "get").mockRejectedValue(new Error("tmdb"));
    const result = await loadCloudSearch("肖申克", SK);
    expect(result[0]?.id).toBe("1291546");
    expect(result[0]?.type).toBe("douban");
  });

  test("tv recommend joins tags except sort and posts matched ids", async () => {
    let requested = "";
    const posts: Array<{ url: string; body: unknown; headers?: Record<string, string> }> = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      expect(url).toContain("frodo.douban.com/api/v2/tv/recommend");
      return {
        statusCode: 200,
        data: {
          items: [
            {
              id: "37822829",
              type: "tv",
              title: "开庭",
              year: "2026",
              pic: { large: "https://img.example/tv.jpg" },
              comment: { comment: "TVB" },
            },
          ],
          total: 1,
        },
        headers: {},
      } as never;
    });
    rs.spyOn(Widget.http, "post").mockImplementation(async (url, body, options) => {
      posts.push({ url, body, headers: options?.headers });
      return {
        statusCode: 200,
        data: {
          items: [
            {
              ...CLOUD_ITEM,
              doubanId: 37822829,
              mediaType: "tv",
              title: "开庭",
              tmdbId: 1396,
            },
          ],
        },
        headers: {},
      } as never;
    });
    const result = await loadTvRecommendCatalog({
      genre: "电视剧",
      subGenre: "喜剧",
      region: "香港",
      year: "2020年代",
      sort: "U",
      tag: "",
      page: "2",
      sk: SK,
      userId: "user-1",
    });
    const url = new URL(requested);
    expect(url.pathname).toBe("/api/v2/tv/recommend");
    expect(url.searchParams.get("tags")).toBe("喜剧,香港,2020年代");
    expect(url.searchParams.get("sort")).toBe("U");
    expect(url.searchParams.get("start")).toBe("20");
    expect(posts[0]?.url).toBe("https://douban-bridge.baran.wang/v1/items");
    expect(posts[0]?.body).toEqual({ ids: [37822829] });
    expect(posts[0]?.headers?.Authorization).toBe(`Bearer ${SK}`);
    expect(posts[0]?.headers?.["X-User-Id"]).toBe("user-1");
    expect(result[0]?.id).toBe("1396");
    expect(result[0]?.title).toBe("开庭");
  });

  test("tv recommend keeps genre when subGenre is empty", async () => {
    let requested = "";
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [], total: 0 }, headers: {} } as never;
    });
    await loadTvRecommendCatalog({
      genre: "电视剧",
      subGenre: "",
      region: "香港",
      year: "",
      sort: "T",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(new URL(requested).searchParams.get("tags")).toBe("电视剧,香港");
  });

  test("recommend modules expose a custom tag input", () => {
    for (const id of ["movie_recommend", "tv_recommend"]) {
      const mod = WidgetMetadata.modules.find((item) => item.id === id);
      const tag = mod?.params?.find((param) => param.name === "tag");
      expect(tag?.title).toBe("自定义标签");
      expect(tag?.type).toBe("input");
    }
  });

  test("movie recommend appends a custom tag after selected filters", async () => {
    let requested = "";
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [], total: 0 }, headers: {} } as never;
    });
    await loadMovieRecommendCatalog({
      genre: "喜剧",
      region: "香港",
      year: "",
      sort: "T",
      tag: " 王家卫 ",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(new URL(requested).searchParams.get("tags")).toBe("喜剧,香港,王家卫");
  });

  test("movie recommend splits custom tags on Chinese and ASCII commas", async () => {
    let requested = "";
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [], total: 0 }, headers: {} } as never;
    });
    await loadMovieRecommendCatalog({
      genre: "喜剧",
      region: "",
      year: "",
      sort: "T",
      tag: "王家卫，香港, 文艺",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(new URL(requested).searchParams.get("tags")).toBe("喜剧,王家卫,香港,文艺");
  });

  test("tv recommend appends a custom tag and skips blanks", async () => {
    let requested = "";
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      return { statusCode: 200, data: { items: [], total: 0 }, headers: {} } as never;
    });
    await loadTvRecommendCatalog({
      genre: "电视剧",
      subGenre: "",
      region: "香港",
      year: "2020年代",
      sort: "T",
      tag: "   ",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(new URL(requested).searchParams.get("tags")).toBe("电视剧,香港,2020年代");
  });

  test("movie recommend skips empty tags and stays on Douban without sk", async () => {
    let requested = "";
    let posted = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested = url;
      return {
        statusCode: 200,
        data: {
          items: [
            {
              id: "26752088",
              type: "movie",
              title: "我不是药神",
              year: "2018",
              pic: { large: "https://img.example/a.jpg" },
            },
          ],
          total: 1,
        },
        headers: {},
      } as never;
    });
    rs.spyOn(Widget.http, "post").mockImplementation(async () => {
      posted += 1;
      throw new Error("cloud should not be called");
    });
    rs.spyOn(Widget.tmdb, "get").mockResolvedValue({ results: [] } as never);
    const result = await loadMovieRecommendCatalog({
      genre: "喜剧",
      region: "",
      year: "",
      sort: "T",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    const url = new URL(requested);
    expect(url.pathname).toBe("/api/v2/movie/recommend");
    expect(url.searchParams.get("tags")).toBe("喜剧");
    expect(url.searchParams.get("sort")).toBe("T");
    expect(posted).toBe(0);
    expect(result[0]?.id).toBe("26752088");
    expect(result[0]?.type).toBe("douban");
  });
});
