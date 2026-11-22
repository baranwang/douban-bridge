import { MOVIE_YEARLY_RANKING_ID } from "@douban-bridge/contracts/collections";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import {
  fetchDoubanModules,
  fetchRecommendItems,
  fetchSearchItems,
  fetchSubjectCollectionInfo,
  findBasicTmdb,
  getBasicCatalog,
  toVideoItem,
} from "../src/basic";

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

function mockWidget(opts?: {
  http?: (url: string) => { statusCode: number; data: unknown };
  tmdb?: (path: string) => unknown;
}) {
  const requests: string[] = [];
  rs.spyOn(Widget.http, "get").mockImplementation(async (url) => {
    requests.push(url);
    const response = opts?.http ? opts.http(url) : { statusCode: 200, data: SOURCE };
    return { ...response, headers: {} } as never;
  });
  rs.spyOn(Widget.tmdb, "get").mockImplementation(async (path) => {
    requests.push(path);
    return (opts?.tmdb ? opts.tmdb(path) : TMDB) as never;
  });
  return requests;
}

describe("basic Douban source", () => {
  beforeEach(() => {
    Widget.storage.clear();
  });

  afterEach(() => {
    rs.restoreAllMocks();
    Widget.storage.clear();
  });

  test("basic catalog uses public Douban paging and never calls the cloud API", async () => {
    const requests = mockWidget();
    const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 20 });
    expect(
      requests.some((url) => url.includes("https://frodo.douban.com/api/v2/subject_collection/movie_top250/items")),
    ).toBe(true);
    expect(requests.some((url) => url.includes("m.douban.com"))).toBe(false);
    expect(requests.some((url) => url.includes("/v1/"))).toBe(false);
    expect(requests.some((url) => url.includes("start=20") && url.includes("count=20"))).toBe(true);
    expect(result[0]?.id).toBe("278");
    expect(result[0]?.type).toBe("tmdb");
    expect(result[0]?.title).toBe("肖申克的救赎");
    expect(result[0]?.posterPath).toBe("/test.jpg");
    expect("description" in (result[0] ?? {})).toBe(false);
    expect(requests.some((url) => url.includes("/subject/1291546") && !url.includes("subject_collection"))).toBe(false);
  });

  test("TMDB failure keeps Douban id and cover", async () => {
    mockWidget({
      tmdb: () => {
        throw new Error("network");
      },
    });
    const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
    expect(result[0]?.id).toBe("1291546");
    expect(result[0]?.type).toBe("douban");
    expect(result[0]?.posterPath).toBe("https://img1.doubanio.com/test.jpg");
  });

  test("multiple TMDB candidates do not match", async () => {
    mockWidget({
      tmdb: () => ({
        results: [
          { id: 278, title: "肖申克的救赎", release_date: "1994-09-23" },
          { id: 999, title: "肖申克的救赎", release_date: "1994-01-01" },
        ],
      }),
    });
    const result = await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
    expect(result[0]?.type).toBe("douban");
    expect(result[0]?.id).toBe("1291546");
    await expect(findBasicTmdb({ type: "movie", title: "肖申克的救赎", year: "1994" })).resolves.toBeNull();
  });

  test("movie and TV with the same title do not search across type", async () => {
    const movieRequests = mockWidget();
    await getBasicCatalog({ collectionId: "movie_top250", skip: 0 });
    expect(movieRequests).toContain("search/movie");
    expect(movieRequests).not.toContain("search/tv");

    rs.restoreAllMocks();
    const tvSource = {
      subject_collection_items: [{ id: 1291546, type: "tv", title: "肖申克的救赎", year: "1994" }],
      total: 1,
    };
    const tvRequests = mockWidget({
      http: () => ({ statusCode: 200, data: tvSource }),
      tmdb: () => ({ results: [{ id: 1396, name: "肖申克的救赎", first_air_date: "1994-01-01" }] }),
    });
    const tv = await getBasicCatalog({ collectionId: "tv_hot", skip: 0 });
    expect(tvRequests).toContain("search/tv");
    expect(tvRequests).not.toContain("search/movie");
    expect(tv[0]?.id).toBe("1396");
    expect(tv[0]?.type).toBe("tmdb");
  });

  test("Douban source failure rejects", async () => {
    mockWidget({ http: () => ({ statusCode: 500, data: null }) });
    await expect(getBasicCatalog({ collectionId: "movie_top250", skip: 0 })).rejects.toThrow("Douban request failed");
  });

  test("a real empty Douban page returns an empty list", async () => {
    const requests = mockWidget({
      http: () => ({ statusCode: 200, data: { subject_collection_items: [], total: 0 } }),
    });
    await expect(getBasicCatalog({ collectionId: "movie_top250", skip: 0 })).resolves.toEqual([]);
    expect(requests).not.toContain("search/movie");
  });

  test("yearly rankings resolve the latest id and subcollections load directly", async () => {
    const yearly = mockWidget();
    await getBasicCatalog({ collectionId: MOVIE_YEARLY_RANKING_ID, skip: 0 });
    expect(yearly.some((url) => url.includes("subject_collection/ECE472UNY/items"))).toBe(true);

    rs.restoreAllMocks();
    const subcollection = mockWidget({
      http: (url) => {
        if (url.includes("subject_collection/ECOIOTUGY/items")) return { statusCode: 200, data: SOURCE };
        throw new Error(`unexpected url ${url}`);
      },
    });
    const result = await getBasicCatalog({ collectionId: "ECOIOTUGY", skip: 0 });
    expect(result[0]?.id).toBe("278");
    expect(result[0]?.type).toBe("tmdb");
    expect(subcollection.some((url) => url.includes("subject_collection/ECOIOTUGY/items"))).toBe(true);
    expect(subcollection.some((url) => url.includes("for_mobile=1"))).toBe(false);
  });

  test("basic search hits frodo weixin and keeps movie/tv subjects", async () => {
    const searchData = {
      items: [
        { layout: "doulist_cards", target_type: "doulist_cards" },
        {
          layout: "subject",
          target_type: "movie",
          target: {
            id: "1291546",
            title: "肖申克的救赎",
            year: "1994",
            cover_url: "https://img1.doubanio.com/test.jpg",
            rating: { value: 9.7 },
          },
        },
        {
          layout: "subject",
          target_type: "book",
          target: { id: "1001", title: "一本书" },
        },
      ],
      total: 2,
    };
    const requests = mockWidget({ http: () => ({ statusCode: 200, data: searchData }) });
    const items = await fetchSearchItems("肖申克", 0);
    const result = await Promise.all(items.map((item) => toVideoItem(item)));
    expect(
      requests.some(
        (url) =>
          url.includes("https://frodo.douban.com/api/v2/search/weixin") &&
          url.includes("q=") &&
          url.includes("start=0"),
      ),
    ).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("278");
    expect(result[0]?.type).toBe("tmdb");
    expect(result[0]?.title).toBe("肖申克的救赎");
  });

  test("empty search query throws before any request", async () => {
    const requests = mockWidget();
    await expect(fetchSearchItems("  ", 0)).rejects.toThrow("搜索关键词");
    expect(requests).toHaveLength(0);
  });

  test("basic recommend hits frodo movie/tv recommend and keeps subjects", async () => {
    const requests = mockWidget({
      http: (url) => {
        if (url.includes("/tv/recommend")) {
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
          };
        }
        throw new Error(`unexpected url ${url}`);
      },
    });
    const items = await fetchRecommendItems("tv", "电视剧,香港,2020年代", "U", 0);
    expect(
      requests.some(
        (url) =>
          url.includes("https://frodo.douban.com/api/v2/tv/recommend") &&
          url.includes("tags=") &&
          url.includes("sort=U") &&
          url.includes("start=0"),
      ),
    ).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(37822829);
    expect(items[0]?.title).toBe("开庭");
  });

  test("fetchSubjectCollectionInfo hits frodo subject_collection with for_mobile=1", async () => {
    const requests = mockWidget({
      http: () => ({
        statusCode: 200,
        data: {
          category_tabs: [
            {
              category: "喜剧",
              items: [
                { current: false, id: "ECAYN54KI", name: "近期热门" },
                { current: true, id: "movie_comedy", name: "高分经典" },
              ],
            },
          ],
        },
      }),
    });
    const info = await fetchSubjectCollectionInfo("movie_comedy");
    expect(
      requests.some(
        (url) =>
          url.includes("https://frodo.douban.com/api/v2/subject_collection/movie_comedy") &&
          url.includes("for_mobile=1"),
      ),
    ).toBe(true);
    expect(info.category_tabs?.[0]?.items).toHaveLength(2);
  });

  test("fetchDoubanModules hits frodo movie and tv modules endpoints", async () => {
    const requests = mockWidget({
      http: () => ({
        statusCode: 200,
        data: {
          modules: [
            {
              module_name: "movie_selected_chart_collections",
              data: {
                selected_collections: [
                  { id: "EC_FEATURED_1", title: "豆瓣片单", is_merged_cover: true, is_official: true },
                ],
              },
            },
          ],
        },
      }),
    });
    const resp = await fetchDoubanModules("movie");
    expect(requests.some((url) => url.includes("https://frodo.douban.com/api/v2/movie/modules"))).toBe(true);
    expect(resp.modules[0]?.data.selected_collections[0]?.id).toBe("EC_FEATURED_1");
  });
});
