import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { computeNextAgentAt, truncateReason, verifyConcludeMatch } from "./verifier";

type AgentVerdict = ReturnType<typeof verifyConcludeMatch>;

function claimWhere(input: { doubanId: number; expectedRevision: number; agentToken: string }) {
  return and(
    eq(doubanMapping.doubanId, input.doubanId),
    or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
    isNull(doubanMapping.tmdbId),
    eq(doubanMapping.mappingRevision, input.expectedRevision),
    eq(doubanMapping.agentToken, input.agentToken),
    eq(doubanMapping.agentState, "running"),
  );
}

function buildAgentResult(input: {
  verdict: AgentVerdict;
  confidence: number;
  reason: string;
  priorMapping: { tmdbId: number | null; imdbId: string | null; traktId: number | null };
}) {
  return JSON.stringify({
    decision: input.verdict.tier === "none" ? "none" : "match",
    confidence: input.confidence,
    reason: truncateReason(input.reason),
    candidateId: input.verdict.candidate?.candidateId ?? null,
    tmdbId: input.verdict.candidate?.tmdbId ?? null,
    imdbId: input.verdict.candidate?.imdbId ?? null,
    traktId: input.verdict.candidate?.traktId ?? null,
    priorMapping: input.priorMapping,
  });
}

export async function applyAgentVerdict(input: {
  doubanId: number;
  expectedRevision: number;
  agentToken: string;
  verdict: AgentVerdict;
  confidence: number;
  reason: string;
  now?: number;
}): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, input.doubanId) });
  if (!row) return "stale";
  const priorMapping = {
    tmdbId: row.tmdbId ?? null,
    imdbId: row.imdbId ?? null,
    traktId: row.traktId ?? null,
  };
  const agentResult = buildAgentResult({
    verdict: input.verdict,
    confidence: input.confidence,
    reason: input.reason,
    priorMapping,
  });
  const where = claimWhere(input);

  if (input.verdict.tier === "auto" && input.verdict.candidate) {
    const updated = await api.db
      .update(doubanMapping)
      .set({
        tmdbId: input.verdict.candidate.tmdbId,
        imdbId: input.verdict.candidate.imdbId ?? null,
        traktId: input.verdict.candidate.traktId ?? null,
        matchSource: "agent",
        calibrated: false,
        mappingRevision: sql`${doubanMapping.mappingRevision} + 1`,
        agentState: null,
        agentToken: null,
        agentLeaseUntil: null,
        agentResult,
      })
      .where(where)
      .returning({ doubanId: doubanMapping.doubanId });
    return updated.length === 0 ? "stale" : "written";
  }

  if (input.verdict.tier === "suggest") {
    const updated = await api.db
      .update(doubanMapping)
      .set({
        agentState: "suggested",
        agentToken: null,
        agentLeaseUntil: null,
        agentResult,
      })
      .where(where)
      .returning({ doubanId: doubanMapping.doubanId });
    return updated.length === 0 ? "stale" : "suggested";
  }

  const updated = await api.db
    .update(doubanMapping)
    .set({
      agentState: "no_match",
      agentToken: null,
      agentLeaseUntil: null,
      agentResult,
      agentAttempts: sql`${doubanMapping.agentAttempts} + 1`,
      nextAgentAt: computeNextAgentAt((row.agentAttempts ?? 0) + 1, input.now),
    })
    .where(where)
    .returning({ doubanId: doubanMapping.doubanId });
  return updated.length === 0 ? "stale" : "no_match";
}
