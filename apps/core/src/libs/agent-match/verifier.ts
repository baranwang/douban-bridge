import type { CandidateRegistry } from "./candidates";
import { AGENT_AUTO_WRITE_MIN_CONFIDENCE, AGENT_REASON_MAX_CHARS, AGENT_SUGGEST_MIN_CONFIDENCE } from "./constants";
import type { CanonicalCandidate } from "./types";

export function truncateReason(reason: string): string {
  return reason.length <= AGENT_REASON_MAX_CHARS ? reason : reason.slice(0, AGENT_REASON_MAX_CHARS);
}

function parseYear(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

export function normalizeTitle(value?: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function titlesCompatible(
  douban: { title?: string | null; originalTitle?: string | null },
  candidate: { title?: string | null; originalTitle?: string | null },
): boolean {
  const left = [douban.title, douban.originalTitle].map(normalizeTitle).filter(Boolean);
  const right = [candidate.title, candidate.originalTitle].map(normalizeTitle).filter(Boolean);
  return left.some((title) => right.includes(title));
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
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    return { tier: "none", code: "invalid_confidence", reason };
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
  if (
    input.douban.type === "movie" &&
    doubanYear != null &&
    candidateYear != null &&
    Math.abs(doubanYear - candidateYear) >= 3
  ) {
    return { tier: "none", code: "year_conflict", candidate, reason };
  }

  const bothImdb = input.douban.imdbId && candidate.imdbId;
  const imdbConflict = Boolean(bothImdb && input.douban.imdbId !== candidate.imdbId);
  if (imdbConflict) {
    return { tier: "suggest", code: "imdb_conflict", candidate, reason };
  }
  if (input.douban.imdbId && !candidate.imdbId) {
    return { tier: "suggest", code: "missing_imdb", candidate, reason };
  }
  if (input.confidence >= AGENT_AUTO_WRITE_MIN_CONFIDENCE) {
    if (!titlesCompatible(input.douban, candidate)) {
      return { tier: "suggest", code: "title_mismatch", candidate, reason };
    }
    return { tier: "auto", code: "auto", candidate, reason };
  }
  return { tier: "suggest", code: "suggest", candidate, reason };
}
