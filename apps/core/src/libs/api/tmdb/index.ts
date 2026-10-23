import { resolveTmdbAccessToken, TMDB_IMAGE_LANGUAGE } from "@douban-bridge/contracts/image-providers";
import { SECONDS_PER_WEEK } from "@/libs/constants";
import { BaseAPI, CacheType } from "../base";
import { tmdbFindResultSchema, tmdbSearchResultSchema, tmdbSubjectImagesSchema } from "./schema";

type TmdbCreditJob = { job?: string | null; episode_count?: number | null };

type TmdbCreditPerson = {
  name?: string | null;
  job?: string | null;
  total_episode_count?: number | null;
  jobs?: TmdbCreditJob[] | null;
};

function creditNames(people: TmdbCreditPerson[] | undefined, job?: string): string[] {
  const ranked: Array<{ name: string; episodes: number; index: number }> = [];
  for (const [index, person] of (people ?? []).entries()) {
    const matches = job
      ? [
          ...(person.jobs ?? []).filter((item) => item.job === job),
          ...(person.job === job ? [{ episode_count: person.total_episode_count }] : []),
        ]
      : [];
    if (job && matches.length === 0) continue;
    const name = person.name?.trim();
    if (!name) continue;
    const episodes = matches.reduce((sum, item) => sum + (item.episode_count ?? 0), 0);
    const existing = ranked.find((item) => item.name === name);
    if (existing) {
      existing.episodes = Math.max(existing.episodes, episodes);
      continue;
    }
    ranked.push({ name, episodes, index });
  }
  ranked.sort((a, b) => b.episodes - a.episodes || a.index - b.index);
  return ranked.map((item) => item.name);
}

export class TmdbAPI extends BaseAPI {
  constructor(apiKey?: string) {
    super({ baseURL: "https://api.themoviedb.org/3" });
    this.axios.interceptors.request.use((config) => {
      config.headers.set(
        "Authorization",
        `Bearer ${resolveTmdbAccessToken(apiKey, this.context.env.TMDB_API_KEY || process.env.TMDB_API_KEY)}`,
      );
      return config;
    });
  }

  async search(type: "movie" | "tv", params: { query: string; year?: string }) {
    const resp = await this.request({
      url: `/search/${type}`,
      params,
    });
    return tmdbSearchResultSchema.parse(resp);
  }

  async findById(
    externalId: string,
    externalSource:
      | "imdb_id"
      | "facebook_id"
      | "instagram_id"
      | "tvdb_id"
      | "tiktok_id"
      | "twitter_id"
      | "wikidata_id"
      | "youtube_id",
  ) {
    const resp = await this.request({
      url: `/find/${externalId}`,
      params: {
        external_source: externalSource,
        language: "zh-CN",
      },
    });
    return tmdbFindResultSchema.parse(resp);
  }

  async getPoster(type: "movie" | "tv", id: number) {
    const data = await this.request<{ poster_path?: string | null }>({
      url: `/${type}/${id}`,
      params: { language: "zh-CN" },
      cache: {
        key: `tmdb:${type}:${id}:poster:zh-CN`,
        ttl: SECONDS_PER_WEEK,
        type: CacheType.LOCAL,
      },
    });
    return data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
  }

  async getCredits(type: "movie" | "tv", id: number) {
    // TV series /credits omits most episode directors; aggregate_credits includes them.
    const data = await this.request<{ cast?: TmdbCreditPerson[]; crew?: TmdbCreditPerson[] }>({
      url: type === "tv" ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`,
      params: { language: "zh-CN" },
      cache: {
        key: `tmdb:${type}:${id}:credits:zh-CN`,
        ttl: SECONDS_PER_WEEK,
        type: CacheType.LOCAL,
      },
    });
    return { directors: creditNames(data.crew, "Director"), actors: creditNames(data.cast) };
  }

  getExternalId(type: "movie" | "tv", id: number) {
    return this.request<{
      id: number;
      imdb_id: string;
      tvdb_id: string;
    }>({
      url: `/${type}/${id}/external_ids`,
      cache: {
        key: `tmdb:${type}:${id}:external_ids`,
        ttl: SECONDS_PER_WEEK,
        type: CacheType.LOCAL,
      },
    });
  }

  async getSubjectImages(type: "movie" | "tv", id: number, imageLanguages?: string[]) {
    const languages = imageLanguages ?? TMDB_IMAGE_LANGUAGE;
    const resp = await this.request({
      url: `/${type}/${id}/images`,
      params: {
        include_image_language: languages.join(","),
      },
      cache: {
        key: `tmdb:${type}:${id}:images:${languages.join(",")}`,
        ttl: SECONDS_PER_WEEK,
        type: CacheType.LOCAL,
      },
    });
    return tmdbSubjectImagesSchema.parse(resp);
  }
}
