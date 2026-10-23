import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { type DoubanIdMapping, doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { getContext } from "@/libs/middleware";
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
          sql`json_extract(${doubanMapping.agent}, '$.status') IN ('suggested', 'failed', 'no_match')`,
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
  limit?: number,
  now = Date.now(),
  doubanIds?: readonly number[],
  includeSuggested = doubanIds != null,
): Promise<AgentMatchJob[]> {
  if (limit != null && limit <= 0) return [];
  const selected = doubanIds
    ? parseEnqueueIds(doubanIds.map(String)).slice(0, limit ?? Number.POSITIVE_INFINITY)
    : undefined;
  if (selected && selected.length === 0) return [];

  if (selected) return claimSelected(selected, now, includeSuggested);

  const where = eligibleWhere();
  const query = api.db.select().from(doubanMapping).where(where);
  const rows = limit == null ? await query : await query.orderBy(sql`RANDOM()`).limit(limit);

  const jobs: AgentMatchJob[] = [];
  for (const row of rows) {
    if (limit != null && jobs.length >= limit) break;
    const blob = parseAgent(row.agent);
    if (row.tmdbId != null || row.calibrated === true || isBusy(blob, now)) continue;
    if (isEvaluated(blob, now)) continue;
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

// shortcut: D1 allows 100 bound parameters per query, raise this only if the WHERE binds shrink.
const D1_ID_CHUNK = 80;

async function claimSelected(ids: readonly number[], now: number, includeSuggested: boolean): Promise<AgentMatchJob[]> {
  const jobs: AgentMatchJob[] = [];
  const leaseUntil = now + AGENT_LEASE_MS;
  for (let offset = 0; offset < ids.length; offset += D1_ID_CHUNK) {
    const chunk = ids.slice(offset, offset + D1_ID_CHUNK);
    const claimed = await api.db
      .update(doubanMapping)
      .set({
        agent: sql`json_object('token', lower(hex(randomblob(16))), 'leaseUntil', ${leaseUntil})`,
      })
      .where(
        and(
          eligibleWhere(includeSuggested),
          sql`NOT (
            json_extract(${doubanMapping.agent}, '$.token') IS NOT NULL
            AND json_extract(${doubanMapping.agent}, '$.leaseUntil') > ${now}
          )`,
          inArray(doubanMapping.doubanId, chunk),
        ),
      )
      .returning({ doubanId: doubanMapping.doubanId, agent: doubanMapping.agent });
    for (const row of claimed) {
      const token = parseAgent(row.agent)?.token;
      if (token) jobs.push({ doubanId: row.doubanId, agentToken: token });
    }
  }
  return jobs;
}

export async function enqueueUnmatchedAgentJobs(doubanIds: readonly number[]): Promise<number> {
  const ids = parseEnqueueIds(doubanIds.map(String));
  if (ids.length === 0) return 0;
  const { env, ctx } = getContext();
  if (!env.AGENT_MATCH_QUEUE) return 0;
  const jobs = await claimAgentJobs(ids.length, Date.now(), ids, false);
  await Promise.all(
    jobs.map((job) => {
      const sent = env.AGENT_MATCH_QUEUE.send(job);
      ctx.waitUntil(sent);
      return sent;
    }),
  );
  return jobs.length;
}

export async function persistAndEnqueueUnmatched(mappings: DoubanIdMapping[]): Promise<void> {
  await api.persistIdMapping(mappings, false);
  const missed = mappings.filter((mapping) => mapping.tmdbId == null).map((mapping) => mapping.doubanId);
  if (missed.length === 0) return;
  await enqueueUnmatchedAgentJobs(missed);
}
