import { type CatalogQuery, catalogQuerySchema } from "@douban-bridge/contracts";
import { getLatestYearlyRanking } from "@douban-bridge/contracts/collections";
import {
  type DoubanSubjectCollectionItem,
  doubanRecommendSchema,
  doubanSearchSchema,
  doubanSubjectCollectionSchema,
} from "@douban-bridge/contracts/douban";
import { z } from "zod/v4";
import { rexFetch } from "./http";

const DOUBAN_BASE = "https://frodo.douban.com/api/v2";
const FRODO_KEY = "0ac44ae016490db2204ce0a042db2916";
const DOUBAN_HEADERS = {
  Referer: "https://servicewechat.com/wx2f9b06c1de1ccfca/99/page-frame.html",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.76(0x18004c3a) NetType/WIFI Language/zh_CN",
};

const tmdbSearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string().optional(),
      name: z.string().optional(),
      original_title: z.string().optional(),
      original_name: z.string().optional(),
      release_date: z.string().optional(),
      first_air_date: z.string().optional(),
      poster_path: z.string().nullish(),
      backdrop_path: z.string().nullish(),
    }),
  ),
});

export type BasicTmdbMatch = { id: number; poster_path?: string | null; backdrop_path?: string | null };
export type BasicTmdbSource = {
  type: "movie" | "tv";
  title: string;
  original_title?: string | null;
  year?: string | null;
};

function projectImages(
  source: {
    cover?: string | null;
    cover_url?: string | null;
    photos?: string[] | null;
    pic?: { large?: string | null; normal?: string | null } | null;
  },
  match: BasicTmdbMatch | null,
) {
  return {
    poster:
      match?.poster_path ?? source.cover ?? source.cover_url ?? source.pic?.large ?? source.pic?.normal ?? undefined,
    background: match?.backdrop_path ?? source.photos?.[0] ?? undefined,
  };
}

export async function findBasicTmdb(source: BasicTmdbSource): Promise<BasicTmdbMatch | null> {
  try {
    const { results } = tmdbSearchSchema.parse(
      await Widget.tmdb.get(`search/${source.type}`, { params: { query: source.title, language: "zh-CN" } }),
    );
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const titles = new Set([source.title, source.original_title].filter((v): v is string => !!v).map(normalize));
    const candidates = results.filter((item) => {
      const names = [item.title, item.name, item.original_title, item.original_name].filter(
        (v): v is string => typeof v === "string",
      );
      const date = item.release_date ?? item.first_air_date;
      const year = typeof date === "string" ? date.slice(0, 4) : "";
      return (
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        names.some((name) => titles.has(normalize(name))) &&
        (!source.year || !year || source.year === year)
      );
    });
    return candidates.length === 1 ? candidates[0] : null;
  } catch {
    return null;
  }
}

export async function toVideoItem(item: DoubanSubjectCollectionItem): Promise<VideoItem> {
  const match = await findBasicTmdb({
    type: item.type,
    title: item.title,
    original_title: item.original_title,
    year: item.year,
  }).catch(() => null);
  const images = projectImages(item, match);
  return {
    id: String(match?.id ?? item.id),
    type: match ? "tmdb" : "douban",
    mediaType: item.type,
    title: item.title,
    releaseDate: item.year,
    rating: item.rating?.value === undefined ? undefined : String(item.rating.value),
    posterPath: images.poster,
    backdropPath: images.background,
  };
}

export async function getBasicCatalog(query: CatalogQuery): Promise<VideoItem[]> {
  const parsed = catalogQuerySchema.parse(query);
  const collectionId = getLatestYearlyRanking(parsed.collectionId)?.id ?? parsed.collectionId;
  const response = await rexFetch
    .get(`${DOUBAN_BASE}/subject_collection/${collectionId}/items`, {
      params: { start: parsed.skip, count: 20, apiKey: FRODO_KEY },
      headers: DOUBAN_HEADERS,
      successStatus: [200],
      schema: doubanSubjectCollectionSchema,
    })
    .catch(() => {
      throw new Error("Douban request failed");
    });
  if (!response.data) throw new Error("Douban request failed");
  const data = response.data;
  const items = data.subject_collection_items;
  if (items.length === 0) return [];
  return Promise.all(items.map((item) => toVideoItem(item)));
}

export async function fetchSearchItems(query: string, skip = 0): Promise<DoubanSubjectCollectionItem[]> {
  const q = query.trim();
  if (!q) throw new Error("搜索关键词不能为空");
  const response = await rexFetch
    .get(`${DOUBAN_BASE}/search/weixin`, {
      params: { q, start: skip, count: 20, apiKey: FRODO_KEY },
      headers: DOUBAN_HEADERS,
      successStatus: [200],
      schema: doubanSearchSchema,
    })
    .catch(() => {
      throw new Error("Douban request failed");
    });
  if (!response.data) throw new Error("Douban request failed");
  return response.data.items;
}

export async function fetchRecommendItems(
  type: "movie" | "tv",
  tags: string,
  sort: string,
  skip = 0,
): Promise<DoubanSubjectCollectionItem[]> {
  const response = await rexFetch
    .get(`${DOUBAN_BASE}/${type}/recommend`, {
      params: { tags, start: skip, count: 20, apiKey: FRODO_KEY, sort },
      headers: DOUBAN_HEADERS,
      successStatus: [200],
      schema: doubanRecommendSchema,
    })
    .catch(() => {
      throw new Error("Douban request failed");
    });
  if (!response.data) throw new Error("Douban request failed");
  return response.data.items;
}

export async function getBasicSearch(query: string, skip = 0): Promise<VideoItem[]> {
  const items = await fetchSearchItems(query, skip);
  if (items.length === 0) return [];
  return Promise.all(items.map((item) => toVideoItem(item)));
}
