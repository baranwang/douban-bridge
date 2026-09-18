import { eq } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { ImdbAPI } from "@/libs/api/imdb";
import { TmdbAPI } from "@/libs/api/tmdb";
import { getContext } from "@/libs/middleware";
import { type CandidateRegistry, makeCandidateId } from "./candidates";
import type { CanonicalCandidate } from "./types";

type AgentToolExecuteResult = Record<string, unknown>;

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<AgentToolExecuteResult>;
};

const MAX_SEARCH_RESULTS = 8;

function yearFromTmdbItem(item: {
  release_date?: string | null;
  first_air_date?: string | null;
  year?: string | number | null;
}): string | undefined {
  const raw = item.year ?? item.release_date ?? item.first_air_date;
  if (raw == null) return undefined;
  const match = String(raw).match(/\d{4}/);
  return match?.[0];
}

function registerTmdbItems(
  registry: CandidateRegistry,
  type: "movie" | "tv",
  items: Array<{
    id: number;
    title?: string | null;
    original_title?: string | null;
    release_date?: string | null;
    first_air_date?: string | null;
  }>,
) {
  const results: Array<{ candidateId: string; title?: string; originalTitle?: string; year?: string; tmdbId: number }> =
    [];
  for (const item of items.slice(0, MAX_SEARCH_RESULTS)) {
    const candidate = registry.register({
      type,
      tmdbId: item.id,
      title: item.title ?? undefined,
      originalTitle: item.original_title ?? undefined,
      year: yearFromTmdbItem(item),
    });
    results.push({
      candidateId: candidate.candidateId,
      title: candidate.title,
      originalTitle: candidate.originalTitle,
      year: candidate.year,
      tmdbId: candidate.tmdbId,
    });
  }
  return results;
}

export function createAgentMatchTools(
  registry: CandidateRegistry,
  options: { doubanType?: "movie" | "tv"; doubanId?: number } = {},
): AgentTool[] {
  const tmdbAPI = new TmdbAPI();
  const imdbAPI = new ImdbAPI();
  let doubanType = options.doubanType;

  return [
    {
      name: "get_douban_subject",
      description: "Fetch trimmed Douban subject metadata for the current job.",
      parameters: {
        type: "object",
        properties: {
          doubanId: { type: "number" },
        },
        required: ["doubanId"],
      },
      async execute(args) {
        const doubanId = Number(args.doubanId ?? options.doubanId);
        const detail = await api.doubanAPI.getSubjectDetail(doubanId);
        doubanType = detail.type;
        const mapping = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, doubanId) });
        return {
          doubanId: detail.id,
          type: detail.type,
          title: detail.title,
          original_title: detail.original_title ?? null,
          year: detail.year ?? null,
          pubdate: detail.pubdate ?? [],
          directors: (detail.directors ?? []).slice(0, 3).map((person) => person.name),
          actors: (detail.actors ?? []).slice(0, 5).map((person) => person.name),
          countries: detail.countries ?? [],
          languages: detail.languages ?? [],
          genres: detail.genres ?? [],
          intro: detail.intro?.slice(0, 200) ?? null,
          imdbId: mapping?.imdbId ?? null,
          tmdbId: mapping?.tmdbId ?? null,
          traktId: mapping?.traktId ?? null,
        };
      },
    },
    {
      name: "search_tmdb",
      description: "Search TMDB movies or TV shows and register closed-set candidates.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["movie", "tv"] },
          query: { type: "string" },
          year: { type: "string" },
        },
        required: ["type", "query"],
      },
      async execute(args) {
        const type = args.type === "tv" ? "tv" : "movie";
        const query = String(args.query ?? "");
        const year = args.year == null ? undefined : String(args.year);
        const resp = await tmdbAPI.search(type, { query, year });
        return { results: registerTmdbItems(registry, type, resp.results) };
      },
    },
    {
      name: "find_tmdb_by_imdb",
      description: "Find TMDB movie/show candidates by IMDb ID. Episode results are ignored.",
      parameters: {
        type: "object",
        properties: {
          imdbId: { type: "string" },
        },
        required: ["imdbId"],
      },
      async execute(args) {
        const type = doubanType ?? "movie";
        const resp = await tmdbAPI.findById(String(args.imdbId), "imdb_id");
        const items = type === "tv" ? resp.tv_results : resp.movie_results;
        return { results: registerTmdbItems(registry, type, items) };
      },
    },
    {
      name: "get_tmdb_external_ids",
      description: "Fetch IMDb/Trakt-facing external IDs for an already registered candidate.",
      parameters: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
        },
        required: ["candidateId"],
      },
      async execute(args) {
        const candidateId = String(args.candidateId ?? "");
        const candidate = registry.get(candidateId);
        if (!candidate) {
          return { error: "unknown_candidate" };
        }
        const external = await tmdbAPI.getExternalId(candidate.type, candidate.tmdbId);
        const updated: CanonicalCandidate = registry.register({
          candidateId: candidate.candidateId,
          type: candidate.type,
          tmdbId: candidate.tmdbId,
          imdbId: external.imdb_id || undefined,
        });
        return {
          candidateId: updated.candidateId,
          tmdbId: updated.tmdbId,
          imdbId: updated.imdbId ?? null,
        };
      },
    },
    {
      name: "lift_imdb_series",
      description: "Lift a season/episode IMDb ID to the parent series IMDb ID.",
      parameters: {
        type: "object",
        properties: {
          imdbId: { type: "string" },
        },
        required: ["imdbId"],
      },
      async execute(args) {
        const resp = await imdbAPI.search(String(args.imdbId));
        return { seriesImdbId: resp.top?.series?.series?.id ?? null };
      },
    },
    {
      name: "exa_search",
      description: "Search the web with Exa for extra evidence. Does not register TMDB candidates.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      async execute(args) {
        const { default: Exa } = await import("exa-js");
        const apiKey = (getContext().env as CloudflareBindings & { EXA_API_KEY?: string }).EXA_API_KEY;
        if (!apiKey) throw new Error("EXA_API_KEY is required");
        const exa = new Exa(apiKey);
        const resp = await exa.search(String(args.query ?? ""), { numResults: 5 });
        return {
          results: (resp.results ?? []).slice(0, 5).map((item) => ({
            title: item.title ?? null,
            url: item.url,
            publishedDate: item.publishedDate ?? null,
          })),
        };
      },
    },
    {
      name: "exa_get_contents",
      description: "Fetch trimmed page text from URLs returned by exa_search.",
      parameters: {
        type: "object",
        properties: {
          urls: { type: "string" },
        },
        required: ["urls"],
      },
      async execute(args) {
        const { default: Exa } = await import("exa-js");
        const apiKey = (getContext().env as CloudflareBindings & { EXA_API_KEY?: string }).EXA_API_KEY;
        if (!apiKey) throw new Error("EXA_API_KEY is required");
        const raw = args.urls;
        const urls = (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,]+/))
          .map((url) => url.trim())
          .filter(Boolean)
          .slice(0, 3);
        if (urls.length === 0) return { results: [] };
        const exa = new Exa(apiKey);
        const resp = await exa.getContents(urls, { text: { maxCharacters: 1500 } });
        return {
          results: (resp.results ?? []).map((item) => ({
            title: item.title ?? null,
            url: item.url,
            text: item.text?.slice(0, 1500) ?? null,
          })),
        };
      },
    },
  ];
}

export { makeCandidateId };
