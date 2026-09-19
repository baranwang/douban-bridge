import { and, isNull, ne, or } from "drizzle-orm";
import { type DoubanIdMapping, doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { AGENT_MATCH_HOURLY_LIMIT } from "./libs/agent-match/constants";
import { claimAgentJobs, recoverExpiredClaims } from "./libs/agent-match/pool";
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
          and(
            isNull(doubanMapping.deletedAt),
            isNull(doubanMapping.tmdbId),
            or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
          ),
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
          };
        }
        return null;
      };

      for (const group of groups) {
        const results = await Promise.allSettled(
          group.map<Promise<DoubanIdMapping | null>>(async (item) => {
            const { doubanId, imdbId } = item;
            if (imdbId) {
              const data = await api.traktAPI.searchByImdbId(imdbId).catch(() => []);
              if (data.length === 1) {
                return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(data[0], "ids"));
              }
            }
            const doubanDetail = await api.doubanAPI.getSubjectDetail(doubanId).catch(() => null);
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
                const doubanYear = doubanDetail.year?.toString();
                const yearsMatches = results.filter((item) => {
                  const candidateYear = api.traktAPI.getSearchResultField(item, "year")?.toString();
                  return Boolean(doubanYear && candidateYear && candidateYear === doubanYear);
                });
                if (yearsMatches.length === 1) {
                  return formatIdMapping(doubanId, api.traktAPI.getSearchResultField(yearsMatches[0], "ids"));
                }
              }
            }
            return null;
          }),
        );
        for (const [index, result] of results.entries()) {
          if (result.status === "rejected") {
            const error = result.reason;
            console.warn(
              "⚠️ Skipping failed mapping",
              group[index].doubanId,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        const validResults = results.flatMap((result) => {
          if (result.status === "fulfilled" && result.value) {
            return [result.value];
          }
          return [];
        });
        if (validResults.length > 0) {
          await api.persistIdMapping(validResults);
          successCount += validResults.length;
        }
      }
      console.info("🎉 Successfully processed", successCount, "items");
      await recoverExpiredClaims();
      const jobs = await claimAgentJobs(AGENT_MATCH_HOURLY_LIMIT);
      for (const job of jobs) {
        ctx.waitUntil(env.AGENT_MATCH_QUEUE?.send(job));
      }
    },
  );
};
