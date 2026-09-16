import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import {
  COLLECTION_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_YEARLY_RANKING_ID,
} from "@douban-bridge/contracts/collections";

const DEFAULT_CATALOG_IDS = COLLECTION_CONFIGS.filter((item) => !item.hasGenre).map((item) => item.id);

const SECRETS = [
  "DOUBAN_API_KEY",
  "TRAKT_CLIENT_SECRET",
  "TMDB_API_KEY",
  "FANART_API_KEY",
  "JWT_SECRET",
  "GITHUB_CLIENT_SECRET",
];

const code = await readFile(new URL("../dist/douban-bridge.js", import.meta.url), "utf8");

test("Rex bundle has no ESM import, require, core secrets, or Node builtins", () => {
  assert.equal(/\bimport\s+|require\s*\(/.test(code), false);
  for (const name of SECRETS) assert.equal(code.includes(name), false, name);
  assert.equal(/\bfrom\s+["']node:/.test(code), false);
  assert.equal(/\brequire\s*\(\s*["'](?:node:|fs|path|http|crypto)/.test(code), false);
});

test("VM globals, Stremio catalog order, optional yearly params, empty cloud page", async () => {
  let local = 0;
  const storage = new Map();
  const context = createContext({
    console,
    Widget: {
      http: {
        get: async (url, options) => {
          if (!url.startsWith("https://douban-bridge.baran.wang/")) local += 1;
          assert.equal(options.headers.Authorization, "Bearer sk_test");
          assert.equal(options.headers["X-User-Id"], "user-1");
          return { statusCode: 200, data: { items: [] }, headers: {} };
        },
      },
      tmdb: {
        get: async () => {
          local += 1;
          throw new Error("tmdb");
        },
      },
      storage: {
        get: async (key) => storage.get(key) ?? null,
        set: async (key, value) => storage.set(key, value),
        remove: async (key) => storage.delete(key),
      },
    },
  });
  runInContext(code, context);
  assert.ok(context.WidgetMetadata);
  assert.equal(typeof context.loadDefaultCatalog, "function");
  assert.equal(typeof context.loadGenreCatalog, "function");
  assert.equal(typeof context.loadYearlyCatalog, "function");
  assert.equal(typeof context.loadMovieRecommendCatalog, "function");
  assert.equal(typeof context.loadTvRecommendCatalog, "function");
  assert.equal(typeof context.loadSearch, "function");
  assert.equal(context.WidgetMetadata.search.functionName, "loadSearch");
  assert.equal(context.loadDetail, undefined);
  const catalogIds = context.WidgetMetadata.modules
    .filter((module) => module.functionName === "loadDefaultCatalog")
    .map((module) => module.id);
  assert.equal(JSON.stringify(catalogIds), JSON.stringify(DEFAULT_CATALOG_IDS));
  const movieYearly = context.WidgetMetadata.modules.find((module) => module.id === "movie_yearly");
  const collectionId = movieYearly.params.find((param) => param.name === "collectionId");
  assert.equal(collectionId.required, undefined);
  assert.ok(
    collectionId.enumOptions.some((option) => option.value === MOVIE_YEARLY_RANKING_ID && option.title === "最新年度"),
  );
  assert.ok(
    context.WidgetMetadata.modules
      .find((module) => module.id === "tv_yearly")
      .params.find((param) => param.name === "collectionId")
      .enumOptions.some((option) => option.value === TV_YEARLY_RANKING_ID),
  );
  const items = await context.loadDefaultCatalog({ collectionId: "movie_top250", sk: "sk_test", userId: "user-1" });
  assert.equal(items.length, 0);
  assert.equal(local, 0);
});
