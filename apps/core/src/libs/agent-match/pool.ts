import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { isEvaluated, parseAgent, serializeAgent } from "./blob";
import { AGENT_LEASE_MS } from "./constants";
import type { AgentMatchJob } from "./types";

export type { AgentMatchJob };

function eligibleWhere() {
  return and(
    isNull(doubanMapping.tmdbId),
    or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
    or(isNull(doubanMapping.agent), eq(doubanMapping.agent, "")),
  );
}

export async function recoverExpiredClaims(now = Date.now()): Promise<number> {
  const rows = await api.db
    .select()
    .from(doubanMapping)
    .where(
      and(
        sql`json_extract(${doubanMapping.agent}, '$.token') IS NOT NULL`,
        sql`json_extract(${doubanMapping.agent}, '$.leaseUntil') <= ${now}`,
      ),
    );
  let recovered = 0;
  for (const row of rows) {
    const blob = parseAgent(row.agent);
    if (!blob?.token || blob.leaseUntil == null || blob.leaseUntil > now) continue;
    const next = serializeAgent(
      blob.status === "suggested" || blob.status === "no_match"
        ? {
            status: blob.status,
            confidence: blob.confidence,
            reason: blob.reason,
            candidateId: blob.candidateId,
            tmdbId: blob.tmdbId,
            imdbId: blob.imdbId,
            traktId: blob.traktId,
          }
        : null,
    );
    const updated = await api.db
      .update(doubanMapping)
      .set({ agent: next })
      .where(and(eq(doubanMapping.doubanId, row.doubanId), eq(doubanMapping.agent, row.agent)))
      .returning({ doubanId: doubanMapping.doubanId });
    if (updated.length > 0) recovered += 1;
  }
  return recovered;
}

export async function claimAgentJobs(limit: number, now = Date.now()): Promise<AgentMatchJob[]> {
  if (limit <= 0) return [];
  const rows = await api.db.select().from(doubanMapping).where(eligibleWhere()).orderBy(sql`RANDOM()`).limit(limit);

  const jobs: AgentMatchJob[] = [];
  for (const row of rows) {
    if (jobs.length >= limit) break;
    const blob = parseAgent(row.agent);
    if (row.tmdbId != null || row.calibrated === true || isEvaluated(blob, now)) continue;
    const agentToken = crypto.randomUUID();
    const claimed = await api.db
      .update(doubanMapping)
      .set({ agent: serializeAgent({ token: agentToken, leaseUntil: now + AGENT_LEASE_MS }) })
      .where(
        and(
          eq(doubanMapping.doubanId, row.doubanId),
          isNull(doubanMapping.tmdbId),
          or(isNull(doubanMapping.agent), eq(doubanMapping.agent, "")),
        ),
      )
      .returning({ doubanId: doubanMapping.doubanId });
    if (claimed[0]) {
      jobs.push({ doubanId: claimed[0].doubanId, agentToken });
    }
  }
  return jobs;
}
