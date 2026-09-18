import type { CandidateId, CanonicalCandidate } from "./types";

export type { CandidateId, CanonicalCandidate };

export function makeCandidateId(type: "movie" | "tv", tmdbId: number): CandidateId {
  return `tmdb:${type}:${tmdbId}`;
}

export function parseCandidateId(id: string): { type: "movie" | "tv"; tmdbId: number } | null {
  const match = id.match(/^tmdb:(movie|tv):(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "movie" | "tv", tmdbId: Number(match[2]) };
}

export class CandidateRegistry {
  private readonly candidates = new Map<CandidateId, CanonicalCandidate>();

  register(candidate: Omit<CanonicalCandidate, "candidateId"> & { candidateId?: CandidateId }): CanonicalCandidate {
    const candidateId = candidate.candidateId ?? makeCandidateId(candidate.type, candidate.tmdbId);
    const existing = this.candidates.get(candidateId);
    if (!existing) {
      const created: CanonicalCandidate = { ...candidate, candidateId };
      this.candidates.set(candidateId, created);
      return created;
    }
    const merged: CanonicalCandidate = { ...existing };
    for (const key of ["title", "originalTitle", "year", "imdbId", "traktId"] as const) {
      if (merged[key] == null && candidate[key] != null) {
        merged[key] = candidate[key] as never;
      }
    }
    this.candidates.set(candidateId, merged);
    return merged;
  }

  get(id: string): CanonicalCandidate | undefined {
    return this.candidates.get(id as CandidateId);
  }

  has(id: string): boolean {
    return this.candidates.has(id as CandidateId);
  }

  list(): CanonicalCandidate[] {
    return [...this.candidates.values()];
  }
}
