import type { CollectionConfig } from "./collections";
import type { BridgeDetail, BridgeItem } from "./index";

export type MediaLink = { name: string; category: string; url: string };
export type StremioManifestData = { redirectConfig: string } | { catalogs: CollectionConfig[] };
export type StremioCatalogItem = BridgeItem & { genres: string[]; links: MediaLink[] };
export type StremioDetailItem = BridgeDetail & {
  links: MediaLink[];
  language?: string;
  country?: string;
  awards?: string;
};
