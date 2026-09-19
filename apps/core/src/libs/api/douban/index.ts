import axios from "axios";
import { load as cheerioLoad } from "cheerio";
import { and, isNull, ne, or } from "drizzle-orm";
import { z } from "zod/v4";
import { doubanMapping } from "@/db";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_WEEK } from "../../constants";
import { BaseAPI, CacheType } from "../base";
import {
  type DoubanSubjectCollectionCategory,
  doubanModulesSchema,
  doubanSubjectCollectionCategorySchema,
  doubanSubjectCollectionInfoSchema,
  doubanSubjectCollectionSchema,
  doubanSubjectDetailSchema,
} from "./schema";

export class DoubanAPI extends BaseAPI {
  static PAGE_SIZE = 20;

  static BASE_HEADERS = {
    Referer: "https://servicewechat.com/wx2f9b06c1de1ccfca/99/page-frame.html",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.7(0x13080712) UnifiedPCMacWechat(0xf264101d) XWEB/16390",
  };

  constructor() {
    super({
      baseURL: "https://frodo.douban.com/api/v2",
      headers: {
        ...DoubanAPI.BASE_HEADERS,
      },
    });
    this.axios.interceptors.request.use(async (config) => {
      const finalUri = axios.getUri(config);
      if (finalUri.startsWith("https://frodo.douban.com/")) {
        config.params ||= {};
        config.params.apiKey = this.apiKey;
      }
      return config;
    });
  }

  private get apiKey() {
    return this.context.env.DOUBAN_API_KEY || process.env.DOUBAN_API_KEY;
  }

  async getSubjectCollection(collectionId: string) {
    const resp = await this.request({
      url: `/subject_collection/${collectionId}`,
      params: {
        for_mobile: 1,
      },
      cache: {
        key: `subject_collection_info:${collectionId}`,
        ttl: SECONDS_PER_WEEK,
      },
    });
    return doubanSubjectCollectionInfoSchema.parse(resp);
  }

  async getSubjectCollectionCategory(collectionId: string) {
    const getCacheKey = (collectionId: string) => `subject_collection_category:${collectionId}`;
    const cacheKey = getCacheKey(collectionId);

    const cached = await this.getCache<DoubanSubjectCollectionCategory>(getCacheKey(collectionId), {
      type: CacheType.LOCAL,
    });
    if (cached) {
      console.info("⚡️ Cache Hit", cacheKey);
      return doubanSubjectCollectionCategorySchema.parse(cached);
    }

    // 获取 collection 信息
    const info = await this.getSubjectCollection(collectionId).catch(() => null);
    const tabs = info?.category_tabs ?? [];
    if (tabs.length === 0) {
      return null;
    }

    let category: DoubanSubjectCollectionCategory = null;
    for (const tab of tabs) {
      const isCurrent = tab?.items?.some((item) => item.current);
      if (isCurrent) {
        category = tab;
        break; // 找到当前 category 后不再预热其他 category
      }

      for (const item of tab?.items ?? []) {
        if (item.id) {
          this.setCache(getCacheKey(item.id), tab, {
            type: CacheType.LOCAL,
            ttl: SECONDS_PER_WEEK * 4,
          });
        }
      }
    }

    return category;
  }

  async getSubjectCollectionItems(collectionId: string, skip: string | number = 0) {
    const resp = await this.request({
      url: `/subject_collection/${collectionId}/items`,
      params: {
        start: skip,
        count: DoubanAPI.PAGE_SIZE,
      },
      cache: {
        type: CacheType.LOCAL,
        key: `subject_collection:${collectionId}:${skip}`,
        ttl: SECONDS_PER_HOUR * 2,
      },
    });
    return doubanSubjectCollectionSchema.parse(resp);
  }

  async getSubjectDetail(subjectId: string | number) {
    const resp = await this.request({
      url: `/subject/${subjectId}`,
      cache: {
        type: CacheType.LOCAL,
        key: `subject_detail:${subjectId}`,
        ttl: SECONDS_PER_DAY,
      },
    });
    return doubanSubjectDetailSchema.parse(resp);
  }

  async getSubjectDetailDesc(subjectId: string | number) {
    const resp = await this.request<{ html: string }>({
      url: `/subject/${subjectId}/desc`,
      cache: {
        key: `subject_detail_desc:${subjectId}`,
        ttl: SECONDS_PER_DAY,
        type: CacheType.LOCAL,
      },
    });
    const $ = cheerioLoad(resp.html);
    const info = Array.from($(".subject-desc table").find("tr")).map((el) => {
      const $el = $(el);
      const key = $el.find("td:first-child").text().trim();
      const value = $el.find("td:last-child").text().trim();
      return [key, value];
    });
    return Object.fromEntries(info) as Record<string, string>;
  }

  async getIdByImdbId(imdbId: string) {
    const resp = await this.request<{ id: string }>({
      url: `https://api.douban.com/v2/movie/imdb/${imdbId}`,
      method: "POST",
      data: {
        apikey: this.apiKey,
      },
      cache: {
        key: `douban_id_by_imdb_id:${imdbId}`,
        ttl: SECONDS_PER_DAY,
      },
    });
    const doubanId = z.coerce.number().parse(resp.id?.split("/")?.pop());
    try {
      this.context.ctx.waitUntil(
        this.db
          .insert(doubanMapping)
          .values({ imdbId, doubanId })
          .onConflictDoUpdate({
            target: doubanMapping.doubanId,
            set: { imdbId },
            setWhere: and(
              isNull(doubanMapping.deletedAt),
              or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
            ),
          }),
      );
    } catch {}
    return doubanId;
  }

  async getModules(type: "movie" | "tv") {
    const resp = await this.request({
      url: `/${type}/modules`,
      cache: {
        type: CacheType.LOCAL,
        key: `douban_${type}_modules`,
        ttl: SECONDS_PER_DAY,
      },
    });
    return doubanModulesSchema.parse(resp);
  }
}
