import { and, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod/v4";
import { type DoubanIdMapping, doubanMapping } from "@/db";
import { api, type doubanSubjectDetailSchema } from "@/libs/api";
import { ImdbAPI } from "./libs/api/imdb";
import { asyncLocalStorage } from "./libs/middleware";

export const scheduled = async (_controller: ScheduledController, env: CloudflareBindings, ctx: ExecutionContext) => {
  return asyncLocalStorage.run(
    {
      env,
      ctx,
    },
    async () => {
      const data = await api.db
        .select()
        .from(doubanMapping)
        .where(
          and(isNull(doubanMapping.tmdbId), or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated))),
        );

      console.info("🔍 Found", data.length, "items to process");

      const groups: (typeof data)[] = [];
      for (let i = 0; i < data.length; i += 10) {
        groups.push(data.slice(i, i + 10));
      }

      let successCount = 0;

      const formatIdMapping = (doubanId: number, ids?: Parameters<typeof api.traktAPI.formatIdsToIdMapping>[0]) => {
        const mapping = api.traktAPI.formatIdsToIdMapping(ids);
        if (mapping) {
          return {
            ...mapping,
            doubanId,
            calibrated: true,
          };
        }
        return null;
      };

      const imdbAPI = new ImdbAPI();

      for (const group of groups) {
        const results = await Promise.all(
          group.map<Promise<DoubanIdMapping | null>>(async (item) => {
            const { doubanId, imdbId } = item;
            let doubanDetail: z.output<typeof doubanSubjectDetailSchema> | null = null;
            if (imdbId) {
              let data = await api.traktAPI.searchByImdbId(imdbId).catch(() => []);
              if (data.length === 0) {
                // 豆瓣有些剧是用的某一季的 imdb，尝试搜索一下
                doubanDetail = await api.doubanAPI.getSubjectDetail(doubanId).catch(() => null);
                if (doubanDetail && doubanDetail.type === "tv") {
                  const resp = await imdbAPI.search(imdbId);
                  if (resp.top?.series?.series?.id) {
                    data = await api.traktAPI.searchByImdbId(resp.top.series.series.id).catch(() => []);
                  }
                }
              }
              if (data.length === 1) {
                return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(data[0], "ids"));
              }
            }
            if (!doubanDetail) {
              doubanDetail = await api.doubanAPI.getSubjectDetail(doubanId).catch(() => null);
            }
            if (doubanDetail) {
              const results = await api.traktAPI.search(
                doubanDetail.type === "movie" ? "movie" : "show",
                doubanDetail.title,
              );
              if (results.length === 1) {
                return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(results[0], "ids"));
              }

              // 尝试比对一下原始标题，如果只有一个结果，则直接返回
              const originalTitleMatches = results.filter(
                (item) =>
                  api.traktAPI.getSearchResultField(item, "original_title") ===
                  (doubanDetail.original_title || doubanDetail.title),
              );
              if (originalTitleMatches.length === 1) {
                return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(originalTitleMatches[0], "ids"));
              }

              // 电影尝试比对一下年份，如果只有一个结果，则直接返回
              if (doubanDetail.type === "movie") {
                const yearsMatches = results.filter(
                  (item) =>
                    api.traktAPI.getSearchResultField(item, "year")?.toString() === doubanDetail.year?.toString(),
                );
                if (yearsMatches.length === 1) {
                  return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(yearsMatches[0], "ids"));
                }
              }
            }
            return null;
          }),
        );
        const validResults = results.filter((item): item is DoubanIdMapping => !!item);
        if (validResults.length > 0) {
          ctx.waitUntil(api.persistIdMapping(validResults));
          successCount += validResults.length;
        }
      }
      console.info("🎉 Successfully processed", successCount, "items");
    },
  );
};
