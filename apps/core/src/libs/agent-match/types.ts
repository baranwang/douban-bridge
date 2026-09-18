export type CandidateId = `tmdb:${"movie" | "tv"}:${number}`;

export type CanonicalCandidate = {
  candidateId: CandidateId;
  type: "movie" | "tv";
  tmdbId: number;
  title?: string;
  originalTitle?: string;
  year?: string;
  imdbId?: string;
  traktId?: number;
};

export type AgentStatus = "suggested" | "no_match";

export type AgentBlob = {
  token?: string;
  leaseUntil?: number;
  status?: AgentStatus;
  confidence?: number;
  reason?: string;
  candidateId?: string;
  tmdbId?: number | null;
  imdbId?: string | null;
  traktId?: number | null;
};

export type AgentMatchJob = {
  doubanId: number;
  agentToken: string;
};
