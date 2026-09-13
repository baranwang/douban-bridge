import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { ADDON } from "@douban-bridge/contracts/addon";
import { app } from "../src/index";

const ORIGIN = "https://stremio-addon-douban.baran.wang";
const POSTER = "https://img1.doubanio.com/test.jpg";
const CONFIG = "11111111-1111-4111-8111-111111111111";

const movieItem = {
  doubanId: 1291546,
  mediaType: "movie",
  title: "测试电影",
  description: "详情",
  year: "1994",
  rating: 9.7,
  tmdbId: 278,
  imdbId: "tt0111161",
  images: { poster: POSTER, background: null, logo: null },
  genres: ["剧情"],
  links: [],
  actors: [],
  directors: [],
};

type CoreCall = { url: string; method: string };

function ctx() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    execution: {
      waitUntil(p: Promise<unknown>) {
        pending.push(p);
      },
      passThroughOnException() {},
    } as unknown as ExecutionContext,
  };
}

function env(item: typeof movieItem | Record<string, unknown> = movieItem, calls: CoreCall[] = []) {
  return {
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
    CORE_WEB: {
      fetch: async () => {
        throw new Error("CORE_WEB must not be called for protocol requests");
      },
    },
    CORE_STREMIO: {
      fetch: async (input: Request | URL | string) => {
        const request = new Request(input);
        calls.push({ url: request.url, method: request.method });
        const url = new URL(request.url);
        if (url.origin !== "https://core.internal") {
          return new Response("public core forbidden", { status: 500 });
        }
        if (url.pathname === "/stremio/manifest") {
          if (!url.searchParams.get("config")) return Response.json({ redirectConfig: "encoded-default" });
          return Response.json({ catalogs: [{ id: "movie_top250", name: "豆瓣 Top250", type: "movie" }] });
        }
        if (url.pathname.startsWith("/stremio/catalog/")) return Response.json({ items: [item] });
        if (url.pathname.startsWith("/stremio/meta/")) return Response.json({ item });
        return new Response(null, { status: 404 });
      },
    },
  };
}

