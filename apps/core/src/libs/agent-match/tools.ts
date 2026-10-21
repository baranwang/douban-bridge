import { eq } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
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
const EXA_CACHE_TTL_SECONDS = 10 * 60;
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

async function callExaMcp(name: string, args: Record<string, unknown>): Promise<string> {
  const response = await fetch(EXA_MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "user-agent": "douban-bridge",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`Exa MCP ${response.status}`);
  const raw = await response.text();
  const payload = raw.trimStart().startsWith("{")
    ? raw
    : raw
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .at(-1)
        ?.slice("data: ".length);
  if (!payload) throw new Error("Exa MCP empty response");
  const data = JSON.parse(payload) as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: Array<{ text?: string }> };
  };
  if (data.error) throw new Error(data.error.message || "Exa MCP error");
  const text = (data.result?.content ?? []).map((item) => item.text ?? "").join("\n");
  if (data.result?.isError) throw new Error(text || "Exa MCP tool error");
  return text;
}

// shortcut: hosted MCP returns prose, not JSON. Switch when tools/call adds structuredContent.
function parseExaSearch(text: string) {
  return text
    .split(/\n---\n/)
    .flatMap((block) => {
      const title = block.match(/^Title: (.*)$/m)?.[1]?.trim();
      const url = block.match(/^URL: (\S+)$/m)?.[1];
      const published = block.match(/^Published: (.*)$/m)?.[1]?.trim();
      if (!url) return [];
      return [
        {
          title: title && title !== "N/A" ? title : null,
          url,
          publishedDate: published && published !== "N/A" ? published : null,
        },
      ];
    })
    .slice(0, 5);
}

function parseExaPages(text: string) {
  const matches = [...text.matchAll(/(?:^|\n\n)# ([^\n]+)\nURL: (\S+)\n\n/g)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1]?.index ?? text.length) : text.length;
    const page = text.slice(start, end).trim();
    return { title: match[1] ?? null, url: match[2], text: page ? page.slice(0, 1500) : null };
  });
}

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

function registerTraktItems(
  registry: CandidateRegistry,
  items: Array<Parameters<typeof api.traktAPI.getSearchResultField>[0]>,
) {
  const results: Array<{
    candidateId: string | null;
    type: "movie" | "tv";
    title?: string;
    originalTitle?: string;
    year?: string | null;
    tmdbId: number | null;
    imdbId: string | null;
    traktId: number | null;
  }> = [];
  for (const item of items.slice(0, MAX_SEARCH_RESULTS)) {
    const type = item.type === "movie" ? "movie" : "tv";
    const ids = api.traktAPI.getSearchResultField(item, "ids");
    const title = api.traktAPI.getSearchResultField(item, "title") ?? undefined;
    const originalTitle = api.traktAPI.getSearchResultField(item, "original_title") ?? undefined;
    const year = api.traktAPI.getSearchResultField(item, "year")?.toString();
    const tmdbId = ids?.tmdb ?? null;
    const imdbId = ids?.imdb ?? null;
    const traktId = ids?.trakt ?? null;
    let candidateId: string | null = null;
    if (tmdbId) {
      const candidate = registry.register({
        type,
        tmdbId,
        title,
        originalTitle,
        year,
        imdbId: imdbId ?? undefined,
        traktId: traktId ?? undefined,
      });
      candidateId = candidate.candidateId;
    }
    results.push({
      candidateId,
      type,
      title,
      originalTitle,
      year: year ?? null,
      tmdbId,
      imdbId,
      traktId,
    });
  }
  return results;
}

export function createAgentMatchTools(
  registry: CandidateRegistry,
  options: { doubanType?: "movie" | "tv"; doubanId?: number } = {},
): AgentTool[] {
  const tmdbAPI = new TmdbAPI();
  let doubanType = options.doubanType;
  // shortcut: concurrent dedupe is per job; use a Durable Object if atomic cross-job dedupe is needed.
  const exaCache = new Map<string, { expiresAt: number; result: Promise<AgentToolExecuteResult> }>();

  async function cachedExa(
    name: string,
    args: unknown,
    load: () => Promise<AgentToolExecuteResult>,
  ): Promise<AgentToolExecuteResult> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([name, args])));
    const key = `agent-match:exa:v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const existing = exaCache.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.result;

    const { env, ctx } = getContext();
    const entry: { expiresAt: number; result: Promise<AgentToolExecuteResult> } = {
      expiresAt: Date.now() + EXA_CACHE_TTL_SECONDS * 1000,
      result: (async () => {
        const cached = await env.KV.get<{ expiresAt: number; value: AgentToolExecuteResult }>(key, "json").catch(
          () => null,
        );
        if (cached && cached.expiresAt > Date.now()) {
          entry.expiresAt = cached.expiresAt;
          return cached.value;
        }
        const value = await load();
        entry.expiresAt = Date.now() + EXA_CACHE_TTL_SECONDS * 1000;
        ctx.waitUntil(
          env.KV.put(key, JSON.stringify({ expiresAt: entry.expiresAt, value }), {
            expirationTtl: EXA_CACHE_TTL_SECONDS,
          }).catch(() => console.warn("Failed to persist Exa tool cache")),
        );
        return value;
      })(),
    };
    exaCache.set(key, entry);
    try {
      return await entry.result;
    } catch (error) {
      if (exaCache.get(key) === entry) exaCache.delete(key);
      throw error;
    }
  }

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
        const doubanId = options.doubanId ?? Number(args.doubanId);
        const detail = await api.doubanAPI.getSubjectDetail(doubanId);
        doubanType = detail.type;
        const mapping = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, doubanId) });
        return {
          doubanId: detail.id,
          type: detail.type,
          title: detail.title,
          original_title: detail.original_title ?? null,
          aka: detail.aka ?? [],
          year: detail.year ?? null,
          pubdate: detail.pubdate ?? [],
          directors: (detail.directors ?? []).slice(0, 3).map((person) => person.name),
          actors: (detail.actors ?? []).slice(0, 5).map((person) => person.name),
          countries: detail.countries ?? [],
          languages: detail.languages ?? [],
          genres: detail.genres ?? [],
          intro: detail.intro?.slice(0, 200) ?? null,
          episodes_count: detail.episodes_count ?? null,
          imdbId: mapping?.deletedAt ? null : (mapping?.imdbId ?? null),
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
      name: "search_trakt",
      description: "Search Trakt movies/shows/episodes. Episode hits register the parent show, not the episode.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["movie", "show", "episode"] },
          query: { type: "string" },
        },
        required: ["type", "query"],
      },
      async execute(args) {
        const type = args.type === "episode" ? "episode" : args.type === "show" ? "show" : "movie";
        const results = await api.traktAPI.search(type, String(args.query ?? ""));
        return { results: registerTraktItems(registry, results) };
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
        const query = String(args.query ?? "").trim();
        if (!query) return { results: [] };
        return cachedExa("search", query, async () => {
          const text = await callExaMcp("web_search_exa", { query, objective: query, numResults: 5 });
          return { results: parseExaSearch(text) };
        });
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
        const raw = args.urls;
        const urls = (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,]+/))
          .map((url) => url.trim())
          .filter(Boolean)
          .slice(0, 3);
        if (urls.length === 0) return { results: [] };
        return cachedExa("contents", urls, async () => {
          const text = await callExaMcp("web_fetch_exa", { urls, maxCharacters: 1500 });
          return { results: parseExaPages(text) };
        });
      },
    },
  ];
}

export { makeCandidateId };
