import { SECONDS_PER_DAY } from "@/libs/constants";
import { isNumeric } from "@/libs/utils";
import { BaseAPI, CacheType } from "../base";
import { TmdbAPI } from "../tmdb";
import { fanartMovieResponseSchema, fanartTVResponseSchema } from "./schema";

declare module "axios" {
  interface InternalAxiosRequestConfig {
    retryCount?: number;
  }
}

export class FanartAPI extends BaseAPI {
  tmdbAPI = new TmdbAPI();

  constructor(clientKey?: string) {
    super({
      baseURL: "https://webservice.fanart.tv/v3.2",
    });
    this.axios.interceptors.request.use((config) => {
      config.params ||= {};
      config.params.api_key = this.context.env.FANART_API_KEY;
      if (clientKey) {
        config.params.client_key = clientKey;
      }
      return config;
    });
    this.axios.interceptors.response.use(async (response) => {
      if (response.status === 429) {
        const retryAfter = response.headers["retry-after"];
        const waitTime = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 1000;
        response.config.retryCount ||= 0;
        response.config.retryCount += 1;
        if (response.config.retryCount < 3) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return this.axios.request(response.config);
        }
        throw new Error(`fanart.tv API rate limit exceeded. Please wait ${waitTime / 1000}s before retrying.`);
      }
      return response;
    });
  }

  async getMovieImages(movieId: string) {
    const resp = await this.request({
      url: `/movies/${movieId}`,
      cache: {
        key: `fanart:movie:${movieId}`,
        ttl: SECONDS_PER_DAY,
        type: CacheType.LOCAL,
      },
    });
    return fanartMovieResponseSchema.parse(resp);
  }

  async getShowImages(tvId: string) {
    const resp = await this.request({
      url: `/tv/${tvId}`,
      cache: {
        key: `fanart:tv:${tvId}`,
        ttl: SECONDS_PER_DAY,
        type: CacheType.LOCAL,
      },
    });
    return fanartTVResponseSchema.parse(resp);
  }

  async getSubjectImages(type: "movie" | "tv", id?: string) {
    try {
      if (!id) {
        return null;
      }
      if (type === "movie") {
        const resp = await this.getMovieImages(id);
        return {
          poster: resp.movieposter?.[0]?.url,
          background: resp.moviebackground?.[0]?.url || resp.moviethumb?.[0]?.url,
          logo: resp.hdmovielogo?.[0]?.url || resp.movielogo?.[0]?.url,
        };
      } else {
        if (!isNumeric(id)) {
          return null;
        }
        const externalId = await this.tmdbAPI.getExternalId(type, Number(id));
        if (!externalId.tvdb_id) {
          return null;
        }
        const resp = await this.getShowImages(externalId.tvdb_id);
        return {
          poster: resp.tvposter?.[0]?.url,
          background: resp.showbackground?.[0]?.url,
          logo: resp.hdtvlogo?.[0]?.url,
        };
      }
    } catch {
      return null;
    }
  }
}
