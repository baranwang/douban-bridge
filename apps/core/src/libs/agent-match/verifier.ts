import { createHash } from "node:crypto";
import {
  AGENT_AUTO_WRITE_MIN_CONFIDENCE,
  AGENT_BACKOFF_MS,
  AGENT_POLICY_VERSION,
  AGENT_REASON_MAX_CHARS,
  AGENT_SUGGEST_MIN_CONFIDENCE,
} from "./constants";
import type { CandidateRegistry } from "./candidates";
import type { CanonicalCandidate } from "./types";

export function truncateReason(reason: string): string {
  return reason.length <= AGENT_REASON_MAX_CHARS ? reason : reason.slice(0, AGENT_REASON_MAX_CHARS);
}

export function computeNextAgentAt(attempts: number, now = Date.now()): number {
  const index = Math.min(Math.max(attempts, 1) - 1, AGENT_BACKOFF_MS.length - 1);
  return now + AGENT_BACKOFF_MS[index];
}

export function hashAgentInput(input: {
  doubanId: number;
  title: string;
  originalTitle?: string | null;
  year?: string | null;
  type: string;
  imdbId?: string | null;
}): string {
  const payload = JSON.stringify({
    doubanId: input.doubanId,
    title: input.title,
    originalTitle: input.originalTitle ?? null,
    year: input.year ?? null,
    type: input.type,
    imdbId: input.imdbId ?? null,
    policy: AGENT_POLICY_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function parseYear(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

export function verifyConcludeMatch(input: {
  decision: "match" | "none";
  candidateId?: string;
  confidence: number;
  reason: string;
  registry: CandidateRegistry;
  douban: {
    type: "movie" | "tv";
    title: string;
    originalTitle?: string | null;
    year?: string | null;
    imdbId?: string | null;
  };
}): {
  tier: "auto" | "suggest" | "none";
  code: string;
  candidate?: CanonicalCandidate;
  reason: string;
} {
  const reason = truncateReason(input.reason);
  if (input.decision === "none") {
    return { tier: "none", code: "none", reason };
  }
  if (input.confidence < AGENT_SUGGEST_MIN_CONFIDENCE) {
    return { tier: "none", code: "low_confidence", reason };
  }
  if (!input.candidateId) {
    return { tier: "none", code: "unknown_candidate", reason };
  }
  const candidate = input.registry.get(input.candidateId);
  if (!candidate) {
    return { tier: "none", code: "unknown_candidate", reason };
  }
  if (candidate.type !== input.douban.type) {
    return { tier: "none", code: "type_mismatch", candidate, reason };
  }

  const doubanYear = parseYear(input.douban.year);
  const candidateYear = parseYear(candidate.year);
  if (input.douban.type === "movie" && doubanYear != null && candidateYear != null && Math.abs(doubanYear - candidateYear) >= 3) {
    return { tier: "none", code: "year_conflict", candidate, reason };
  }

  const bothImdb = input.douban.imdbId && candidate.imdbId;
  const imdbConflict = Boolean(bothImdb && input.douban.imdbId !== candidate.imdbId);
  if (imdbConflict) {
    return { tier: "suggest", code: "imdb_conflict", candidate, reason };
  }
  if (input.confidence >= AGENT_AUTO_WRITE_MIN_CONFIDENCE) {
    return { tier: "auto", code: "auto", candidate, reason };
  }
  return { tier: "suggest", code: "suggest", candidate, reason };
}
