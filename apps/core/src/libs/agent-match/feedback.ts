import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod/v4";
import { doubanMapping, type FeedbackSnapshot, mappingFeedback } from "@/db";
import { api } from "@/libs/api";
import { getContext } from "@/libs/middleware";
import { serializeAgent } from "./blob";
import { makeCandidateId } from "./candidates";
import type { AgentMatchJob } from "./types";
import { truncateReason, type verifyConcludeMatch } from "./verifier";

const positiveId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const doubanPattern = /^(?:https:\/\/movie\.douban\.com\/subject\/)?([1-9]\d*)\/?(?:[?#].*)?$/;
const tmdbPattern = /^https:\/\/(?:www\.)?themoviedb\.org\/(movie|tv)\/([1-9]\d*)(?:-[^/?#]+)?\/?(?:[?#].*)?$/;

export const mappingFeedbackSchema = z
  .object({
    douban: z.string().trim().max(500).regex(doubanPattern, "请填写豆瓣条目链接或数字 ID"),
    tmdb: z.string().trim().max(500).regex(tmdbPattern, "请填写 TMDB 电影或剧集链接"),
    reason: z.string().trim().min(1, "请说明修改理由").max(1000, "修改理由不能超过 1000 字"),
  })
  .transform((value, ctx) => {
    const doubanId = positiveId.safeParse(value.douban.match(doubanPattern)?.[1]);
    const tmdb = value.tmdb.match(tmdbPattern);
    const tmdbId = positiveId.safeParse(tmdb?.[2]);
    if (!doubanId.success || !tmdbId.success) {
      ctx.addIssue({ code: "custom", message: "条目 ID 超出有效范围" });
      return z.NEVER;
    }
    return {
      doubanId: doubanId.data,
      candidateId: makeCandidateId(tmdb?.[1] === "tv" ? "tv" : "movie", tmdbId.data),
      reason: value.reason,
    };
  });

export async function submitMappingFeedback(userId: string, input: z.output<typeof mappingFeedbackSchema>) {
  const { env } = getContext();
  if (!env.AGENT_MATCH_QUEUE) throw new HTTPException(503, { message: "评审队列暂不可用，请稍后重试" });
  const now = Date.now();
  const id = crypto.randomUUID();
  const recent = sql`SELECT count(*) FROM ${mappingFeedback}
    WHERE ${mappingFeedback.userId} = ${userId} AND ${mappingFeedback.createdAt} >= ${now - 3600_000}`;
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, input.doubanId) });
  if (row?.deletedAt) throw new HTTPException(409, { message: "此条目已移除，暂不接受反馈" });
  const snapshot: FeedbackSnapshot = {
    tmdbId: row?.tmdbId ?? null,
    imdbId: row?.imdbId ?? null,
    traktId: row?.traktId ?? null,
    calibrated: row ? row.calibrated : false,
    agent: row?.agent ?? null,
  };
  await api.db
    .update(mappingFeedback)
    .set({ status: "failed", result: serializeAgent({ reason: "评审超过一小时未完成，请重新提交" }) })
    .where(
      and(
        eq(mappingFeedback.doubanId, input.doubanId),
        eq(mappingFeedback.status, "pending"),
        sql`${mappingFeedback.createdAt} <= ${now - 3600_000}`,
      ),
    );
  const inserted = await api.db.get<{ id: string }>(sql`
    INSERT INTO mapping_feedback (id, user_id, douban_id, candidate_id, reason, snapshot, status, created_at)
    SELECT ${id}, ${userId}, ${input.doubanId}, ${input.candidateId}, ${input.reason},
      ${JSON.stringify(snapshot)}, 'pending', ${now}
    WHERE (${recent}) < 5
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  if (!inserted) {
    throw new HTTPException(429, { message: "此条目已有反馈正在评审，或已达到每小时 5 条的提交上限" });
  }
  try {
    await api.db.insert(doubanMapping).values({ doubanId: input.doubanId }).onConflictDoNothing();
    await env.AGENT_MATCH_QUEUE.send({ doubanId: input.doubanId, agentToken: id, feedbackId: id });
  } catch (error) {
    await failMappingFeedback(
      { doubanId: input.doubanId, agentToken: id, feedbackId: id },
      "评审任务入队失败，请重新提交",
    );
    console.error("mapping-feedback enqueue failed", error);
    throw new HTTPException(503, { message: "评审任务入队失败，请稍后重新提交" });
  }
  return id;
}

export async function pendingMappingFeedback(job: AgentMatchJob) {
  if (!job.feedbackId || job.feedbackId !== job.agentToken) return undefined;
  return api.db.query.mappingFeedback.findFirst({
    where: and(
      eq(mappingFeedback.id, job.feedbackId),
      eq(mappingFeedback.doubanId, job.doubanId),
      eq(mappingFeedback.status, "pending"),
    ),
  });
}

export async function failMappingFeedback(job: AgentMatchJob, reason: string): Promise<boolean> {
  const feedback = await pendingMappingFeedback(job);
  if (!feedback) return false;
  const updated = await api.db
    .update(mappingFeedback)
    .set({ status: "failed", result: serializeAgent({ reason: truncateReason(reason) }) })
    .where(and(eq(mappingFeedback.id, feedback.id), eq(mappingFeedback.status, "pending")))
    .returning({ id: mappingFeedback.id });
  return updated.length > 0;
}

export async function applyFeedbackVerdict(input: {
  doubanId: number;
  agentToken: string;
  feedbackId?: string;
  verdict: ReturnType<typeof verifyConcludeMatch>;
  confidence: number;
  reason: string;
}): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const feedback = await pendingMappingFeedback(input);
  if (!feedback) return "stale";
  const candidate = input.verdict.candidate;
  const agrees = candidate?.candidateId === feedback.candidateId && input.verdict.tier !== "none";
  const result = serializeAgent({
    confidence: input.confidence,
    reason: truncateReason(input.reason),
    candidateId: candidate?.candidateId,
    tmdbId: candidate?.tmdbId ?? null,
    imdbId: candidate?.imdbId ?? null,
    traktId: candidate?.traktId ?? null,
  });
  const pending = and(eq(mappingFeedback.id, feedback.id), eq(mappingFeedback.status, "pending"));
  if (!agrees || input.verdict.tier !== "auto" || !candidate) {
    const updated = await api.db
      .update(mappingFeedback)
      .set({ status: agrees ? "suggested" : "rejected", result })
      .where(pending)
      .returning({ id: mappingFeedback.id });
    return updated.length === 0 ? "stale" : agrees ? "suggested" : "no_match";
  }
  const unchanged = and(
    eq(doubanMapping.doubanId, feedback.doubanId),
    sql`${doubanMapping.deletedAt} IS NULL`,
    ...Object.entries(feedback.snapshot).map(
      ([key, value]) =>
        sql`${doubanMapping[key as keyof FeedbackSnapshot]} IS ${typeof value === "boolean" ? Number(value) : value}`,
    ),
  );
  const [reviewed] = await api.db.batch([
    api.db
      .update(mappingFeedback)
      .set({
        status: sql`CASE WHEN EXISTS (SELECT 1 FROM ${doubanMapping} WHERE ${unchanged}) THEN 'accepted' ELSE 'stale' END`,
        result,
      })
      .where(pending)
      .returning({ status: mappingFeedback.status }),
    api.db
      .update(doubanMapping)
      .set({
        tmdbId: candidate.tmdbId,
        imdbId: candidate.imdbId ?? null,
        traktId: candidate.traktId ?? null,
        calibrated: false,
        agent: result,
      })
      .where(
        and(
          unchanged,
          sql`EXISTS (SELECT 1 FROM ${mappingFeedback}
            WHERE ${mappingFeedback.id} = ${feedback.id} AND ${mappingFeedback.status} = 'accepted')`,
        ),
      ),
  ]);
  return reviewed[0]?.status === "accepted" ? "written" : "stale";
}
