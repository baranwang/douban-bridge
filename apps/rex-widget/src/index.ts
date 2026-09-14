import { type BridgeItem, catalogQuerySchema, doubanIdSchema } from "@douban-bridge/contracts";
import {
  COLLECTION_CONFIGS,
  MOVIE_GENRE_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_GENRE_CONFIGS,
  TV_YEARLY_RANKING_ID,
  YEARLY_RANKINGS,
} from "@douban-bridge/contracts/collections";
import { version } from "../package.json";
import { loadCatalog, loadMeta } from "./cloud";

const API_ORIGIN = "https://douban-bridge-api.baran.wang";
const SK_STORAGE = "douban.bridge.sk";
const PAGE = { name: "page", title: "页码", type: "page" };

export type WidgetParams = {
  collectionId: string;
  page?: string | number;
  offset?: string | number;
  genre?: string;
  sk?: string;
};

async function readSk(params?: { sk?: string }): Promise<string> {
  if (params && Object.hasOwn(params, "sk")) {
    const sk = (params.sk ?? "").trim();
    if (sk) await Widget.storage.set(SK_STORAGE, sk);
    else await Widget.storage.remove(SK_STORAGE);
    return sk;
  }
  return (await Widget.storage.get(SK_STORAGE)) || "";
}

function detailLink(id: number): string {
  return `${API_ORIGIN}/v1/meta/${id}`;
}

function readDetailId(link: string): number {
  const url = new URL(link);
  if (url.origin !== API_ORIGIN) throw new Error("Invalid detail link");
  const match = /^\/v1\/meta\/([1-9]\d*)$/.exec(url.pathname);
  if (!match || url.search || url.hash) throw new Error("Invalid detail link");
  return doubanIdSchema.parse(match[1]);
}

function queryFromParams(params: {
  collectionId: string;
  page?: string | number;
  offset?: string | number;
  genre?: string;
}) {
  const page = Number(params.page ?? 1);
  const skip = params.offset === undefined ? (page - 1) * 20 : Number(params.offset);
  if (params.offset === undefined && (!Number.isSafeInteger(page) || page < 1)) throw new Error("Invalid page");
  return catalogQuerySchema.parse({ collectionId: params.collectionId, skip, genre: params.genre || undefined });
}

function toHostItem(item: BridgeItem): VideoItem {
  return {
    id: String(item.tmdbId ?? item.imdbId ?? item.doubanId),
    type: item.tmdbId ? "tmdb" : item.imdbId ? "imdb" : "douban",
    title: item.title,
    description: item.description,
    mediaType: item.mediaType,
    posterPath: item.images.poster ?? undefined,
    backdropPath: item.images.background ?? undefined,
    rating: item.rating === undefined ? undefined : String(item.rating),
    releaseDate: item.year,
    link: detailLink(item.doubanId),
  };
}

export async function loadDefaultCatalog(params: WidgetParams) {
  const items = await loadCatalog(queryFromParams(params), await readSk(params));
  return items.map(toHostItem);
}
export const loadGenreCatalog = loadDefaultCatalog;
export const loadYearlyCatalog = loadDefaultCatalog;
export async function loadDetail(link: string) {
  return toHostItem(await loadMeta(readDetailId(link), await readSk()));
}

function enumOptions(items: { id: string; name: string }[]) {
  return items.map((item) => ({ title: item.name, value: item.id }));
}

export const WidgetMetadata = {
  id: "douban.bridge",
  title: "豆瓣",
  version,
  requiredVersion: "0.0.1",
  detailCacheDuration: 0,
  globalParams: [{ name: "sk", title: "密钥", type: "input" }],
  modules: [
    ...COLLECTION_CONFIGS.filter((item) => item.isDefault).map((item) => ({
      id: item.id,
      title: item.name,
      functionName: "loadDefaultCatalog",
      cacheDuration: 0,
      params: [
        { name: "collectionId", title: "榜单", type: "constant", value: item.id },
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
        { name: "genre", title: "筛选", type: "input", description: "填写该榜单已有的筛选名称" },
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
        { name: "genre", title: "筛选", type: "input", description: "填写该榜单已有的筛选名称" },
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

Object.assign(globalThis, { WidgetMetadata, loadDefaultCatalog, loadGenreCatalog, loadYearlyCatalog, loadDetail });
