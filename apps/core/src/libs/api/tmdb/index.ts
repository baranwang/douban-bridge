import { SECONDS_PER_WEEK } from "@/libs/constants";
import { BaseAPI, CacheType } from "../base";
import { TMDB_IMAGE_LANGUAGE } from "./constants";
import { tmdbFindResultSchema, tmdbSearchResultSchema, tmdbSubjectImagesSchema } from "./schema";

export class TmdbAPI extends BaseAPI {
  constructor(apiKey?: string) {
    super({ baseURL: "https://api.themoviedb.org/3" });
    this.axios.interceptors.request.use((config) => {
      config.headers.set(
        "Authorization",
        `Bearer ${apiKey || this.context.env.TMDB_API_KEY || process.env.TMDB_API_KEY}`,
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
