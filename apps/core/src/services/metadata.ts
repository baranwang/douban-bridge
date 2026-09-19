import type { StremioDetailItem } from "@douban-bridge/contracts/stremio";
import axios from "axios";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { doubanMapping } from "@/db";
import { persistAndEnqueueUnmatched } from "@/libs/agent-match/pool";
import { api } from "@/libs/api";
import { ImageUrlGenerator } from "@/libs/images";
import { getContext } from "@/libs/middleware";
import type { ImageContext } from "./catalog";

function mapSourceError(error: unknown): never {
  if (error instanceof HTTPException) throw error;
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    throw new HTTPException(404);
  }
  throw new HTTPException(502);
}

async function loadMeta(doubanId: number, images: ImageContext, enrich: boolean): Promise<StremioDetailItem> {
  let data: Awaited<ReturnType<typeof api.doubanAPI.getSubjectDetail>>;
  try {
    data = await api.doubanAPI.getSubjectDetail(doubanId);
  } catch (error) {
    mapSourceError(error);
  }
  if (!data) {
    throw new HTTPException(404);
  }

  let tmdbId: number | null = null;
  let imdbId: string | null = null;

  if (enrich) {
    const { mappingCache, missingIds } = await api.fetchIdMapping([doubanId]);
    const newMappings = await Promise.all(
      missingIds.map(async (id) => {
        try {
          return await api.findExternalId({ doubanId: id, type: data.type, title: data.title });
        } catch {
          return { doubanId: id, tmdbId: null, imdbId: null, traktId: null };
        }
      }),
    );
    for (const mapping of newMappings) mappingCache.set(mapping.doubanId, mapping);
    if (newMappings.length > 0) {
      getContext().ctx.waitUntil(persistAndEnqueueUnmatched(newMappings));
    }
    const mapping = mappingCache.get(doubanId);
    tmdbId = mapping?.tmdbId ?? null;
    imdbId = mapping?.imdbId ?? null;
  } else {
    const dbData = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, doubanId) });
    if (!dbData) {
      getContext().ctx.waitUntil(api.db.insert(doubanMapping).values({ doubanId }));
    }
    tmdbId = dbData?.tmdbId ?? null;
    imdbId = dbData?.imdbId ?? null;
  }

  const generator = new ImageUrlGenerator(images.providers, {
    origin: images.origin,
    userId: images.configId,
  });
  const picture = await generator.generate({
    doubanInfo: {
      cover: data.cover_url || data.pic?.large || data.pic?.normal || "",
      type: data.type,
    },
    tmdbId,
    imdbId,
  });

  return {
    doubanId: data.id,
    mediaType: data.type,
    title: data.title,
    description: data.intro ?? undefined,
    year: data.year ?? undefined,
    rating: data.rating?.value ?? undefined,
    tmdbId,
    imdbId,
    images: {
      poster: picture.poster ?? null,
      background: picture.background ?? null,
      logo: picture.logo ?? null,
    },
    actors: (data.actors ?? []).map((x) => x.name),
    directors: (data.directors ?? []).map((x) => x.name),
    genres: data.genres ?? [],
    links: [
      { name: `豆瓣评分：${data.rating?.value ?? "N/A"}`, category: "douban", url: data.url ?? "" },
      ...data.linewatches.map((item) => ({
        name: item.source.name,
        category: "linewatches",
        url: item.source_uri ?? "",
      })),
      ...(data.directors ?? []).map((item) => ({ name: item.name, category: "director", url: "#" })),
      ...(data.actors ?? []).map((item) => ({ name: item.name, category: "actor", url: "#" })),
    ],
    language: data.languages?.join(" / "),
    country: data.countries?.join(" / "),
    awards: data.honor_infos?.map((item) => item.title).join(" / "),
  };
}

export const getCloudMeta = (id: number, images: ImageContext) => loadMeta(id, images, true);
export const getStremioMeta = (id: number, images: ImageContext) => loadMeta(id, images, false);
