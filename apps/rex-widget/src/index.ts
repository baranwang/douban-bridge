import { catalogQuerySchema } from "@douban-bridge/contracts";
import {
  COLLECTION_CONFIGS,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
  YEARLY_RANKINGS,
} from "@douban-bridge/contracts/collections";
import { loadCatalog, loadRecommend, loadSearch as searchFromCloud } from "./cloud";
import {
  fetchSelectedCollectionOptions,
  fetchSubCollectionOptions,
  resolveSelectedCollectionId,
  resolveSubCollectionId,
} from "./dynamic-options";

const widgetVersion = (() => {
  if (process.env.NODE_ENV === "production") {
    return process.env.PACKAGE_VERSION || "0.1.0";
  }
  const date = new Date();
  return `0.0.0-${[date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
    .map((item) => item.toString().padStart(2, "0"))
    .join("")}`;
})();

const TV_RECOMMEND_SUB_GENRES = new Map<string, WidgetModuleParamOption[]>([
  [
    "电视剧",
    [
      { title: "全部", value: "电视剧" },
      ...[
        "喜剧",
        "爱情",
        "悬疑",
        "动画",
        "武侠",
        "古装",
        "家庭",
        "犯罪",
        "科幻",
        "恐怖",
        "历史",
        "战争",
        "动作",
        "冒险",
        "传记",
        "剧情",
        "奇幻",
        "惊悚",
        "灾难",
        "歌舞",
        "音乐",
      ].map((item) => ({ title: item, value: item })),
    ],
  ],
  [
    "综艺",
    [
      { title: "全部", value: "综艺" },
      ...["真人秀", "脱口秀", "音乐", "歌舞"].map((item) => ({ title: item, value: item })),
    ],
  ],
]);

function pageSkip(page?: string | number) {
  const value = Number(page ?? 1);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid page");
  return (value - 1) * 20;
}

function queryFromParams(params: { collectionId: string; subCollectionId?: string; page?: string | number }) {
  const skip = pageSkip(params.page);
  const targetId = resolveSubCollectionId(params.collectionId, params.subCollectionId);
  return catalogQuerySchema.parse({ collectionId: targetId, skip });
}

const loadCatalogForWidget = async (
  params: DoubanBridge.GlobalParams & {
    collectionId: string;
    subCollectionId?: string;
    page?: string | number;
  },
) => loadCatalog(queryFromParams(params), (params.sk ?? "").trim(), params.userId ?? "");

loadDefaultCatalog = loadCatalogForWidget;
loadGenreCatalog = loadCatalogForWidget;
loadYearlyCatalog = loadCatalogForWidget;

loadSelectedCatalog = async (params) => {
  const skip = pageSkip(params.page);
  const type: "movie" | "tv" = params.type === "tv" ? "tv" : "movie";
  const collectionId = await resolveSelectedCollectionId(type, params.collectionId);
  if (!collectionId) return [];
  return loadCatalog(catalogQuerySchema.parse({ collectionId, skip }), (params.sk ?? "").trim(), params.userId ?? "");
};

loadSubCollections = async (params) => fetchSubCollectionOptions(params.collectionId);

loadSelectedCollections = async (params) => fetchSelectedCollectionOptions(params.type === "tv" ? "tv" : "movie");

loadTvRecommendSubGenres = (params) => TV_RECOMMEND_SUB_GENRES.get(String(params.genre ?? "").trim()) ?? [];

