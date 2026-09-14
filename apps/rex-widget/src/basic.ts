import { type BridgeItem, type CatalogQuery, catalogQuerySchema } from "@douban-bridge/contracts";
import { getLatestYearlyRanking } from "@douban-bridge/contracts/collections";
import { type DoubanSubjectCollectionItem, doubanSubjectCollectionSchema } from "@douban-bridge/contracts/douban";
import { z } from "zod/v4";

const DOUBAN_BASE = "https://m.douban.com/rexxar/api/v2";
const DOUBAN_HEADERS = {
  Referer: "https://m.douban.com/",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
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

async function doubanGet(path: string): Promise<unknown> {
  const response = await Widget.http.get(`${DOUBAN_BASE}/${path}`, { headers: DOUBAN_HEADERS });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("Douban request failed");
  return response.data;
}

function tmdbImage(path?: string | null): string | null {
  return path ? `https://image.tmdb.org/t/p/original${path}` : null;
}

function projectImages(
  source: {
    cover?: string | null;
    cover_url?: string | null;
    photos?: string[] | null;
    pic?: { large?: string | null; normal?: string | null } | null;
  },
  match: BasicTmdbMatch | null,
): BridgeItem["images"] {
  return {
    poster:
      tmdbImage(match?.poster_path) ??
      source.cover ??
      source.cover_url ??
      source.pic?.large ??
      source.pic?.normal ??
      null,
    background: tmdbImage(match?.backdrop_path) ?? source.photos?.[0] ?? null,
    logo: null,
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

async function toBridgeItem(item: DoubanSubjectCollectionItem): Promise<BridgeItem> {
  const match = await findBasicTmdb({
    type: item.type,
    title: item.title,
    original_title: item.original_title,
    year: item.year,
  }).catch(() => null);
  return {
    doubanId: item.id,
    mediaType: item.type,
    title: item.title,
    description: item.description ?? undefined,
    year: item.year ?? undefined,
    rating: item.rating?.value ?? undefined,
    tmdbId: match?.id ?? null,
    imdbId: null,
    images: projectImages(item, match),
  };
}

export async function getBasicCatalog(query: CatalogQuery): Promise<BridgeItem[]> {
  const parsed = catalogQuerySchema.parse(query);
  const collectionId = getLatestYearlyRanking(parsed.collectionId)?.id ?? parsed.collectionId;
  const data = doubanSubjectCollectionSchema.parse(
    await doubanGet(`subject_collection/${collectionId}/items?start=${parsed.skip}&count=20`),
  );
  const items = data.subject_collection_items;
  if (items.length === 0) return [];
  return Promise.all(items.map((item) => toBridgeItem(item)));
}
