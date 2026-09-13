import { sortBy } from "es-toolkit";

import type { DoubanSubjectCollectionItem } from "./api";
import { FanartAPI } from "./api/fanart";
import { TmdbAPI } from "./api/tmdb";
import { TMDB_IMAGE_LANGUAGE } from "./api/tmdb/constants";
import type { TmdbImageData } from "./api/tmdb/schema";

import type { ImageProvider } from "./config";

type DoubanInfo = Pick<DoubanSubjectCollectionItem, "cover" | "photos" | "type">;

export interface ImageUrls {
  poster: string | undefined;
  background: string | undefined;
  logo: string | undefined;
}

interface GenerateOptions {
  doubanInfo: DoubanInfo;
  tmdbId?: number | null;
  imdbId?: string | null;
}

interface ConstructorOptions {
  origin: string;
  userId?: string;
}

export class ImageUrlGenerator {
  private fanartAPI?: FanartAPI;
  private tmdbAPI?: TmdbAPI;

  constructor(
    private providers: ImageProvider[],
    private options: ConstructorOptions,
  ) {}

  async generate(options: GenerateOptions): Promise<ImageUrls> {
    const result: ImageUrls = {
      poster: undefined,
      background: undefined,
      logo: undefined,
    };

    for (const provider of this.providers) {
      const urls = await this.getUrlsForProvider(provider, options);
      this.mergeUrls(result, urls);
      if (Object.values(result).every(Boolean)) break;
    }

    return result;
  }

  private async getUrlsForProvider(provider: ImageProvider, options: GenerateOptions): Promise<ImageUrls | null> {
    const { doubanInfo, tmdbId, imdbId } = options;

    switch (provider.provider) {
      case "douban":
        return this.getDoubanUrls(doubanInfo);

      case "fanart": {
        const id = tmdbId?.toString() ?? imdbId;
        if (!id) return null;
        return this.getFanartUrls(id, doubanInfo.type, provider.extra);
      }

      case "tmdb":
        if (!tmdbId) return null;
        return this.getTmdbUrls(tmdbId, doubanInfo.type, provider.extra);

      default:
        return null;
    }
  }

  private mergeUrls(target: ImageUrls, source?: ImageUrls | null): void {
    if (!source) return;
    target.poster ||= source.poster;
    target.background ||= source.background;
    target.logo ||= source.logo;
  }

  // Douban
  private getDoubanUrls(info: DoubanInfo): ImageUrls {
    return {
      poster: this.applyProxy(info.cover),
      background: this.applyProxy(info.photos?.[0]),
      logo: undefined,
    };
  }

  private applyProxy(url: string | null | undefined): string | undefined {
    if (!url) return undefined;

    // 如果有 userId（说明是已配置用户），则使用代理
    // 具体的鉴权（是否 Star）由 /image-proxy 接口处理
    if (this.options.userId && this.options.userId.length > 0) {
      const encodedUrl = encodeURIComponent(url);
      return `${this.options.origin}/image-proxy/${this.options.userId}?url=${encodedUrl}`;
    }

    return url;
  }

  // Fanart
  private async getFanartUrls(
    id: string,
    type: "movie" | "tv",
    extra: ImageProvider<"fanart">["extra"],
  ): Promise<ImageUrls | null> {
    this.fanartAPI ??= new FanartAPI(extra.apiKey);
    return this.fanartAPI.getSubjectImages(type, id);
  }

  // TMDB
  private async getTmdbUrls(
    tmdbId: number,
    type: "movie" | "tv",
    extra: ImageProvider<"tmdb">["extra"],
  ): Promise<ImageUrls | null> {
    this.tmdbAPI ??= new TmdbAPI(extra.apiKey);
    try {
      const imageLanguages = extra.imageLanguages ?? TMDB_IMAGE_LANGUAGE;
      const images = await this.tmdbAPI.getSubjectImages(type, tmdbId, imageLanguages);
      if (!images) return null;

      return {
        poster: this.sortTmdbImages(images.posters, imageLanguages)?.[0]?.file_path || undefined,
        background: this.sortTmdbImages(images.backdrops, imageLanguages)?.[0]?.file_path || undefined,
        logo: this.sortTmdbImages(images.logos, imageLanguages)?.[0]?.file_path || undefined,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private sortTmdbImages(arr: TmdbImageData[], imageLanguages: string[]) {
    return sortBy(arr, [
      (item) => {
        // 组合语言和国家代码：如 iso_639_1="zh", iso_3166_1="CN" => "zh-CN"
        const langCode = item.iso_639_1 ?? "null";
        const countryCode = item.iso_3166_1;
        const fullLang = countryCode ? `${langCode}-${countryCode}` : langCode;

        // 1. 首先尝试精确匹配完整语言标签（如 zh-CN）
        let index = imageLanguages.indexOf(fullLang);
        if (index !== -1) return index;

        // 2. 尝试匹配纯语言代码（如 zh-TW 图片匹配 zh 规则）
        index = imageLanguages.indexOf(langCode);
        if (index !== -1) return index;

        return Infinity;
      },
      (item) => -(item.vote_average ?? 0),
      (item) => -(item.vote_count ?? 0),
    ]);
  }
}
