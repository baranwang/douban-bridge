import { MOVIE_YEARLY_RANKING_ID, TV_YEARLY_RANKING_ID } from "@douban-bridge/contracts/collections";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
  clearDynamicOptionsCache,
  fetchSelectedCollectionOptions,
  fetchSubCollectionOptions,
} from "../src/dynamic-options";
import "../src/index";

const SK = "sk_test";

const CLOUD_ITEM = {
  doubanId: 1291546,
  mediaType: "movie" as const,
  title: "云端标题",
  year: "1994",
  rating: 9.7,
  tmdbId: 278,
  imdbId: "tt0111161",
  images: {
    poster: "https://cdn.example.com/poster.jpg",
    background: null,
    logo: null,
  },
};

describe("dynamicOptions loaders", () => {
  beforeEach(() => {
    clearDynamicOptionsCache();
    Widget.storage.clear();
  });

  afterEach(() => {
    rs.restoreAllMocks();
    clearDynamicOptionsCache();
    Widget.storage.clear();
  });

  test("loadSubCollections fetches live category_tabs and caches in memory and storage", async () => {
    let calls = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      calls += 1;
      expect(url).toContain("https://frodo.douban.com/api/v2/subject_collection/movie_comedy");
      expect(url).toContain("for_mobile=1");
      return {
        statusCode: 200,
        headers: {},
        data: {
          category_tabs: [
            {
              category: "爱情",
              items: [
                { current: false, id: "ECSAOJFTA", name: "近期热门" },
                { current: false, id: "movie_love", name: "高分经典" },
              ],
            },
            {
              category: "喜剧",
              items: [
                { current: false, id: "ECAYN54KI", name: "近期热门" },
                { current: true, id: "movie_comedy", name: "高分经典" },
                { current: false, id: "ECVUOUD7A", name: "华语" },
                { current: false, id: "ECVUOUD7A", name: "华语重复" },
              ],
            },
          ],
        },
      } as never;
    });

    const first = await loadSubCollections({
      collectionId: "movie_comedy",
      subCollectionId: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(first).toEqual([
      { title: "近期热门", value: "ECAYN54KI" },
      { title: "高分经典", value: "movie_comedy" },
      { title: "华语", value: "ECVUOUD7A" },
    ]);
    expect(calls).toBe(1);

    // L1 memory hit
    const second = await fetchSubCollectionOptions("movie_comedy");
    expect(second).toEqual(first);
    expect(calls).toBe(1);

    // Sibling tab pre-warmed in memory
    const sibling = await fetchSubCollectionOptions("movie_love");
    expect(sibling).toEqual([
      { title: "近期热门", value: "ECSAOJFTA" },
      { title: "高分经典", value: "movie_love" },
    ]);
    expect(calls).toBe(1);

    // L2 Widget.storage hit after memory cache reset
    clearDynamicOptionsCache();
    const fromStorage = await fetchSubCollectionOptions("movie_comedy");
    expect(fromStorage).toEqual(first);
    expect(calls).toBe(1);
  });

  test("loadSubCollections resolves latest yearly ranking aliases before fetching", async () => {
    const requested: string[] = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requested.push(url);
      if (url.includes("/subject_collection/ECE472UNY")) {
        return {
          statusCode: 200,
          headers: {},
          data: {
            category_tabs: [
              {
                category: "2025电影",
                items: [
                  { current: true, id: "ECE472UNY", name: "华语" },
                  { current: false, id: "ECB5AE5EQ", name: "外语" },
                ],
              },
            ],
          },
        } as never;
      }
      if (url.includes("/subject_collection/EC2FACYKQ")) {
        return {
          statusCode: 200,
          headers: {},
          data: {
            category_tabs: [
              {
                category: "2025剧集",
                items: [
                  { current: false, id: "EC2FACYKQ", name: "华语剧集" },
                  { current: false, id: "ECHNAB4LY", name: "英美新剧" },
                ],
              },
            ],
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    const movieOptions = await loadSubCollections({
      collectionId: MOVIE_YEARLY_RANKING_ID,
      subCollectionId: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(movieOptions).toEqual([
      { title: "华语", value: "ECE472UNY" },
      { title: "外语", value: "ECB5AE5EQ" },
    ]);

    // Falls back to matching resolvedId when no item has current: true
    const tvOptions = await loadSubCollections({
      collectionId: TV_YEARLY_RANKING_ID,
      subCollectionId: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(tvOptions).toEqual([
      { title: "华语剧集", value: "EC2FACYKQ" },
      { title: "英美新剧", value: "ECHNAB4LY" },
    ]);
    expect(requested).toHaveLength(2);
  });

  test("loadSubCollections returns empty array when no multi-item tab exists or on network failure", async () => {
    let attempts = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      attempts += 1;
      if (url.includes("film_genre_27")) {
        return { statusCode: 200, headers: {}, data: { category_tabs: [] } } as never;
      }
      if (attempts === 2) {
        throw new Error("HTTP 502: bad gateway");
      }
      return {
        statusCode: 200,
        headers: {},
        data: {
          category_tabs: [
            {
              category: "动作",
              items: [
                { current: false, id: "ECBUOLQGY", name: "近期热门" },
                { current: true, id: "movie_action", name: "高分经典" },
              ],
            },
          ],
        },
      } as never;
    });

    // Empty category_tabs is cached cleanly
    await expect(fetchSubCollectionOptions("film_genre_27")).resolves.toEqual([]);
    await expect(fetchSubCollectionOptions("film_genre_27")).resolves.toEqual([]);
    expect(attempts).toBe(1);

    // Network failure degrades to [] and is NOT cached, so retry recovers
    await expect(fetchSubCollectionOptions("movie_action")).resolves.toEqual([]);
    expect(attempts).toBe(2);
    await expect(fetchSubCollectionOptions("movie_action")).resolves.toEqual([
      { title: "近期热门", value: "ECBUOLQGY" },
      { title: "高分经典", value: "movie_action" },
    ]);
    expect(attempts).toBe(3);

    // Invalid / blank collectionId skips network
    await expect(fetchSubCollectionOptions("")).resolves.toEqual([]);
    await expect(fetchSubCollectionOptions("../bad")).resolves.toEqual([]);
    expect(attempts).toBe(3);
  });

  test("loadSubCollections ignores expired storage cache and tolerates storage failures", async () => {
    Widget.storage.set(
      "douban.bridge.sub_collections:movie_scifi",
      JSON.stringify({ expiresAt: Date.now() - 1000, options: [{ title: "旧数据", value: "OLD" }] }),
    );
    rs.spyOn(Widget.http, "get").mockResolvedValue({
      statusCode: 200,
      headers: {},
      data: {
        category_tabs: [
          {
            category: "科幻",
            items: [
              { current: false, id: "ECZYOJPLI", name: "近期热门" },
              { current: true, id: "movie_scifi", name: "高分经典" },
            ],
          },
        ],
      },
    } as never);

    await expect(fetchSubCollectionOptions("movie_scifi")).resolves.toEqual([
      { title: "近期热门", value: "ECZYOJPLI" },
      { title: "高分经典", value: "movie_scifi" },
    ]);

    clearDynamicOptionsCache();
    rs.spyOn(Widget.storage, "get").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    rs.spyOn(Widget.storage, "set").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    await expect(fetchSubCollectionOptions("movie_scifi")).resolves.toEqual([
      { title: "近期热门", value: "ECZYOJPLI" },
      { title: "高分经典", value: "movie_scifi" },
    ]);
  });

  test("genre catalog guards against stale subCollectionId after switching collectionId", async () => {
    const requestedCatalogs: string[] = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      if (url.includes("subject_collection/movie_love")) {
        return {
          statusCode: 200,
          headers: {},
          data: {
            category_tabs: [
              {
                category: "爱情",
                items: [
                  { current: false, id: "ECSAOJFTA", name: "近期热门" },
                  { current: true, id: "movie_love", name: "高分经典" },
                  { current: false, id: "ECOIOTUGY", name: "华语" },
                ],
              },
            ],
          },
        } as never;
      }
      if (url.includes("subject_collection/film_genre_27")) {
        return { statusCode: 200, headers: {}, data: { category_tabs: [] } } as never;
      }
      requestedCatalogs.push(new URL(url).pathname);
      return { statusCode: 200, headers: {}, data: { items: [] } } as never;
    });

    // Cold start (no cache yet) preserves saved subCollectionId directly
    await loadGenreCatalog({
      collectionId: "movie_love",
      subCollectionId: "ECOIOTUGY",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(requestedCatalogs[requestedCatalogs.length - 1]).toBe("/v1/catalog/ECOIOTUGY");

    // Populate dynamicOptions cache for movie_love and film_genre_27
    await loadSubCollections({
      collectionId: "movie_love",
      subCollectionId: "",
      page: "1",
      sk: SK,
      userId: "",
    });
    await loadSubCollections({
      collectionId: "film_genre_27",
      subCollectionId: "",
      page: "1",
      sk: SK,
      userId: "",
    });

    // Valid subCollectionId for movie_love is used
    await loadGenreCatalog({
      collectionId: "movie_love",
      subCollectionId: "ECOIOTUGY",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(requestedCatalogs[requestedCatalogs.length - 1]).toBe("/v1/catalog/ECOIOTUGY");

    // Stale subCollectionId from movie_comedy is ignored for movie_love
    await loadGenreCatalog({
      collectionId: "movie_love",
      subCollectionId: "ECVUOUD7A",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(requestedCatalogs[requestedCatalogs.length - 1]).toBe("/v1/catalog/movie_love");

    // Stale subCollectionId is ignored when target collection has no category tabs
    await loadGenreCatalog({
      collectionId: "film_genre_27",
      subCollectionId: "ECOIOTUGY",
      page: "1",
      sk: SK,
      userId: "",
    });
    expect(requestedCatalogs[requestedCatalogs.length - 1]).toBe("/v1/catalog/film_genre_27");
  });

  test("loadSelectedCollections fetches merged-cover Douban modules and caches non-empty results", async () => {
    let calls = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      calls += 1;
      if (url.includes("/movie/modules")) {
        return {
          statusCode: 200,
          headers: {},
          data: {
            modules: [
              { module_name: "other_module", data: {} },
              {
                module_name: "movie_selected_chart_collections",
                data: {
                  selected_collections: [
                    { id: "movie_top250", title: "豆瓣电影 Top250", is_merged_cover: false, is_official: true },
                    { id: "EC_MOVIE_1", title: "豆瓣2026精选电影", is_merged_cover: true, is_official: true },
                    { id: "EC_MOVIE_2", title: "高分科幻专题", is_merged_cover: true, is_official: true },
                  ],
                },
              },
            ],
          },
        } as never;
      }
      if (url.includes("/tv/modules")) {
        return {
          statusCode: 200,
          headers: {},
          data: {
            modules: [
              {
                module_name: "tv_selected_chart_collections",
                data: {
                  selected_collections: [
                    { id: "EC_TV_1", title: "近期口碑韩剧专题", is_merged_cover: true, is_official: true },
                  ],
                },
              },
            ],
          },
        } as never;
      }
      throw new Error(`unexpected url ${url}`);
    });

    const movieOptions = await loadSelectedCollections({
      type: "movie",
      collectionId: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(movieOptions).toEqual([
      { title: "豆瓣2026精选电影", value: "EC_MOVIE_1" },
      { title: "高分科幻专题", value: "EC_MOVIE_2" },
    ]);
    expect(calls).toBe(1);

    // L1 memory hit
    await expect(fetchSelectedCollectionOptions("movie")).resolves.toEqual(movieOptions);
    expect(calls).toBe(1);

    // L2 storage hit after clearing memory cache
    clearDynamicOptionsCache();
    await expect(fetchSelectedCollectionOptions("movie")).resolves.toEqual(movieOptions);
    expect(calls).toBe(1);

    // TV modules loaded independently
    const tvOptions = await loadSelectedCollections({
      type: "tv",
      collectionId: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(tvOptions).toEqual([{ title: "近期口碑韩剧专题", value: "EC_TV_1" }]);
    expect(calls).toBe(2);
  });

  test("loadSelectedCollections does not cache empty responses or failures", async () => {
    let calls = 0;
    rs.spyOn(Widget.http, "get").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network error");
      if (calls === 2) return { statusCode: 200, headers: {}, data: { modules: [] } } as never;
      return {
        statusCode: 200,
        headers: {},
        data: {
          modules: [
            {
              module_name: "movie_selected_chart_collections",
              data: {
                selected_collections: [
                  { id: "EC_MOVIE_RECOVERED", title: "恢复的精选榜", is_merged_cover: true, is_official: true },
                ],
              },
            },
          ],
        },
      } as never;
    });

    await expect(fetchSelectedCollectionOptions("movie")).resolves.toEqual([]);
    await expect(fetchSelectedCollectionOptions("movie")).resolves.toEqual([]);
    await expect(fetchSelectedCollectionOptions("movie")).resolves.toEqual([
      { title: "恢复的精选榜", value: "EC_MOVIE_RECOVERED" },
    ]);
    expect(calls).toBe(3);
  });

  test("loadSelectedCatalog loads selected chart via cloud, resolves empty or stale collectionId, and validates page", async () => {
    const requestedPaths: string[] = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/api/v2/tv/modules") {
        return {
          statusCode: 200,
          headers: {},
          data: {
            modules: [
              {
                module_name: "tv_selected_chart_collections",
                data: {
                  selected_collections: [
                    { id: "EC_TV_1", title: "高分剧集专题", is_merged_cover: true, is_official: true },
                  ],
                },
              },
            ],
          },
        } as never;
      }
      requestedPaths.push(`${parsed.pathname}${parsed.search}`);
      return { statusCode: 200, headers: {}, data: { items: [CLOUD_ITEM] } } as never;
    });

    // Invalid page throws before any network call
    await expect(loadSelectedCatalog({ type: "tv", collectionId: "", page: "0", sk: SK, userId: "" })).rejects.toThrow(
      "Invalid page",
    );
    expect(requestedPaths).toHaveLength(0);

    // Empty collectionId resolves the first dynamic option for tv
    const items = await loadSelectedCatalog({ type: "tv", collectionId: "", page: "2", sk: SK, userId: "" });
    expect(requestedPaths[requestedPaths.length - 1]).toBe("/v1/catalog/EC_TV_1?skip=20");
    expect(items[0]?.id).toBe("278");

    // Stale movie collectionId after tv options are cached falls back to first tv option
    await loadSelectedCatalog({ type: "tv", collectionId: "EC_MOVIE_STALE", page: "1", sk: SK, userId: "" });
    expect(requestedPaths[requestedPaths.length - 1]).toBe("/v1/catalog/EC_TV_1?skip=0");
  });

  test("loadTvRecommendSubGenres returns dynamic options per genre and guards stale values", async () => {
    const tvOptions = await loadTvRecommendSubGenres({
      genre: "电视剧",
      region: "",
      sort: "T",
      year: "",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(tvOptions[0]).toEqual({ title: "全部", value: "电视剧" });
    expect(tvOptions.some((option) => option.value === "古装")).toBe(true);

    const varietyOptions = await loadTvRecommendSubGenres({
      genre: "综艺",
      region: "",
      sort: "T",
      year: "",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(varietyOptions).toEqual([
      { title: "全部", value: "综艺" },
      { title: "真人秀", value: "真人秀" },
      { title: "脱口秀", value: "脱口秀" },
      { title: "音乐", value: "音乐" },
      { title: "歌舞", value: "歌舞" },
    ]);

    const emptyOptions = await loadTvRecommendSubGenres({
      genre: "",
      region: "",
      sort: "T",
      year: "",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(emptyOptions).toEqual([]);

    const requestedTags: string[] = [];
    rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
      requestedTags.push(new URL(url).searchParams.get("tags") ?? "");
      return { statusCode: 200, headers: {}, data: { items: [], total: 0 } } as never;
    });

    // Stale subGenre "古装" when genre switched to "综艺" falls back to "综艺"
    await loadTvRecommendCatalog({
      genre: "综艺",
      subGenre: "古装",
      region: "大陆",
      sort: "T",
      year: "",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(requestedTags[requestedTags.length - 1]).toBe("综艺,大陆");

    // Stale subGenre ignored when genre switched to "" (全部)
    await loadTvRecommendCatalog({
      genre: "",
      subGenre: "古装",
      region: "香港",
      sort: "T",
      year: "",
      tag: "",
      page: "1",
      sk: "",
      userId: "",
    });
    expect(requestedTags[requestedTags.length - 1]).toBe("香港");
  });
});
