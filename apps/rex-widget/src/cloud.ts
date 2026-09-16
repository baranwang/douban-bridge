import type { BridgeItem, CatalogQuery } from "@douban-bridge/contracts";
import { catalogResponseSchema } from "@douban-bridge/contracts";
import type { DoubanSubjectCollectionItem } from "@douban-bridge/contracts/douban";
import { fetchRecommendItems, fetchSearchItems, getBasicCatalog, toVideoItem as toBasicVideoItem } from "./basic";
import { rexFetch } from "./http";

const API_ORIGIN = "https://douban-bridge.baran.wang";
const TMDB_ORIGINAL = "https://image.tmdb.org/t/p/original";

function hostImagePath(url?: string | null) {
  return url?.startsWith(TMDB_ORIGINAL) ? url.slice(TMDB_ORIGINAL.length) : (url ?? undefined);
}

function toVideoItem(item: BridgeItem): VideoItem {
  return {
    id: String(item.tmdbId ?? item.imdbId ?? item.doubanId),
    type: item.tmdbId ? "tmdb" : item.imdbId ? "imdb" : "douban",
    title: item.title,
    mediaType: item.mediaType,
    posterPath: hostImagePath(item.images.poster),
    backdropPath: hostImagePath(item.images.background),
    rating: item.rating === undefined ? undefined : String(item.rating),
    releaseDate: item.year,
    genreTitle: item.genres?.filter(Boolean).join(", ") || undefined,
  };
}

function cloudHeaders(sk: string, userId: string) {
  const user = userId.trim();
  return {
    Authorization: `Bearer ${sk}`,
    ...(user ? { "X-User-Id": user } : {}),
  };
}

export async function loadCatalog(query: CatalogQuery, sk: string, userId = ""): Promise<VideoItem[]> {
  if (sk) {
    try {
      const response = await rexFetch.get(`${API_ORIGIN}/v1/catalog/${encodeURIComponent(query.collectionId)}`, {
        params: { skip: query.skip },
        headers: cloudHeaders(sk, userId),
        successStatus: [200],
        schema: catalogResponseSchema,
      });
      if (!response.data) throw new Error("Cloud unavailable");
      return response.data.items.map(toVideoItem);
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return await getBasicCatalog(query);
}

async function enrichItems(sources: DoubanSubjectCollectionItem[], sk: string, userId = ""): Promise<VideoItem[]> {
  if (sources.length === 0) return [];
  if (sk) {
    try {
      const response = await rexFetch.post(
        `${API_ORIGIN}/v1/items`,
        { ids: sources.map((item) => item.id) },
        {
          headers: cloudHeaders(sk, userId),
          successStatus: [200],
          schema: catalogResponseSchema,
        },
      );
      if (!response.data) throw new Error("Cloud unavailable");
      const matched = new Map(response.data.items.map((item) => [item.doubanId, toVideoItem(item)]));
      return Promise.all(sources.map(async (item) => matched.get(item.id) ?? (await toBasicVideoItem(item))));
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return Promise.all(sources.map((item) => toBasicVideoItem(item)));
}

export async function loadSearch(query: string, sk: string, userId = ""): Promise<VideoItem[]> {
  return enrichItems(await fetchSearchItems(query), sk, userId);
}

export async function loadRecommend(
  type: "movie" | "tv",
  tags: string,
  sort: string,
  skip: number,
  sk: string,
  userId = "",
): Promise<VideoItem[]> {
  return enrichItems(await fetchRecommendItems(type, tags, sort, skip), sk, userId);
}
