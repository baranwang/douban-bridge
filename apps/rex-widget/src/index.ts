import { type BridgeItem, catalogQuerySchema } from "@douban-bridge/contracts";
import {
  COLLECTION_CONFIGS,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
  YEARLY_RANKINGS,
} from "@douban-bridge/contracts/collections";
import { version } from "../package.json";
import { loadCatalog } from "./cloud";
import { SUB_COLLECTIONS } from "./sub-collections";

const PAGE = { name: "page", title: "页码", type: "page", value: "1" } satisfies WidgetModuleParam;

function queryFromParams(params: { collectionId: string; page?: string | number }) {
  const page = Number(params.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid page");
  const subCollectionId = Reflect.get(params, `subCollectionId_${params.collectionId}`);
  return catalogQuerySchema.parse({ collectionId: subCollectionId || params.collectionId, skip: (page - 1) * 20 });
}

function toHostItem(item: BridgeItem) {
  return {
    id: item.tmdbId ? `${item.mediaType}.${item.tmdbId}` : String(item.imdbId ?? item.doubanId),
    type: item.tmdbId ? "tmdb" : item.imdbId ? "imdb" : "douban",
    title: item.title,
    description: item.description,
    mediaType: item.mediaType,
    posterPath: item.images.poster ?? undefined,
    backdropPath: item.images.background ?? undefined,
    rating: item.rating === undefined ? undefined : String(item.rating),
    releaseDate: item.year,
  } satisfies VideoItem;
}

const loadCatalogForWidget = async (
  params: DoubanBridge.GlobalParams & {
    collectionId: string;
    page?: string | number;
  },
) => {
  const items = await loadCatalog(queryFromParams(params), (params.sk ?? "").trim(), params.userId ?? "");
  return items.map(toHostItem);
};
loadDefaultCatalog = loadCatalogForWidget;
loadGenreCatalog = loadCatalogForWidget;
loadYearlyCatalog = loadCatalogForWidget;
function enumOptions(items: { id: string; name: string }[]) {
  return items.map((item) => ({ title: item.name, value: item.id }));
}

function subCollectionParams(collections: { id: string }[]) {
  return collections.flatMap<WidgetModuleParam>(({ id }) => {
    const items = SUB_COLLECTIONS[id as keyof typeof SUB_COLLECTIONS];
    return items
      ? [
          {
            name: `subCollectionId_${id}`,
            title: "分类",
            type: "enumeration",
            value: id,
            belongTo: { paramName: "collectionId", value: [id] },
            enumOptions: enumOptions([...items]),
          },
        ]
      : [];
  });
}

const i18n = {
  "zh-Hant": {
    密钥: "密鑰",
    榜单: "排行榜",
    页码: "頁碼",
    分类: "分類",
    年度: "年度",
    最新年度: "最新年度",
    豆瓣榜单: "豆瓣排行榜",
    "豆瓣电影、剧集排行榜": "豆瓣電影、劇集排行榜",
    电影类型榜: "電影類型排行榜",
    剧集类型榜: "劇集類型排行榜",
    豆瓣年度评分最高电影: "豆瓣年度最高評分電影",
    豆瓣年度评分最高剧集: "豆瓣年度最高評分劇集",
  },
  en: {
    密钥: "Secret Key",
    榜单: "Chart",
    页码: "Page",
    分类: "Category",
    年度: "Year",
    最新年度: "Latest",
    豆瓣榜单: "Douban Charts",
    "豆瓣电影、剧集排行榜": "Douban movie and TV charts",
    电影类型榜: "Movies by Genre",
    剧集类型榜: "TV Shows by Genre",
    豆瓣年度评分最高电影: "Douban's Top-Rated Movies by Year",
    豆瓣年度评分最高剧集: "Douban's Top-Rated TV Shows by Year",
  },
};

WidgetMetadata = {
  id: "douban.bridge",
  title: "豆瓣榜单",
  description: "豆瓣电影、剧集排行榜",
  author: "Baran",
  site: "https://douban-bridge.baran.wang/rex",
  version,
  requiredVersion: "0.0.1",
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
    ...COLLECTION_CONFIGS.filter((item) => item.isDefault).map<WidgetModule>((item) => ({
      id: item.id,
      title: item.name,
      functionName: "loadDefaultCatalog",
      params: [{ name: "collectionId", title: "榜单", type: "constant", value: item.id }, PAGE],
    })),
    {
      id: "movie_genre",
      title: "电影类型榜",
      functionName: "loadGenreCatalog",
      params: [
        { name: "collectionId", title: "榜单", type: "enumeration", enumOptions: enumOptions(MOVIE_GENRE_CONFIGS) },
        ...subCollectionParams(MOVIE_GENRE_CONFIGS),
        PAGE,
      ],
    },
    {
      id: "tv_genre",
      title: "剧集类型榜",
      functionName: "loadGenreCatalog",
      params: [
        { name: "collectionId", title: "榜单", type: "enumeration", enumOptions: enumOptions(TV_GENRE_CONFIGS) },
        ...subCollectionParams(TV_GENRE_CONFIGS),
        PAGE,
      ],
    },
    {
      id: "movie_yearly",
      title: "豆瓣年度评分最高电影",
      functionName: "loadYearlyCatalog",

      params: [
        {
          name: "collectionId",
          title: "年度",
          type: "enumeration",
          enumOptions: [
            { title: "最新年度", value: MOVIE_YEARLY_RANKING_ID },
            ...enumOptions(YEARLY_RANKINGS[MOVIE_YEARLY_RANKING_ID]),
          ],
        },
        PAGE,
      ],
    },
    {
      id: "tv_yearly",
      title: "豆瓣年度评分最高剧集",
      functionName: "loadYearlyCatalog",

      params: [
        {
          name: "collectionId",
          title: "年度",
          type: "enumeration",
          enumOptions: [
            { title: "最新年度", value: TV_YEARLY_RANKING_ID },
            ...enumOptions(YEARLY_RANKINGS[TV_YEARLY_RANKING_ID]),
          ],
        },
        PAGE,
      ],
    },
  ],
};
