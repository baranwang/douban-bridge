import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { isBusy, isEvaluated, parseAgent, serializeAgent } from "./blob";
import { AGENT_LEASE_MS } from "./constants";
import type { AgentMatchJob } from "./types";

export type { AgentMatchJob };

function eligibleWhere(includeSuggested = false) {
  return and(
    isNull(doubanMapping.deletedAt),
    isNull(doubanMapping.tmdbId),
    or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
    includeSuggested
      ? or(
          isNull(doubanMapping.agent),
          eq(doubanMapping.agent, ""),
          sql`json_extract(${doubanMapping.agent}, '$.status') = 'suggested'`,
        )
      : or(isNull(doubanMapping.agent), eq(doubanMapping.agent, "")),
  );
}

export function parseEnqueueIds(values: FormDataEntryValue[]): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const value of values) {
    const id = Number.parseInt(String(value), 10);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
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

export async function claimAgentJobs(
  limit: number,
  now = Date.now(),
  doubanIds?: readonly number[],
): Promise<AgentMatchJob[]> {
  if (limit <= 0) return [];
  const selected = doubanIds ? parseEnqueueIds(doubanIds.map(String)).slice(0, limit) : undefined;
  if (selected && selected.length === 0) return [];

  const where = selected
    ? and(eligibleWhere(true), inArray(doubanMapping.doubanId, selected))
    : eligibleWhere();
  const rows = selected
    ? await api.db.select().from(doubanMapping).where(where).limit(limit)
    : await api.db.select().from(doubanMapping).where(where).orderBy(sql`RANDOM()`).limit(limit);

  const jobs: AgentMatchJob[] = [];
  for (const row of rows) {
    if (jobs.length >= limit) break;
    const blob = parseAgent(row.agent);
    if (row.tmdbId != null || row.calibrated === true || isBusy(blob, now)) continue;
    if (!selected && isEvaluated(blob, now)) continue;
    if (selected && blob?.status === "no_match") continue;
    const agentToken = crypto.randomUUID();
    const claimed = await api.db
      .update(doubanMapping)
      .set({ agent: serializeAgent({ token: agentToken, leaseUntil: now + AGENT_LEASE_MS }) })
      .where(
        and(
          eq(doubanMapping.doubanId, row.doubanId),
          isNull(doubanMapping.tmdbId),
          row.agent ? eq(doubanMapping.agent, row.agent) : or(isNull(doubanMapping.agent), eq(doubanMapping.agent, "")),
        ),
      )
      .returning({ doubanId: doubanMapping.doubanId });
    if (claimed[0]) {
      jobs.push({ doubanId: claimed[0].doubanId, agentToken });
    }
  }
  return jobs;
}
