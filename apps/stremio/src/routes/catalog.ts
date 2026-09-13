import type { StremioCatalogItem } from "@douban-bridge/contracts/stremio";
import { Hono } from "hono";
import type { StremioEnv } from "../env";
import { coreGet } from "../libs/core-client";
import { matchResponseCache, putResponseCache } from "../libs/response-cache";
import { getExtraFactory, matchResourceRoute } from "../libs/router";

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 604800;

type CatalogMeta = {
  id: string;
  type: string;
  name: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  year?: string;
  genres: string[];
  links: StremioCatalogItem["links"];
  imdb_id?: string;
  tmdb_id?: string;
  tmdbId?: number;
};

export const catalogRoute = new Hono<StremioEnv>();

catalogRoute.get("*", async (c) => {
  const [matched, params] = matchResourceRoute(c.req.path);
  if (!matched) return c.notFound();

  const cached = await matchResponseCache(c, { namespace: "catalog" });
  if (cached) return cached;

  const getExtra = getExtraFactory(c, params.extra);
  const data = await coreGet<{ items: StremioCatalogItem[] }>(c.env, `/stremio/catalog/${params.id}`, {
    config: params.config,
    skip: getExtra("skip"),
    genre: getExtra("genre"),
    origin: new URL(c.req.url).origin,
  });

  const metas = data.items.map((item) => {
    const result: CatalogMeta = {
      id: `douban:${item.doubanId}`,
      type: item.mediaType === "tv" ? "series" : "movie",
      name: item.title,
      description: item.description,
      poster: item.images.poster ?? undefined,
      background: item.images.background ?? undefined,
      logo: item.images.logo ?? undefined,
      year: item.year,
      genres: item.genres,
      links: item.links,
    };
    if (item.imdbId) result.imdb_id = item.imdbId;
    if (item.tmdbId) {
      result.tmdb_id = `tmdb:${item.tmdbId}`;
      result.tmdbId = item.tmdbId;
    }
    return result;
  });

  const response = c.json({
    metas,
    cacheMaxAge: SECONDS_PER_DAY,
    staleRevalidate: SECONDS_PER_WEEK,
    staleError: SECONDS_PER_WEEK,
  });
  putResponseCache(c, response, { namespace: "catalog", ttl: SECONDS_PER_DAY });
  return response;
});