function recommendTags(params: { genre?: string; subGenre?: string; region?: string; year?: string; tag?: string }) {
  const genre = String(params.genre ?? "").trim();
  const subGenre = String(params.subGenre ?? "").trim();
  const allowedSubGenres = TV_RECOMMEND_SUB_GENRES.get(genre);
  const primaryGenre = allowedSubGenres
    ? allowedSubGenres.some((option) => option.value === subGenre)
      ? subGenre
      : genre
    : genre;
  return [primaryGenre, params.region, params.year, params.tag]
    .flatMap((value) => String(value ?? "").split(/[,，]/))
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

const loadRecommendForWidget = async (
  type: "movie" | "tv",
  params: DoubanBridge.GlobalParams & (LoadMovieRecommendCatalogParams | LoadTvRecommendCatalogParams),
) =>
  loadRecommend(
    type,
    recommendTags(params),
    String(params.sort ?? "T").trim() || "T",
    pageSkip(params.page),
    (params.sk ?? "").trim(),
    params.userId ?? "",
  );

loadMovieRecommendCatalog = (params) => loadRecommendForWidget("movie", params);
loadTvRecommendCatalog = (params) => loadRecommendForWidget("tv", params);

loadSearch = async (params) =>
  searchFromCloud(
    (params.keyword || String(Reflect.get(params, "query") ?? "")).trim(),
    (params.sk ?? "").trim(),
    params.userId ?? "",
  );

function enumOptions(items: { id: string; name: string }[]) {
  return items.map((item) => ({ title: item.name, value: item.id }));
}

const i18n = {
  "zh-Hant": {
    密钥: "密鑰",
    榜单: "排行榜",
    页码: "頁碼",
    分类: "分類",
    年度: "年度",
    最新年度: "最新年度",
    类型: "類型",
    电影: "電影",
    剧集: "劇集",
    豆瓣榜单: "豆瓣排行榜",
    "豆瓣电影、剧集排行榜": "豆瓣電影、劇集排行榜",
    电影类型榜: "電影類型排行榜",
    剧集类型榜: "劇集類型排行榜",
    豆瓣年度评分最高电影: "豆瓣年度最高評分電影",
    豆瓣年度评分最高剧集: "豆瓣年度最高評分劇集",
    豆瓣精选榜单: "豆瓣精選排行榜",
    搜索: "搜尋",
    搜索关键词: "搜尋關鍵字",
    自定义标签: "自訂標籤",
  },
  en: {
    密钥: "Secret Key",
    榜单: "Chart",
    页码: "Page",
    分类: "Category",
    年度: "Year",
    最新年度: "Latest",
    类型: "Type",
    电影: "Movies",
    剧集: "TV Shows",
    豆瓣榜单: "Douban Charts",
    "豆瓣电影、剧集排行榜": "Douban movie and TV charts",
    电影类型榜: "Movies by Genre",
    剧集类型榜: "TV Shows by Genre",
    豆瓣年度评分最高电影: "Douban's Top-Rated Movies by Year",
    豆瓣年度评分最高剧集: "Douban's Top-Rated TV Shows by Year",
    豆瓣精选榜单: "Douban Featured Charts",
    搜索: "Search",
    搜索关键词: "Search Query",
    自定义标签: "Custom Tag",
  },
};

const RECOMMEND_REGION = [
  { title: "全部", value: "" },
  ...[
    "华语",
    "欧美",
    "国外",
    "韩国",
    "日本",
    "大陆",
    "香港",
    "美国",
    "英国",
    "泰国",
    "台湾",
    "意大利",
    "法国",
    "德国",
    "西班牙",
    "俄罗斯",
    "瑞典",
    "巴西",
    "丹麦",
    "印度",
    "加拿大",
    "爱尔兰",
    "澳大利亚",
  ].map((item) => ({ title: item, value: item })),
];

const RECOMMEND_SORT = [
  { title: "综合排序", value: "T" },
  { title: "近期热度", value: "U" },
  { title: "首播时间", value: "R" },
  { title: "高分优先", value: "S" },
];

const RECOMMEND_YEAR = [
  { title: "全部", value: "" },
  ...[
    "2020年代",
    "2026",
    "2025",
    "2024",
    "2023",
    "2022",
    "2021",
    "2020",
    "2019",
    "2010年代",
    "2000年代",
    "90年代",
    "80年代",
    "70年代",
    "60年代",
    "更早",
  ].map((item) => ({ title: item, value: item })),
];

const PAGE = { name: "page", title: "页码", type: "page", value: "1" } satisfies WidgetModuleParam;
const SUB_COLLECTION_PARAM = {
  name: "subCollectionId",
  title: "分类",
  type: "enumeration",
  dynamicOptions: {
    functionName: "loadSubCollections",
    dependsOn: ["collectionId"],
  },
} satisfies WidgetModuleParam;

const RECOMMEND_FILTERS: WidgetModuleParam[] = [
  { name: "region", title: "地区", type: "enumeration", enumOptions: RECOMMEND_REGION },
  { name: "sort", title: "排序", type: "enumeration", value: "T", enumOptions: RECOMMEND_SORT },
  { name: "year", title: "年代", type: "enumeration", enumOptions: RECOMMEND_YEAR },
  {
    name: "tag",
    title: "自定义标签",
    description: "多个标签用逗号分隔",
    type: "input",
  },
  PAGE,
];

function genreModule(id: string, title: string, configs: { id: string; name: string }[]): WidgetModule {
  return {
    id,
    title,
    functionName: "loadGenreCatalog",
    params: [
      {
        name: "collectionId",
        title: "榜单",
        type: "enumeration",
        value: configs[0]?.id,
        enumOptions: enumOptions(configs),
      },
      SUB_COLLECTION_PARAM,
      PAGE,
    ],
  };
}

function yearlyModule(id: string, title: string, rankingId: keyof typeof YEARLY_RANKINGS): WidgetModule {
  const rankings = YEARLY_RANKINGS[rankingId];
  return {
    id,
    title,
    functionName: "loadYearlyCatalog",
    params: [
      {
        name: "collectionId",
        title: "年度",
        type: "enumeration",
        value: rankingId,
        enumOptions: [{ title: "最新年度", value: rankingId }, ...enumOptions(rankings)],
      },
      SUB_COLLECTION_PARAM,
      PAGE,
    ],
  };
}

WidgetMetadata = {
  id: "douban.bridge",
  title: process.env.NODE_ENV === "production" ? "豆瓣榜单" : "豆瓣榜单 (测试)",
  description: "豆瓣电影、剧集排行榜",
  author: "Baran",
  site: "https://douban-bridge.baran.wang/rex",
  version: widgetVersion,
  requiredVersion: "0.0.6",
  iconurl: "https://fastly.jsdelivr.net/gh/baranwang/douban-bridge@main/icon.png",
  globalParams: [
    { name: "sk", title: "密钥", description: "点击上方网站获取密钥，开启完整功能", type: "input" },
    {
      name: "userId",
      title: "用户 ID",
      type: "userId",
    },
  ],
  i18n,
  modules: [
    ...COLLECTION_CONFIGS.filter((item) => !item.hasGenre).map<WidgetModule>((item) => ({
      id: item.id,
      title: item.name,
      functionName: "loadDefaultCatalog",
      params: [{ name: "collectionId", title: "榜单", type: "constant", value: item.id }, PAGE],
    })),
    genreModule("movie_genre", "电影类型榜", MOVIE_GENRE_CONFIGS),
    genreModule("tv_genre", "剧集类型榜", TV_GENRE_CONFIGS),
    yearlyModule("movie_yearly", "豆瓣年度评分最高电影", MOVIE_YEARLY_RANKING_ID),
    yearlyModule("tv_yearly", "豆瓣年度评分最高剧集", TV_YEARLY_RANKING_ID),
    {
      id: "selected_collections",
      title: "豆瓣精选榜单",
      functionName: "loadSelectedCatalog",
      params: [
        {
          name: "type",
          title: "类型",
          type: "enumeration",
          value: "movie",
          enumOptions: [
            { title: "电影", value: "movie" },
            { title: "剧集", value: "tv" },
          ],
        },
        {
          name: "collectionId",
          title: "榜单",
          type: "enumeration",
          dynamicOptions: {
            functionName: "loadSelectedCollections",
            dependsOn: ["type"],
          },
        },
        PAGE,
      ],
    },
    {
      id: "movie_recommend",
      title: "电影推荐",
      functionName: "loadMovieRecommendCatalog",
      params: [
        {
          name: "genre",
          title: "类型",
          type: "enumeration",
          enumOptions: [
            { title: "全部", value: "" },
            ...[
              "喜剧",
              "爱情",
              "动作",
              "科幻",
              "动画",
              "悬疑",
              "犯罪",
              "惊悚",
              "冒险",
              "音乐",
              "历史",
              "奇幻",
              "恐怖",
              "战争",
              "传记",
              "歌舞",
              "武侠",
              "灾难",
              "西部",
              "纪录片",
              "短片",
            ].map((item) => ({ title: item, value: item })),
          ],
        },
        ...RECOMMEND_FILTERS,
      ],
    },
    {
      id: "tv_recommend",
      title: "剧集推荐",
      functionName: "loadTvRecommendCatalog",
      params: [
        {
          name: "genre",
          title: "类型",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部", value: "" },
            { title: "剧集", value: "电视剧" },
            { title: "综艺", value: "综艺" },
          ],
        },
        {
          name: "subGenre",
          title: "分类",
          type: "enumeration",
          belongTo: {
            paramName: "genre",
            value: ["电视剧", "综艺"],
          },
          dynamicOptions: {
            functionName: "loadTvRecommendSubGenres",
            dependsOn: ["genre"],
          },
        },
        ...RECOMMEND_FILTERS,
      ],
    },
  ],
  search: {
    id: "search",
    title: "搜索",
    functionName: "loadSearch",
    params: [{ name: "keyword", title: "搜索关键词", type: "input" }],
  },
};
