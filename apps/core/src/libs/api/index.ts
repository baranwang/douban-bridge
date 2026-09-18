import { inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { type DoubanIdMapping, doubanMapping, doubanMappingSchema } from "@/db";
import { BaseAPI } from "./base";
import { DoubanAPI } from "./douban";
import { TraktAPI } from "./trakt";

interface FindIdParams {
  type: "movie" | "tv";
  doubanId: number;
  title?: string;
}

export * from "./douban/schema";
export { DoubanAPI };

class API extends BaseAPI {
  doubanAPI = new DoubanAPI();

  traktAPI = new TraktAPI();

  async fetchIdMapping(doubanIds: number[]) {
    const rows = await this.db.select().from(doubanMapping).where(inArray(doubanMapping.doubanId, doubanIds));
    const mappingCache = new Map<number, Partial<DoubanIdMapping>>();
    const mappedIds = new Set<number>();
    for (const { doubanId, imdbId, tmdbId, traktId, calibrated } of rows) {
      if (imdbId || tmdbId || traktId || calibrated) {
        mappingCache.set(doubanId, { imdbId, tmdbId, traktId, calibrated });
        mappedIds.add(doubanId);
      }
    }
    if (mappedIds.size > 0) {
      console.info("🔍 Found", mappedIds.size, "mapped ids in database");
    }
    const missingIds = doubanIds.filter((id) => !mappedIds.has(id));
    return { mappingCache, missingIds };
  }

  async persistIdMapping(mappings: (DoubanIdMapping | null)[], skipNil = true) {
    const hasValidId = (item: DoubanIdMapping) => !!(item.imdbId || item.tmdbId || item.traktId);

    const data = mappings.flatMap((item) => {
      const result = doubanMappingSchema.safeParse(item);
      if (!result.success) {
        console.warn("❌ Invalid douban id mapping", z.prettifyError(result.error));
        return [];
      }
      if (skipNil && !hasValidId(result.data)) {
        return [];
      }
      const { doubanId, imdbId, tmdbId, traktId } = result.data;
      return [{ doubanId, imdbId, tmdbId, traktId }];
    });
    if (data.length === 0) return;

    console.log("🗄️ Updating douban id mapping, count:", data.length);
    await this.db
      .insert(doubanMapping)
      .values(data)
      .onConflictDoUpdate({
        target: doubanMapping.doubanId,
        set: {
          tmdbId: sql`CASE
            WHEN ${doubanMapping.tmdbId} IS NULL THEN excluded.tmdb_id
            ELSE ${doubanMapping.tmdbId}
          END`,
          imdbId: sql`CASE
            WHEN ${doubanMapping.tmdbId} IS NULL AND excluded.tmdb_id IS NOT NULL THEN excluded.imdb_id
            WHEN ${doubanMapping.tmdbId} IS NULL THEN COALESCE(excluded.imdb_id, ${doubanMapping.imdbId})
            ELSE ${doubanMapping.imdbId}
          END`,
          traktId: sql`CASE
            WHEN ${doubanMapping.tmdbId} IS NULL AND excluded.tmdb_id IS NOT NULL THEN excluded.trakt_id
            WHEN ${doubanMapping.tmdbId} IS NULL THEN COALESCE(excluded.trakt_id, ${doubanMapping.traktId})
            ELSE ${doubanMapping.traktId}
          END`,
        },
        setWhere: or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
      });
  }

  async findExternalId(params: FindIdParams) {
    const result: DoubanIdMapping = {
      doubanId: params.doubanId,
      imdbId: null,
      tmdbId: null,
      traktId: null,
    };

    const assignTraktIds = (ids?: Parameters<typeof this.traktAPI.formatIdsToIdMapping>[0]) => {
      const mapping = this.traktAPI.formatIdsToIdMapping(ids);
      if (mapping) {
        result.traktId = mapping.traktId;
        result.tmdbId = mapping.tmdbId;
        result.imdbId = mapping.imdbId;
      }
    };

    // 1. 尝试从豆瓣详情页获取 IMDb ID
    const detail = await this.doubanAPI.getSubjectDetailDesc(params.doubanId).catch(() => null);
    if (detail?.IMDb) {
      result.imdbId = detail.IMDb;
      // 通过 IMDb ID 查找 Trakt/TMDB ID
      const traktIds = await this.findIdWithTraktSearchImdb(detail.IMDb).catch(() => null);
      assignTraktIds(traktIds);
    }

    // 2. 如果没有 IMDb ID，尝试通过 Trakt 搜索标题
    if (!result.imdbId) {
      const traktIds = await this.findIdWithTraktSearchTitle(params).catch(() => null);
      assignTraktIds(traktIds);
    }

    return result;
  }

  private async findIdWithTraktSearchImdb(imdbId: string) {
    const data = await this.traktAPI.searchByImdbId(imdbId).catch(() => []);
    if (data.length === 1) {
      return this.traktAPI.getSearchResultField(data[0], "ids");
    }
    return null;
  }

  private cleanSearchTitle(title?: string) {
    if (!title) {
      return null;
    }
    // 支持匹配阿拉伯数字和中文数字的“第X季”或类如“（第二季）”的内容
    // 匹配形如 (第2季)、(第二季)、(第十二季) 等内容
    return title.replace(/\s*（?第?[0-9一二三四五六七八九十百零]+季）?\s*/g, "").trim();
  }

  private async findIdWithTraktSearchTitle(params: FindIdParams) {
    const { type, doubanId } = params;
    let { title } = params;
    if (!title && doubanId) {
      const detail = await this.doubanAPI.getSubjectDetailDesc(doubanId).catch(() => null);
      title = detail?.title;
    }
    if (!title) {
      return null;
    }
    const traktType = type === "tv" ? "show" : "movie";
    const data = await this.traktAPI.search(traktType, title).catch((err) => {
      console.error("❌ Trakt search title error", err);
      return [];
    });
    if (data.length === 1) {
      return this.traktAPI.getSearchResultField(data[0], "ids");
    }
    const titleSet = new Set([title, this.cleanSearchTitle(title)].filter(Boolean));
    const nameMatches = data.filter((result) => {
      const traktTitle = this.traktAPI.getSearchResultField(result, "title") ?? "";
      const traktOriginalTitle = this.traktAPI.getSearchResultField(result, "original_title") ?? "";
      return titleSet.has(traktTitle) || titleSet.has(traktOriginalTitle);
    });
    if (nameMatches.length === 1) {
      return this.traktAPI.getSearchResultField(nameMatches[0], "ids");
    }
    if (nameMatches.length > 1) {
      console.warn(
        "🔍 Trakt search title matches multiple results",
        title,
        nameMatches.map((result) => this.traktAPI.getSearchResultField(result, "title")),
      );
    }
    return null;
  }
}

export const api = new API();
