import type { AddonBuilder, MetaDetail } from "@stremio-addon/sdk";
import { type Env, Hono } from "hono";
import { api } from "@/libs/api";
import { getLatestYearlyRanking, isYearlyRankingId } from "@/libs/collections";
import { getConfig } from "@/libs/config";
import { SECONDS_PER_DAY, SECONDS_PER_WEEK } from "@/libs/constants";
import { ImageUrlGenerator } from "@/libs/images";
import { matchResponseCache, putResponseCache } from "@/libs/response-cache";
import { getExtraFactory, matchResourceRoute } from "@/libs/router";
import { generateId, isForwardUserAgent } from "@/libs/utils";

type CatalogResponse = Awaited<ReturnType<Parameters<AddonBuilder["defineCatalogHandler"]>[0]>>;
type CatalogMeta = MetaDetail &
  Record<string, unknown> & {
    imdb_id?: string;
    tmdb_id?: string;
    tmdbId?: number;
  };

export const catalogRoute = new Hono<Env>();

catalogRoute.get("*", async (c) => {
  const [matched, params] = matchResourceRoute(c.req.path);

  if (!matched) {
    return c.notFound();
  }

  const uaVariant = isForwardUserAgent(c) ? "forward" : "standard";
  const cached = await matchResponseCache(c, { namespace: "catalog", uaVariant });
  if (cached) {
    return cached;
  }

  const config = await getConfig(c.env, params.config);

  const getExtra = getExtraFactory(c, params.extra);

  // 获取豆瓣合集数据
  let collectionId = params.id;
  if (isYearlyRankingId(collectionId)) {
    const latest = getLatestYearlyRanking(collectionId);
    if (!latest) {
      return c.notFound();
    }
    collectionId = latest.id;
  }

  const genre = getExtra("genre");
  if (genre) {
    const category = await api.doubanAPI.getSubjectCollectionCategory(collectionId).catch(() => null);
    const cid = category?.items?.find((item) => item.name === genre)?.id;
    if (cid) {
      collectionId = cid;
    }
  }
  const skip = getExtra("skip") ?? 0;
  const collectionData = await api.doubanAPI.getSubjectCollectionItems(collectionId, skip);
  if (!collectionData) {
    return c.notFound();
  }

  const items = collectionData.subject_collection_items;
  if (items.length === 0) {
    const response = c.json({
      metas: [],
      cacheMaxAge: SECONDS_PER_DAY,
      staleRevalidate: SECONDS_PER_WEEK,
      staleError: SECONDS_PER_WEEK,
    } satisfies CatalogResponse);
    putResponseCache(c, response, { namespace: "catalog", uaVariant, ttl: SECONDS_PER_DAY });
    return response;
  }

  const collectionMap = new Map(items.map((item) => [item.id, item]));
  const doubanIds = Array.from(collectionMap.keys());
  const { mappingCache, missingIds } = await api.fetchIdMapping(doubanIds);

  const newMappings = await Promise.all(
    missingIds.map(async (doubanId) => {
      const item = collectionMap.get(doubanId);
      if (!item) {
        return null;
      }
      return api.findExternalId({
        doubanId,
        type: item.type,
        title: item.title,
      });
    }),
  );

  // 更新本地缓存
  for (const item of newMappings) {
    if (item?.doubanId) {
      mappingCache.set(item.doubanId, item);
    }
  }

  // 后台异步写入数据库，不阻塞响应
  c.executionCtx.waitUntil(api.persistIdMapping(newMappings, false));

  const isInForward = uaVariant === "forward";

  const imageUrlGenerator = new ImageUrlGenerator(config.imageProviders, {
    origin: new URL(c.req.url).origin,
    userId: params.config,
  });

  // 构建响应
  const metas = await Promise.all(
    items.map(async (item) => {
      const mapping = mappingCache.get(item.id);
      const { imdbId, tmdbId } = mapping ?? {};
      const [, , genres] = item.card_subtitle?.split("/") ?? [];
      const images = await imageUrlGenerator.generate({
        doubanInfo: item,
        tmdbId,
        imdbId,
      });
      const result: CatalogMeta = {
        id: `douban:${item.id}`,
        type: item.type === "tv" ? "series" : "movie",
        name: item.title,
        description: item.description ?? item.card_subtitle ?? undefined,
        poster: images.poster,
        background: images.background,
        logo: images.logo,
        year: item.year,
        genres: genres?.trim().split(" ") ?? [],
        links: [{ name: `豆瓣评分：${item.rating?.value ?? "N/A"}`, category: "douban", url: item.url ?? "#" }],
      };
      if (imdbId) {
        result.imdb_id = imdbId;
      }
      if (tmdbId) {
        if (isInForward) {
          result.tmdb_id = `tmdb:${tmdbId}`;
        } else {
          result.tmdbId = tmdbId;
        }
      }
      if (isInForward) {
        result.id = generateId({ doubanId: item.id, imdbId, tmdbId });
      }
      return result;
    }),
  );

  const response = c.json({
    metas,
    cacheMaxAge: SECONDS_PER_DAY,
    staleRevalidate: SECONDS_PER_WEEK,
    staleError: SECONDS_PER_WEEK,
  } satisfies CatalogResponse);
  putResponseCache(c, response, { namespace: "catalog", uaVariant, ttl: SECONDS_PER_DAY });
  return response;
});
