import { type BridgeItem, type CatalogQuery, catalogResponseSchema } from "@douban-bridge/contracts";
import { getBasicCatalog } from "./basic";

const API_ORIGIN = "https://douban-bridge.baran.wang";

export async function loadCatalog(query: CatalogQuery, sk: string): Promise<BridgeItem[]> {
  if (sk) {
    try {
      const url = new URL(`/v1/catalog/${encodeURIComponent(query.collectionId)}`, API_ORIGIN);
      url.searchParams.set("skip", String(query.skip));
      const response = await Widget.http.get(url.toString(), { headers: { Authorization: `Bearer ${sk}` } });
      if (response.statusCode !== 200) throw new Error("Cloud unavailable");
      return catalogResponseSchema.parse(response.data).items;
    } catch {
      /* 使用本次调用的基础模式 */
    }
  }
  return getBasicCatalog(query);
}
