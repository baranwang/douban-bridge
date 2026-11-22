import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import {
  COLLECTION_CONFIGS,
  MOVIE_YEARLY_RANKING_ID,
  TV_YEARLY_RANKING_ID,
} from "@douban-bridge/contracts/collections";
import { describe, expect, test } from "@rstest/core";

const DEFAULT_CATALOG_IDS = COLLECTION_CONFIGS.filter((item) => !item.hasGenre).map((item) => item.id);

const SECRETS = [
  "DOUBAN_API_KEY",
  "TRAKT_CLIENT_SECRET",
  "TMDB_API_KEY",
  "FANART_API_KEY",
  "JWT_SECRET",
  "GITHUB_CLIENT_SECRET",
];

describe("compiled Rex bundle", () => {
  test("Rex bundle has no ESM import, require, core secrets, or Node builtins", async () => {
    const code = await readFile(new URL("../dist/douban-bridge.js", import.meta.url), "utf8");
    expect(/\bimport\s+|require\s*\(/.test(code)).toBe(false);
    for (const name of SECRETS) {
      expect(code.includes(name)).toBe(false);
    }
    expect(/\bfrom\s+["']node:/.test(code)).toBe(false);
    expect(/\brequire\s*\(\s*["'](?:node:|fs|path|http|crypto)/.test(code)).toBe(false);
  });

  test("VM globals, Stremio catalog order, dynamicOptions loaders, and empty cloud page", async () => {
    const code = await readFile(new URL("../dist/douban-bridge.js", import.meta.url), "utf8");
    let local = 0;
    const storage = new Map<string, unknown>();
    const context = createContext({
      console,
      Widget: {
        http: {
          get: async (url: string, options?: { headers?: Record<string, string> }) => {
            if (url.startsWith("https://douban-bridge.baran.wang/")) {
              expect(options?.headers?.Authorization).toBe("Bearer sk_test");
              expect(options?.headers?.["X-User-Id"]).toBe("user-1");
              return { statusCode: 200, data: { items: [] }, headers: {} };
            }
            if (url.includes("/subject_collection/ECE472UNY")) {
              return {
                statusCode: 200,
                data: {
                  category_tabs: [
                    {
                      category: "2025",
                      items: [
                        { current: true, id: "ECE472UNY", name: "华语" },
                        { current: false, id: "ECB5AE5EQ", name: "外语" },
                      ],
                    },
                  ],
                },
                headers: {},
              };
            }
            if (url.includes("/movie/modules")) {
              return {
                statusCode: 200,
                data: {
                  modules: [
                    {
                      module_name: "movie_selected_chart_collections",
                      data: {
                        selected_collections: [
                          { id: "EC_VM_1", title: "精选专题", is_merged_cover: true, is_official: true },
                        ],
                      },
                    },
                  ],
                },
                headers: {},
              };
            }
            local += 1;
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
          get: (key: string) => storage.get(key) ?? null,
          set: (key: string, value: unknown) => {
            storage.set(key, value);
          },
          remove: (key: string) => {
            storage.delete(key);
          },
        },
      },
    }) as Record<string, unknown>;

    runInContext(code, context);

    const metadata = context.WidgetMetadata as WidgetMetadata;
    expect(metadata).toBeDefined();
    expect(metadata.requiredVersion).toBe("0.0.6");
    expect(typeof context.loadDefaultCatalog).toBe("function");
    expect(typeof context.loadGenreCatalog).toBe("function");
    expect(typeof context.loadYearlyCatalog).toBe("function");
    expect(typeof context.loadSelectedCatalog).toBe("function");
    expect(typeof context.loadMovieRecommendCatalog).toBe("function");
    expect(typeof context.loadTvRecommendCatalog).toBe("function");
    expect(typeof context.loadSearch).toBe("function");
    expect(typeof context.loadSubCollections).toBe("function");
    expect(typeof context.loadSelectedCollections).toBe("function");
    expect(typeof context.loadTvRecommendSubGenres).toBe("function");
    expect(context.loadDetail).toBeUndefined();
    expect(metadata.search?.functionName).toBe("loadSearch");

    const catalogIds = metadata.modules.filter((mod) => mod.functionName === "loadDefaultCatalog").map((mod) => mod.id);
    expect(catalogIds).toEqual(DEFAULT_CATALOG_IDS);

    const movieYearly = metadata.modules.find((mod) => mod.id === "movie_yearly");
    const collectionId = movieYearly?.params?.find((param) => param.name === "collectionId");
    expect(
      collectionId?.enumOptions?.some(
        (option) => option.value === MOVIE_YEARLY_RANKING_ID && option.title === "最新年度",
      ),
    ).toBe(true);
    expect(
      metadata.modules
        .find((mod) => mod.id === "tv_yearly")
        ?.params?.find((param) => param.name === "collectionId")
        ?.enumOptions?.some((option) => option.value === TV_YEARLY_RANKING_ID),
    ).toBe(true);

    const loadDefault = context.loadDefaultCatalog as (params: Record<string, unknown>) => Promise<VideoItem[]>;
    const items = await loadDefault({ collectionId: "movie_top250", sk: "sk_test", userId: "user-1" });
    expect(items).toHaveLength(0);
    expect(local).toBe(0);

    const loadSub = context.loadSubCollections as (
      params: Record<string, unknown>,
    ) => Promise<WidgetModuleParamOption[]>;
    const subOptions = await loadSub({ collectionId: MOVIE_YEARLY_RANKING_ID });
    expect(subOptions).toEqual([
      { title: "华语", value: "ECE472UNY" },
      { title: "外语", value: "ECB5AE5EQ" },
    ]);

    const loadSelected = context.loadSelectedCollections as (
      params: Record<string, unknown>,
    ) => Promise<WidgetModuleParamOption[]>;
    const selectedOptions = await loadSelected({ type: "movie" });
    expect(selectedOptions).toEqual([{ title: "精选专题", value: "EC_VM_1" }]);

    const loadTvSub = context.loadTvRecommendSubGenres as (
      params: Record<string, unknown>,
    ) => WidgetModuleParamOption[];
    expect(loadTvSub({ genre: "综艺" })[0]).toEqual({ title: "全部", value: "综艺" });
  });
});
