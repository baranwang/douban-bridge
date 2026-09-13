import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import {
  DEFAULT_COLLECTION_IDS,
  MOVIE_YEARLY_RANKING_ID,
  TV_YEARLY_RANKING_ID,
} from "@douban-bridge/contracts/collections";

const SECRETS = [
  "DOUBAN_API_KEY",
  "TRAKT_CLIENT_SECRET",
  "TMDB_API_KEY",
  "FANART_API_KEY",
  "JWT_SECRET",
  "GITHUB_CLIENT_SECRET",
  "DASH_GITHUB_CLIENT_SECRET",
];

const code = await readFile(new URL("../dist/douban-bridge.js", import.meta.url), "utf8");

test("IIFE bundle has no ESM import, require, core secrets, or Node builtins", () => {
  assert.equal(/\bimport\s+|require\s*\(/.test(code), false);
  for (const name of SECRETS) assert.equal(code.includes(name), false, name);
  assert.equal(/\bfrom\s+["']node:/.test(code), false);
  assert.equal(/\brequire\s*\(\s*["'](?:node:|fs|path|http|crypto)/.test(code), false);
});

test("VM globals, 13 default modules, optional yearly params, empty cloud page", async () => {
  let local = 0;
  const storage = new Map();
  const context = createContext({
    URL,
    URLSearchParams,
    console,
    Widget: {
      http: {
        get: async (url) => {
          const host = new URL(url).hostname;
          if (host !== "douban-bridge-api.baran.wang") local += 1;
          return { statusCode: 200, data: { items: [] } };
        },
      },
      tmdb: {
        get: async () => {
          local += 1;
          throw new Error("tmdb");
        },
      },
      storage: {
        get: (key) => storage.get(key) ?? null,
        set: (key, value) => storage.set(key, value),
        remove: (key) => storage.delete(key),
      },
    },
  });
  runInContext(code, context);
  assert.ok(context.WidgetMetadata);
  assert.equal(typeof context.loadDefaultCatalog, "function");
  assert.equal(typeof context.loadGenreCatalog, "function");
  assert.equal(typeof context.loadYearlyCatalog, "function");
  assert.equal(typeof context.loadDetail, "function");
  assert.equal(DEFAULT_COLLECTION_IDS.length, 13);
  for (const id of DEFAULT_COLLECTION_IDS) {
    assert.ok(
      context.WidgetMetadata.modules.some((module) => module.id === id),
      id,
    );
  }
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
  const items = await context.loadDefaultCatalog({ collectionId: "movie_top250", sk: "sk_test" });
  assert.equal(items.length, 0);
  assert.equal(local, 0);
});
