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
