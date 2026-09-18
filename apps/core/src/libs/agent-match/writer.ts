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
  if (!row) return "stale";
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
    const imdbGuard = candidate.imdbId
      ? or(isNull(doubanMapping.imdbId), eq(doubanMapping.imdbId, candidate.imdbId))
      : isNull(doubanMapping.imdbId);
    const updated = await api.db
      .update(doubanMapping)
      .set({
        tmdbId: candidate.tmdbId,
        imdbId: candidate.imdbId ?? null,
        traktId: candidate.traktId ?? null,
        calibrated: false,
        agent: serializeAgent(conclusion),
      })
      .where(and(where, isNull(doubanMapping.tmdbId), imdbGuard))
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

export const agentMatchWriter = {
  applyAgentVerdict,
};
