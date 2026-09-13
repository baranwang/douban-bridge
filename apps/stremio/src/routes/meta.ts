import type { StremioDetailItem } from "@douban-bridge/contracts/stremio";
import { Hono } from "hono";
import type { StremioEnv } from "../env";
import { coreGet } from "../libs/core-client";
import { matchResponseCache, putResponseCache } from "../libs/response-cache";
import { matchResourceRoute } from "../libs/router";

export const idPrefixes = ["douban:"];
const idPrefixRegex = new RegExp(`^(${idPrefixes.join("|")})`);

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 604800;

type MetaResponse = {
  id: string;
  type: string;
  name: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  genres: string[];
  links: StremioDetailItem["links"];
  language?: string;
  country?: string;
  awards?: string;
  imdb_id?: string;
  tmdb_id?: string;
  tmdbId?: number;
  behaviorHints: { defaultVideoId?: string };
};

export const metaRoute = new Hono<StremioEnv>();

metaRoute.get("*", async (c) => {
  const [matched, params] = matchResourceRoute(c.req.path);
  if (!matched) return c.notFound();
  const metaId = params.id;
  if (!idPrefixRegex.test(metaId)) return c.notFound();

  let doubanId: string | undefined;
  if (metaId.startsWith("douban:")) {
    doubanId = metaId.slice("douban:".length);
  }
  if (!doubanId || !/^[1-9]\d*$/.test(doubanId)) return c.notFound();

  const cached = await matchResponseCache(c, { namespace: "meta" });
  if (cached) return cached;

  const { item } = await coreGet<{ item: StremioDetailItem }>(c.env, `/stremio/meta/${doubanId}`, {
    config: params.config,
    origin: new URL(c.req.url).origin,
  });

  const meta: MetaResponse = {
    id: `douban:${item.doubanId}`,
    type: item.mediaType === "tv" ? "series" : "movie",
    name: item.title,
    description: item.description,
    poster: item.images.poster ?? undefined,
    background: item.images.background ?? undefined,
    logo: item.images.logo ?? undefined,
    genres: item.genres,
    links: item.links,
    language: item.language,
    country: item.country,
    awards: item.awards,
    behaviorHints: {},
  };
  if (item.tmdbId) {
    meta.tmdb_id = `tmdb:${item.tmdbId}`;
    meta.tmdbId = item.tmdbId;
    meta.behaviorHints.defaultVideoId = `tmdb:${item.tmdbId}`;
  }
  if (item.imdbId) {
    meta.imdb_id = item.imdbId;
    meta.behaviorHints.defaultVideoId = item.imdbId;
  }

  const response = c.json({
    meta,
    cacheMaxAge: SECONDS_PER_DAY,
    staleRevalidate: SECONDS_PER_WEEK,
    staleError: SECONDS_PER_WEEK,
  });
  putResponseCache(c, response, { namespace: "meta", ttl: SECONDS_PER_DAY });
  return response;
});
