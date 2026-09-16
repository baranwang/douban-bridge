import type { CatalogQuery } from "@douban-bridge/contracts";
import type { DoubanSubjectCollectionItem } from "@douban-bridge/contracts/douban";
import type { StremioCatalogItem } from "@douban-bridge/contracts/stremio";
import axios from "axios";
import { HTTPException } from "hono/http-exception";
import { api } from "@/libs/api";
import { getLatestYearlyRanking, isYearlyRankingId } from "@/libs/collections";
import type { Config } from "@/libs/config";
import { ImageUrlGenerator } from "@/libs/images";
import { getContext } from "@/libs/middleware";

export type ImageContext = {
  providers: Config["imageProviders"];
  origin: string;
  configId?: string;
};

function mapSourceError(error: unknown): never {
  if (error instanceof HTTPException) throw error;
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    throw new HTTPException(404);
  }
  throw new HTTPException(502);
}

export async function getCatalogPage(query: CatalogQuery, images: ImageContext): Promise<StremioCatalogItem[]> {
  let collectionId = query.collectionId;
  if (isYearlyRankingId(collectionId)) {
    const latest = getLatestYearlyRanking(collectionId);
    if (!latest) {
      throw new HTTPException(404);
    }
    collectionId = latest.id;
  }

  const genre = query.genre;
  if (genre) {
    const category = await api.doubanAPI.getSubjectCollectionCategory(collectionId).catch(() => null);
    const cid = category?.items?.find((item) => item.name === genre)?.id;
    if (cid) {
      collectionId = cid;
    }
  }

  let collectionData: Awaited<ReturnType<typeof api.doubanAPI.getSubjectCollectionItems>>;
  try {
    collectionData = await api.doubanAPI.getSubjectCollectionItems(collectionId, query.skip);
  } catch (error) {
    mapSourceError(error);
  }
  if (!collectionData) {
    throw new HTTPException(404);
  }

  return enrichCatalogItems(collectionData.subject_collection_items, images);
}

export async function enrichCatalogItems(
  items: DoubanSubjectCollectionItem[],
  images: ImageContext,
): Promise<StremioCatalogItem[]> {
  if (items.length === 0) return [];

  const sourceById = new Map(items.map((item) => [item.id, item]));
  const { mappingCache, missingIds } = await api.fetchIdMapping([...sourceById.keys()]);
  const newMappings = await Promise.all(
    missingIds.map(async (doubanId) => {
      const source = sourceById.get(doubanId)!;
      try {
        return await api.findExternalId({ doubanId, type: source.type, title: source.title });
      } catch {
        return { doubanId, tmdbId: null, imdbId: null, traktId: null };
      }
    }),
  );
  for (const mapping of newMappings) mappingCache.set(mapping.doubanId, mapping);
  getContext().ctx.waitUntil(api.persistIdMapping(newMappings, false));

  const generator = new ImageUrlGenerator(images.providers, {
    origin: images.origin,
    userId: images.configId,
  });
  return Promise.all(
    items.map(async (item) => {
      const mapping = mappingCache.get(item.id);
      const picture = await generator.generate({
        doubanInfo: item,
        tmdbId: mapping?.tmdbId,
        imdbId: mapping?.imdbId,
      });
      const genres = item.card_subtitle?.split("/")[2]?.trim().split(" ") ?? [];
      return {
        doubanId: item.id,
        mediaType: item.type,
        title: item.title,
        description: item.description ?? item.card_subtitle ?? undefined,
        year: item.year ?? undefined,
        rating: item.rating?.value ?? undefined,
        tmdbId: mapping?.tmdbId ?? null,
        imdbId: mapping?.imdbId ?? null,
        images: {
          poster: picture.poster ?? null,
          background: picture.background ?? null,
          logo: picture.logo ?? null,
        },
        genres,
        links: [{ name: `豆瓣评分：${item.rating?.value ?? "N/A"}`, category: "douban", url: item.url ?? "#" }],
      };
    }),
  );
}

export async function getItemsByIds(ids: number[], images: ImageContext): Promise<StremioCatalogItem[]> {
  const unique = [...new Set(ids)];
  const sources = await Promise.all(
    unique.map(async (id) => {
      try {
        const data = await api.doubanAPI.getSubjectDetail(id);
        return {
          id: data.id,
          type: data.type,
          title: data.title,
          original_title: data.original_title,
          year: data.year,
          cover: data.cover_url || data.pic?.large || data.pic?.normal,
          cover_url: data.cover_url,
          pic: data.pic,
          rating: data.rating,
          url: data.url,
        } as DoubanSubjectCollectionItem;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        mapSourceError(error);
      }
    }),
  );
  const found = new Map(
    sources.filter((item): item is DoubanSubjectCollectionItem => item !== null).map((item) => [item.id, item]),
  );
  return enrichCatalogItems(
    ids.map((id) => found.get(id)).filter((item): item is DoubanSubjectCollectionItem => item !== undefined),
    images,
  );
}
