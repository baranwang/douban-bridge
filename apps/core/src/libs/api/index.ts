import { and, inArray, isNull } from "drizzle-orm";
import { type DoubanIdMapping, doubanMapping } from "@/db";
import { BaseAPI } from "./base";
import { DoubanAPI } from "./douban";
import { lookupDoubanIds, type MediaRefMapping, submitDoubanLead } from "./mediaref";
import { TraktAPI } from "./trakt";

interface FindIdParams {
  type: "movie" | "tv";
  doubanId: number;
  title?: string;
}

export type IdMapping = Pick<DoubanIdMapping, "tmdbId" | "imdbId" | "traktId">;

const LEAD_TTL_SECONDS = 7 * 24 * 3600;
const MISS_TTL_SECONDS = 24 * 3600;
const MAX_LEADS_PER_REQUEST = 5;
const leadCacheKey = (doubanId: number) => `mediaref:lead:${doubanId}`;

export * from "./douban/schema";
export { DoubanAPI };

class API extends BaseAPI {
  doubanAPI = new DoubanAPI();

  traktAPI = new TraktAPI();

  /**
   * 豆瓣编号 → 外部编号。来源优先级：MediaRef 已确认 > MediaRef 未确认 > 本地 douban_mapping（只读备用）
   * > KV 线索缓存 > findExternalId 现查。现查到的电影作为线索提交给 MediaRef。
   */
  async fetchIdMapping(items: FindIdParams[]): Promise<Map<number, IdMapping>> {
    const { env, ctx } = this.context;
    const doubanIds = items.map((item) => item.doubanId);
    const stats = {
      total: items.length,
      mediarefConfirmed: 0,
      mediarefUnconfirmed: 0,
      local: 0,
      lead: 0,
      found: 0,
      miss: 0,
      conflict: 0,
      mediarefError: 0,
    };

    const [remote, rows] = await Promise.all([
      lookupDoubanIds(doubanIds).catch((error) => {
        if (env.MEDIAREF_API_KEY) console.warn("⚠️ MediaRef lookup failed", error);
        stats.mediarefError = 1;
        return new Map<number, MediaRefMapping>();
      }),
      this.db
        .select()
        .from(doubanMapping)
        .where(and(inArray(doubanMapping.doubanId, doubanIds), isNull(doubanMapping.deletedAt))),
    ]);
    const local = new Map(rows.map((row) => [row.doubanId, row]));

    const result = new Map<number, IdMapping>();
    const pending: FindIdParams[] = [];
    for (const item of items) {
      const hit = remote.get(item.doubanId);
      const row = local.get(item.doubanId);
      if (hit) {
        stats[hit.confirmed ? "mediarefConfirmed" : "mediarefUnconfirmed"] += 1;
        if (row?.tmdbId != null && row.tmdbId !== hit.tmdbId) stats.conflict += 1;
        result.set(item.doubanId, { tmdbId: hit.tmdbId, imdbId: hit.imdbId, traktId: hit.traktId });
      } else if (row && (row.tmdbId || row.imdbId || row.traktId || row.calibrated)) {
        // calibrated 且无编号 = 人工确认过“没有对应”，不再现查。
        stats.local += 1;
        result.set(item.doubanId, { tmdbId: row.tmdbId, imdbId: row.imdbId, traktId: row.traktId });
      } else {
        pending.push(item);
      }
    }

    const cached = await Promise.all(pending.map((item) => env.KV.get<IdMapping>(leadCacheKey(item.doubanId), "json")));
    const toFind = pending.filter((item, index) => {
      const lead = cached[index];
      if (!lead) return true;
      stats.lead += 1;
      result.set(item.doubanId, lead);
      return false;
    });

    let submitted = 0;
    await Promise.all(
      toFind.map(async (item) => {
        const found = await this.findExternalId(item).catch(() => null);
        if (!found) {
          // 现查本身出错（上游故障）不缓存，下次请求再试。
          stats.miss += 1;
          result.set(item.doubanId, { tmdbId: null, imdbId: null, traktId: null });
          return;
        }
        const mapping = {
          tmdbId: found.tmdbId ?? null,
          imdbId: found.imdbId ?? null,
          traktId: found.traktId ?? null,
        };
        const hasId = !!(mapping.tmdbId || mapping.imdbId || mapping.traktId);
        stats[hasId ? "found" : "miss"] += 1;
        result.set(item.doubanId, mapping);
        ctx.waitUntil(
          env.KV.put(leadCacheKey(item.doubanId), JSON.stringify(mapping), {
            expirationTtl: hasId ? LEAD_TTL_SECONDS : MISS_TTL_SECONDS,
          }),
        );
        // shortcut: 电视剧不知道对应 TMDB 第几季，整部提交会和其他季冲突，等 MediaRef 支持“季待定”再放开。
        if (item.type === "movie" && mapping.tmdbId && env.MEDIAREF_API_KEY && submitted < MAX_LEADS_PER_REQUEST) {
          submitted += 1;
          ctx.waitUntil(
            submitDoubanLead(item.doubanId, mapping.tmdbId).catch((error) =>
              console.warn("⚠️ MediaRef lead submit failed", item.doubanId, error),
            ),
          );
        }
      }),
    );

    console.info("📊 id mapping sources", JSON.stringify(stats));
    return result;
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
