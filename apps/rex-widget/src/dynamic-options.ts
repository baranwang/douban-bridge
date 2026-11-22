import { catalogQuerySchema } from "@douban-bridge/contracts";
import { getLatestYearlyRanking } from "@douban-bridge/contracts/collections";
import { fetchDoubanModules, fetchSubjectCollectionInfo } from "./basic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SUB_COLLECTION_STORAGE_PREFIX = "douban.bridge.sub_collections:";
const SELECTED_COLLECTION_STORAGE_PREFIX = "douban.bridge.selected_collections:";

type CacheEntry = {
  expiresAt: number;
  options: WidgetModuleParamOption[];
};

const subCollectionCache = new Map<string, CacheEntry>();
const selectedCollectionCache = new Map<"movie" | "tv", CacheEntry>();

function isValidOption(item: unknown): item is WidgetModuleParamOption {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as { title?: unknown }).title === "string" &&
    typeof (item as { value?: unknown }).value === "string"
  );
}

function dedupeOptions(items: WidgetModuleParamOption[]): WidgetModuleParamOption[] {
  const seen = new Set<string>();
  const result: WidgetModuleParamOption[] = [];
  for (const item of items) {
    const title = item.title.trim();
    const value = item.value.trim();
    if (!title || !value || seen.has(value)) continue;
    seen.add(value);
    result.push({ title, value });
  }
  return result;
}

function readMemoryCache<K>(cache: Map<K, CacheEntry>, key: K): WidgetModuleParamOption[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.options;
}

function writeMemoryCache<K>(cache: Map<K, CacheEntry>, key: K, options: WidgetModuleParamOption[]) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, options });
}

async function readStorageCache(key: string): Promise<WidgetModuleParamOption[] | undefined> {
  try {
    const raw = await Widget.storage?.get(key);
    if (!raw) return undefined;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { expiresAt?: unknown }).expiresAt !== "number" ||
      (parsed as { expiresAt: number }).expiresAt <= Date.now() ||
      !Array.isArray((parsed as { options?: unknown }).options)
    ) {
      return undefined;
    }
    return (parsed as { options: unknown[] }).options.filter(isValidOption);
  } catch {
    return undefined;
  }
}

async function writeStorageCache(key: string, options: WidgetModuleParamOption[]) {
  try {
    await Widget.storage?.set(key, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, options }));
  } catch {
    /* 忽略宿主存储异常 */
  }
}

export function clearDynamicOptionsCache() {
  subCollectionCache.clear();
  selectedCollectionCache.clear();
}

export function getCachedSubCollections(collectionId: string): WidgetModuleParamOption[] | undefined {
  const resolvedId = getLatestYearlyRanking(collectionId)?.id ?? collectionId;
  return readMemoryCache(subCollectionCache, resolvedId);
}

export function getCachedSelectedCollections(type: "movie" | "tv"): WidgetModuleParamOption[] | undefined {
  return readMemoryCache(selectedCollectionCache, type);
}

export function resolveSubCollectionId(collectionId: string, subCollectionId?: string): string {
  const resolvedId = getLatestYearlyRanking(collectionId)?.id ?? collectionId;
  const trimmed = String(subCollectionId ?? "").trim();
  if (!trimmed) return resolvedId;
  const cached = readMemoryCache(subCollectionCache, resolvedId);
  if (cached && !cached.some((option) => option.value === trimmed)) {
    return resolvedId;
  }
  return trimmed;
}

export async function fetchSubCollectionOptions(collectionId: string): Promise<WidgetModuleParamOption[]> {
  const raw = String(collectionId ?? "").trim();
  if (!raw) return [];
  const resolvedId = getLatestYearlyRanking(raw)?.id ?? raw;
  if (!catalogQuerySchema.shape.collectionId.safeParse(resolvedId).success) return [];

  const memHit = readMemoryCache(subCollectionCache, resolvedId);
  if (memHit) return memHit;

  const storageKey = `${SUB_COLLECTION_STORAGE_PREFIX}${resolvedId}`;
  const storageHit = await readStorageCache(storageKey);
  if (storageHit) {
    writeMemoryCache(subCollectionCache, resolvedId, storageHit);
    return storageHit;
  }

  try {
    const info = await fetchSubjectCollectionInfo(resolvedId);
    const tabs = info.category_tabs ?? [];
    const activeTab =
      tabs.find((tab) => tab?.items?.some((item) => item.current)) ??
      tabs.find((tab) => tab?.items?.some((item) => item.id === resolvedId));

    for (const tab of tabs) {
      const items = tab?.items ?? [];
      const options = dedupeOptions(items.map((item) => ({ title: item.name, value: item.id })));
      if (options.length <= 1) continue;
      for (const option of options) {
        if (option.value !== resolvedId) {
          writeMemoryCache(subCollectionCache, option.value, options);
        }
      }
    }

    const activeOptions = dedupeOptions((activeTab?.items ?? []).map((item) => ({ title: item.name, value: item.id })));
    const result = activeOptions.length > 1 ? activeOptions : [];
    writeMemoryCache(subCollectionCache, resolvedId, result);
    await writeStorageCache(storageKey, result);
    return result;
  } catch {
    return [];
  }
}

export async function fetchSelectedCollectionOptions(type: "movie" | "tv"): Promise<WidgetModuleParamOption[]> {
  const memHit = readMemoryCache(selectedCollectionCache, type);
  if (memHit) return memHit;

  const storageKey = `${SELECTED_COLLECTION_STORAGE_PREFIX}${type}`;
  const storageHit = await readStorageCache(storageKey);
  if (storageHit && storageHit.length > 0) {
    writeMemoryCache(selectedCollectionCache, type, storageHit);
    return storageHit;
  }

  try {
    const moduleName = type === "tv" ? "tv_selected_chart_collections" : "movie_selected_chart_collections";
    const resp = await fetchDoubanModules(type);
    const mod = resp.modules.find((item) => item?.module_name === moduleName);
    const options = dedupeOptions(
      (mod?.data.selected_collections ?? [])
        .filter((item) => item.is_merged_cover)
        .map((item) => ({ title: item.title, value: item.id })),
    );
    if (options.length > 0) {
      writeMemoryCache(selectedCollectionCache, type, options);
      await writeStorageCache(storageKey, options);
    }
    return options;
  } catch {
    return [];
  }
}

export async function resolveSelectedCollectionId(type: "movie" | "tv", collectionId?: string): Promise<string | null> {
  const trimmed = String(collectionId ?? "").trim();
  const cached = readMemoryCache(selectedCollectionCache, type);
  if (trimmed) {
    if (cached && !cached.some((option) => option.value === trimmed)) {
      return cached[0]?.value ?? null;
    }
    return trimmed;
  }
  const options = cached ?? (await fetchSelectedCollectionOptions(type));
  return options[0]?.value ?? null;
}
