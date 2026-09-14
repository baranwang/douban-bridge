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

const PAGE = { name: "page", title: "页码", type: "page" } satisfies WidgetModuleParam;

function queryFromParams(params: { collectionId: string; page?: string | number; offset?: string | number }) {
  const page = Number(params.page ?? 1);
  const skip = params.offset === undefined ? (page - 1) * 20 : Number(params.offset);
  if (params.offset === undefined && (!Number.isSafeInteger(page) || page < 1)) throw new Error("Invalid page");
  const subCollectionId = Reflect.get(params, `subCollectionId_${params.collectionId}`);
  return catalogQuerySchema.parse({ collectionId: subCollectionId || params.collectionId, skip });
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

loadDefaultCatalog = async (params) => {
  const items = await loadCatalog(queryFromParams(params), (params.sk ?? "").trim());
  return items.map(toHostItem);
};
export const loadGenreCatalog = loadDefaultCatalog;
export const loadYearlyCatalog = loadDefaultCatalog;
function enumOptions(items: { id: string; name: string }[]) {
  return items.map((item) => ({ title: item.name, value: item.id }));
}

function subCollectionParams(collections: { id: string }[]) {
  return collections.flatMap(({ id }) => {
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
          } satisfies WidgetModuleParam,
        ]
      : [];
  });
}

WidgetMetadata = {
  id: "douban.bridge",
  title: "豆瓣",
  version,
  requiredVersion: "0.0.1",
  globalParams: [{ name: "sk", title: "密钥", type: "input" }],
  modules: [
    ...COLLECTION_CONFIGS.filter((item) => item.isDefault).map((item) => ({
      id: item.id,
      title: item.name,
      functionName: "loadDefaultCatalog",
      cacheDuration: 0,
      params: [
        { name: "collectionId", title: "榜单", type: "constant", value: item.id } satisfies WidgetModuleParam,
        PAGE,
      ],
    })),
    {
      id: "movie_genre",
      title: "电影类型榜",
      functionName: "loadGenreCatalog",
      cacheDuration: 0,
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
      cacheDuration: 0,
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
      cacheDuration: 0,
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
      cacheDuration: 0,
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

Object.assign(globalThis, { WidgetMetadata, loadDefaultCatalog, loadGenreCatalog, loadYearlyCatalog });
