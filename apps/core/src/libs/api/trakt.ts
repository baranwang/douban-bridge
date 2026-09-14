import { ADDON } from "@douban-bridge/contracts/addon";
import { type SearchMovieResultResponse, type SearchShowResultResponse, Environment as TraktBaseUrl } from "@trakt/api";
import { z } from "zod/v4";
import type { DoubanIdMapping } from "@/db";
import { SECONDS_PER_DAY } from "../constants";
import { BaseAPI } from "./base";

const idsSchema = z
  .object({
    trakt: z.number().optional(),
    tmdb: z.number().nullable().optional(),
    imdb: z.string().nullable().optional(),
  })
  .passthrough();

const titleSchema = z
  .object({
    title: z.string().optional(),
    original_title: z.string().optional(),
    year: z.number().optional(),
    ids: idsSchema.optional(),
  })
  .passthrough();

const searchResultResponseSchemaWithEpisode = z.union([
  z.object({ type: z.literal("movie"), movie: titleSchema.optional(), score: z.number().optional() }).passthrough(),
  z.object({ type: z.literal("show"), show: titleSchema.optional(), score: z.number().optional() }).passthrough(),
  z
    .object({
      type: z.literal("episode"),
      show: titleSchema.optional(),
      episode: z.unknown().optional(),
      score: z.number().optional(),
    })
    .passthrough(),
]);

export type SearchResultResponse = z.output<typeof searchResultResponseSchemaWithEpisode>;

export class TraktAPI extends BaseAPI {
  constructor() {
    super({ baseURL: TraktBaseUrl.production });
    this.axios.interceptors.request.use((config) => {
      config.headers.set("trakt-api-version", "2");
      config.headers.set("trakt-api-key", this.context.env.TRAKT_CLIENT_ID || process.env.TRAKT_CLIENT_ID);
      config.headers.set("User-Agent", `${ADDON.id}/${ADDON.version}`);
      return config;
    });
  }

  getSearchResultField<T extends "ids" | "title" | "original_title" | "year">(data: SearchResultResponse, field: T) {
    if (data.type === "show" || data.type === "episode") {
      return data.show?.[field];
    }
    if (data.type === "movie") {
      return data.movie?.[field];
    }
    return null;
  }

  formatIdsToIdMapping(
    ids?:
      | NonNullable<SearchMovieResultResponse["movie"]>["ids"]
      | NonNullable<SearchShowResultResponse["show"]>["ids"]
      | null,
  ): Omit<DoubanIdMapping, "doubanId" | "calibrated"> | null {
    if (!ids) return null;
    return {
      traktId: ids.trakt ?? null,
      tmdbId: ids.tmdb ?? null,
      imdbId: ids.imdb ?? null,
    };
  }

  async search(type: "movie" | "show" | "episode", query: string) {
    const resp = await this.request<SearchResultResponse[]>({
      url: `/search/${type}`,
      params: { query },
      cache: { key: `trakt:search:${type}:${query}`, ttl: SECONDS_PER_DAY },
    });
    return z.array(searchResultResponseSchemaWithEpisode).parse(resp);
  }

  async searchByImdbId(imdbId: string) {
    const resp = await this.request<SearchResultResponse[]>({
      url: `/search/imdb/${imdbId}`,
      cache: { key: `trakt:search:imdb:${imdbId}`, ttl: SECONDS_PER_DAY },
    });
    return z.array(searchResultResponseSchemaWithEpisode).parse(resp);
  }

  async searchByTmdbId(tmdbId: string) {
    const resp = await this.request<SearchResultResponse[]>({
      url: `/search/tmdb/${tmdbId}`,
      cache: { key: `trakt:search:tmdb:${tmdbId}`, ttl: SECONDS_PER_DAY },
    });
    return z.array(searchResultResponseSchemaWithEpisode).parse(resp);
  }
}
