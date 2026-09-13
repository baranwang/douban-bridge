import type { ManifestCatalog } from "@stremio-addon/sdk";
import pLimit from "p-limit";
import { api, DoubanAPI } from "./api";
import {
  COLLECTION_CONFIGS,
  DEFAULT_COLLECTION_IDS,
  getLatestYearlyRanking,
  isYearlyRankingId,
  YEARLY_RANKING_CONFIGS,
} from "./collections";
import type { Config } from "./config";

export const getCatalogs = async (config: Config) => {
  const limit = pLimit(5);
  const catalogsPromises: Promise<ManifestCatalog>[] = [];

  const catalogIdsSet = new Set(config.catalogIds || DEFAULT_COLLECTION_IDS);
  const catalogMap = new Map([...COLLECTION_CONFIGS, ...YEARLY_RANKING_CONFIGS].map((item) => [item.id, item]));

  if (config.dynamicCollections) {
    const categories = [
      { type: "movie", moduleName: "movie_selected_chart_collections", catalogType: "movie" },
      { type: "tv", moduleName: "tv_selected_chart_collections", catalogType: "series" },
    ] as const;

    await Promise.allSettled(
      categories.map(async ({ type, moduleName, catalogType }) => {
        try {
          const resp = await api.doubanAPI.getModules(type);
          const module = resp.modules.find((m) => m?.module_name === moduleName);

          for (const collection of module?.data.selected_collections ?? []) {
            if (!collection.is_merged_cover) {
              continue;
            }
            catalogMap.set(collection.id, {
              id: collection.id,
              name: collection.title,
              type: catalogType,
              hasGenre: false,
            });
            catalogIdsSet.add(collection.id);
          }
        } catch (error) {
          console.error(`Failed to fetch dynamic collections for ${type}:`, error);
        }
      }),
    );
  }

  for (const catalogId of catalogIdsSet) {
    let collectionId = catalogId;
    const item = catalogMap.get(catalogId);
    if (!item) {
      continue;
    }
    catalogsPromises.push(
      limit(async () => {
        const result: ManifestCatalog = {
          ...item,
        };
        if (isYearlyRankingId(item.id)) {
          const latest = getLatestYearlyRanking(item.id);
          if (latest) {
            result.name = latest.name;
            collectionId = latest.id;
          }
        }
        result.extra ||= [];
        result.extra.push({ name: "skip" });

        if (item.hasGenre) {
          const info = await api.doubanAPI.getSubjectCollectionCategory(collectionId).catch(() => null);
          const categoryItems = info?.items ?? [];
          if (categoryItems.length > 1) {
            result.extra.push({ name: "genre", options: categoryItems.map((item) => item.name), optionsLimit: 1 });
          }
        }
        return result;
      }),
    );
  }

  return Promise.all(catalogsPromises);
};
