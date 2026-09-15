import { type BridgeItem, type CatalogQuery, catalogResponseSchema } from "@douban-bridge/contracts";
import { getBasicCatalog } from "./basic";
import { rexFetch } from "./http";

const API_ORIGIN = "https://douban-bridge.baran.wang";

export async function loadCatalog(query: CatalogQuery, sk: string): Promise<BridgeItem[]> {
  if (sk) {
    try {
      const response = await rexFetch.get(`${API_ORIGIN}/v1/catalog/${encodeURIComponent(query.collectionId)}`, {
        params: { skip: query.skip },
        headers: { Authorization: `Bearer ${sk}` },
        successStatus: [200],
        schema: catalogResponseSchema,
      });
      if (!response.data) throw new Error("Cloud unavailable");
      return response.data.items;
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return getBasicCatalog(query);
}
