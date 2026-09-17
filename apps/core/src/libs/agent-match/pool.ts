import { and, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { AGENT_LEASE_MS } from "./constants";
import { hashAgentInput } from "./verifier";

export type AgentMatchJob = {
  doubanId: number;
  mappingRevision: number;
  agentToken: string;
  agentInputHash: string;
};

function eligibleWhere(now: number) {
  return and(
    isNull(doubanMapping.tmdbId),
    or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
    or(
      isNull(doubanMapping.agentState),
      and(eq(doubanMapping.agentState, "no_match"), lte(doubanMapping.nextAgentAt, now), isNull(doubanMapping.agentInputHash)),
    ),
  );
}

export async function recoverExpiredClaims(now = Date.now()): Promise<number> {
  const recovered = await api.db
    .update(doubanMapping)
    .set({
      agentState: null,
      agentToken: null,
      agentLeaseUntil: null,
    })
    .where(
      and(
        inArray(doubanMapping.agentState, ["pending", "running"]),
        lte(doubanMapping.agentLeaseUntil, now),
      ),
    )
    .returning({ doubanId: doubanMapping.doubanId });
  return recovered.length;
}

export async function claimAgentJobs(limit: number, now = Date.now()): Promise<AgentMatchJob[]> {
  if (limit <= 0) return [];
  const candidates = await api.db
    .select()
    .from(doubanMapping)
    .where(eligibleWhere(now))
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  const jobs: AgentMatchJob[] = [];
  for (const row of candidates) {
    const agentToken = crypto.randomUUID();
    const agentInputHash =
      row.agentInputHash ??
      hashAgentInput({
        doubanId: row.doubanId,
        title: String(row.doubanId),
        type: "unknown",
        imdbId: row.imdbId,
      });
    const claimed = await api.db
      .update(doubanMapping)
      .set({
        agentState: "pending",
        agentToken,
        agentLeaseUntil: now + AGENT_LEASE_MS,
        agentInputHash,
      })
      .where(
        and(
          eq(doubanMapping.doubanId, row.doubanId),
          isNull(doubanMapping.tmdbId),
          or(isNull(doubanMapping.agentState), and(eq(doubanMapping.agentState, "no_match"), isNull(doubanMapping.agentInputHash))),
        ),
      )
      .returning({
        doubanId: doubanMapping.doubanId,
        mappingRevision: doubanMapping.mappingRevision,
      });
    if (claimed[0]) {
      jobs.push({
        doubanId: claimed[0].doubanId,
        mappingRevision: claimed[0].mappingRevision,
        agentToken,
        agentInputHash,
      });
    }
  }
  return jobs;
}
