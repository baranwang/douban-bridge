import {
  type BridgeDetail,
  type BridgeItem,
  type CatalogQuery,
  catalogResponseSchema,
  metaResponseSchema,
} from "@douban-bridge/contracts";
import { getBasicCatalog, getBasicMeta } from "./basic";
import "./host";

const API_ORIGIN = "https://douban-bridge-api.baran.wang";

export async function loadCatalog(query: CatalogQuery, sk: string): Promise<BridgeItem[]> {
  if (sk) {
    try {
      const url = new URL(`/v1/catalog/${encodeURIComponent(query.collectionId)}`, API_ORIGIN);
      url.searchParams.set("skip", String(query.skip));
      if (query.genre) url.searchParams.set("genre", query.genre);
      const response = await Widget.http.get(url.toString(), { headers: { Authorization: `Bearer ${sk}` } });
      if (response.statusCode !== 200) throw new Error("Cloud unavailable");
      return catalogResponseSchema.parse(response.data).items;
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return getBasicCatalog(query);
}

export async function loadMeta(id: number, sk: string): Promise<BridgeDetail> {
  if (sk) {
    try {
      const response = await Widget.http.get(`${API_ORIGIN}/v1/meta/${id}`, {
        headers: { Authorization: `Bearer ${sk}` },
      });
      if (response.statusCode !== 200) throw new Error("Cloud unavailable");
      return metaResponseSchema.parse(response.data).item;
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return getBasicMeta(id);
}
