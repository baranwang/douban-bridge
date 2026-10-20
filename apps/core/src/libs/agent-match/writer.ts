import { and, eq, isNull, ne, or } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { parseAgent, serializeAgent } from "./blob";
import { truncateReason, type verifyConcludeMatch } from "./verifier";

type AgentVerdict = ReturnType<typeof verifyConcludeMatch>;

export async function applyAgentVerdict(input: {
  doubanId: number;
  agentToken: string;
  verdict: AgentVerdict;
  confidence: number;
  reason: string;
  now?: number;
}): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, input.doubanId) });
  if (!row || row.deletedAt) return "stale";
  const blob = parseAgent(row.agent);
  const now = input.now ?? Date.now();
  if (
    row.calibrated === true ||
    row.tmdbId != null ||
    blob?.token !== input.agentToken ||
    blob.leaseUntil == null ||
    blob.leaseUntil <= now
  ) {
    return "stale";
  }

  const reason = truncateReason(input.reason);
  const conclusion = {
    confidence: input.confidence,
    reason,
    candidateId: input.verdict.candidate?.candidateId,
    tmdbId: input.verdict.candidate?.tmdbId ?? null,
    imdbId: input.verdict.candidate?.imdbId ?? null,
    traktId: input.verdict.candidate?.traktId ?? null,
  };
  const where = and(
    eq(doubanMapping.doubanId, input.doubanId),
    or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
    eq(doubanMapping.agent, row.agent),
  );

  if (input.verdict.tier === "auto" && input.verdict.candidate) {
    const candidate = input.verdict.candidate;
    const updated = await api.db
      .update(doubanMapping)
      .set({
        tmdbId: candidate.tmdbId,
        imdbId: candidate.imdbId ?? row.imdbId,
        traktId: candidate.traktId ?? row.traktId,
        calibrated: false,
        agent: serializeAgent(conclusion),
      })
      .where(and(where, isNull(doubanMapping.tmdbId)))
      .returning({ doubanId: doubanMapping.doubanId });
    return updated.length === 0 ? "stale" : "written";
  }

  const status = input.verdict.tier === "suggest" ? "suggested" : "no_match";
  const updated = await api.db
    .update(doubanMapping)
    .set({ agent: serializeAgent({ status, ...conclusion }) })
    .where(and(where, isNull(doubanMapping.tmdbId)))
    .returning({ doubanId: doubanMapping.doubanId });
  return updated.length === 0 ? "stale" : status;
}

/**
 * Terminal state after the final queue attempt fails, so cron lease recovery stops re-claiming the row.
 * Ignores lease expiry: the token alone proves this job still owns the row.
 */
export async function markAgentFailed(input: {
  doubanId: number;
  agentToken: string;
  error: string;
}): Promise<boolean> {
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, input.doubanId) });
  if (!row || row.deletedAt || row.calibrated === true || row.tmdbId != null) return false;
  if (parseAgent(row.agent)?.token !== input.agentToken) return false;
  const updated = await api.db
    .update(doubanMapping)
    .set({
      agent: serializeAgent({
        status: "no_match",
        confidence: 0,
        reason: truncateReason(`agent_failed: ${input.error}`),
        tmdbId: null,
        imdbId: null,
        traktId: null,
      }),
    })
    .where(
      and(eq(doubanMapping.doubanId, input.doubanId), eq(doubanMapping.agent, row.agent), isNull(doubanMapping.tmdbId)),
    )
    .returning({ doubanId: doubanMapping.doubanId });
  return updated.length > 0;
}

export const agentMatchWriter = {
  applyAgentVerdict,
  markAgentFailed,
};
