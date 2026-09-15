import type { BridgeItem, CatalogQuery } from "@douban-bridge/contracts";
import { catalogResponseSchema } from "@douban-bridge/contracts";
import { getBasicCatalog } from "./basic";
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

export async function loadCatalog(query: CatalogQuery, sk: string, userId = ""): Promise<VideoItem[]> {
  if (sk) {
    try {
      const user = userId.trim();
      const response = await rexFetch.get(`${API_ORIGIN}/v1/catalog/${encodeURIComponent(query.collectionId)}`, {
        params: { skip: query.skip },
        headers: {
          Authorization: `Bearer ${sk}`,
          ...(user ? { "X-User-Id": user } : {}),
        },
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