describe("stremio protocol", () => {
  test("maps a movie meta including every old compatibility field", async () => {
    const calls: CoreCall[] = [];
    const { execution } = ctx();
    const response = await app.fetch(
      new Request(`${ORIGIN}/meta/movie/douban:1291546.json`),
      env(movieItem, calls),
      execution,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      meta: {
        id: "douban:1291546",
        type: "movie",
        name: "测试电影",
        description: "详情",
        poster: POSTER,
        genres: ["剧情"],
        links: [],
        imdb_id: "tt0111161",
        tmdb_id: "tmdb:278",
        tmdbId: 278,
        behaviorHints: { defaultVideoId: "tt0111161" },
      },
      cacheMaxAge: 86400,
      staleRevalidate: 604800,
      staleError: 604800,
    });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin, "https://core.internal");
    assert.equal(url.pathname, "/stremio/meta/1291546");
    assert.equal(url.searchParams.get("origin"), ORIGIN);
    assert.equal(url.searchParams.get("config"), null);
    assert.equal(url.hostname === "douban-bridge-dash.baran.wang", false);
  });

  test("config-scoped URLs pass config and TV becomes series", async () => {
    const calls: CoreCall[] = [];
    const { execution } = ctx();
    const tv = { ...movieItem, mediaType: "tv", title: "测试剧集" };
    const response = await app.fetch(
      new Request(`${ORIGIN}/${CONFIG}/meta/series/douban:1291546.json`),
      env(tv, calls),
      execution,
    );
    const { meta } = (await response.json()) as { meta: { type: string } };
    assert.equal(meta.type, "series");
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("config"), CONFIG);
    assert.equal(url.origin, "https://core.internal");
  });

  test("TMDB-only defaultVideoId is tmdb prefixed and unmapped items omit fake ids", async () => {
    const { execution } = ctx();
    const tmdbOnly = await app.fetch(
      new Request(`${ORIGIN}/meta/movie/douban:1291546.json`),
      env({ ...movieItem, imdbId: null }),
      execution,
    );
    const tmdbBody = (await tmdbOnly.json()) as {
      meta: { tmdb_id: string; tmdbId: number; imdb_id?: string; behaviorHints: { defaultVideoId: string } };
    };
    assert.equal(tmdbBody.meta.tmdb_id, "tmdb:278");
    assert.equal(tmdbBody.meta.tmdbId, 278);
    assert.equal("imdb_id" in tmdbBody.meta, false);
    assert.equal(tmdbBody.meta.behaviorHints.defaultVideoId, "tmdb:278");

    const unmapped = await app.fetch(
      new Request(`${ORIGIN}/${CONFIG}/meta/movie/douban:1291546.json`),
      env({ ...movieItem, tmdbId: null, imdbId: null }),
      execution,
    );
    const raw = (await unmapped.json()) as { meta: Record<string, unknown> };
    assert.equal("tmdb_id" in raw.meta, false);
    assert.equal("tmdbId" in raw.meta, false);
    assert.equal("imdb_id" in raw.meta, false);
    assert.equal("defaultVideoId" in (raw.meta.behaviorHints as object), false);
  });

  test("catalog projection keeps year, omits null images, and uses public plus config URLs", async () => {
    const calls: CoreCall[] = [];
    const { execution } = ctx();
    const publicRes = await app.fetch(
      new Request(`${ORIGIN}/catalog/movie/movie_top250.json`),
      env(movieItem, calls),
      execution,
    );
    const expectedMeta = {
      id: "douban:1291546",
      type: "movie",
      name: "测试电影",
      description: "详情",
      poster: POSTER,
      year: "1994",
      genres: ["剧情"],
      links: [],
      imdb_id: "tt0111161",
      tmdb_id: "tmdb:278",
      tmdbId: 278,
    };
    assert.deepEqual(await publicRes.json(), {
      metas: [expectedMeta],
      cacheMaxAge: 86400,
      staleRevalidate: 604800,
      staleError: 604800,
    });
    const scoped = await app.fetch(
      new Request(`${ORIGIN}/${CONFIG}/catalog/movie/movie_top250/genre=${encodeURIComponent("剧情")}&skip=20.json`),
      env(movieItem, calls),
      execution,
    );
    assert.equal(scoped.status, 200);
    const catalogUrl = new URL(calls[1].url);
    assert.equal(catalogUrl.origin, "https://core.internal");
    assert.equal(catalogUrl.pathname, "/stremio/catalog/movie_top250");
    assert.equal(catalogUrl.searchParams.get("config"), CONFIG);
    assert.equal(catalogUrl.searchParams.get("skip"), "20");
    assert.equal(catalogUrl.searchParams.get("genre"), "剧情");
    assert.equal(catalogUrl.searchParams.get("origin"), ORIGIN);
  });

  test("manifest keeps ADDON identity, original logo, and a relative missing-config redirect", async () => {
    const calls: CoreCall[] = [];
    const { execution } = ctx();
    const missing = await app.fetch(new Request(`${ORIGIN}/manifest.json`), env(movieItem, calls), execution);
    assert.equal(missing.status, 302);
    assert.equal(missing.headers.get("location"), "/encoded-default/manifest.json");
    const listed = await app.fetch(new Request(`${ORIGIN}/${CONFIG}/manifest.json`), env(movieItem, calls), execution);
    assert.deepEqual(await listed.json(), {
      id: `${ADDON.id}.${CONFIG}`,
      version: ADDON.version,
      name: ADDON.name,
      description: ADDON.description,
      logo: "https://stremio-addon-douban.baran.wang/icon.png",
      types: ["movie", "series"],
      resources: ["catalog", "meta"],
      catalogs: [{ id: "movie_top250", name: "豆瓣 Top250", type: "movie" }],
      idPrefixes: ["douban:"],
      behaviorHints: { configurable: true },
    });
    assert.equal(new URL(calls[0].url).pathname, "/stremio/manifest");
    assert.equal(new URL(calls[1].url).searchParams.get("config"), CONFIG);
  });
});
