import { ADDON } from "@douban-bridge/contracts/addon";
import type { Manifest } from "@stremio-addon/sdk";
import { type Env, Hono } from "hono";
import { getCatalogs } from "@/libs/catalog";
import { encodeConfig, getConfig } from "@/libs/config";
import { idPrefixes } from "./meta";

export const manifestRoute = new Hono<Env>();

manifestRoute.get("/", async (c) => {
  const configId = c.req.param("config");
  if (!configId) {
    const encodedConfig = encodeConfig();
    return c.redirect(`/${encodedConfig}/manifest.json`);
  }

  const config = await getConfig(c.env, configId);
  const catalogs = await getCatalogs(config);

  const resources: Manifest["resources"] = ["catalog", "meta"];
  return c.json({
    id: `${ADDON.id}.${configId}`,
    version: ADDON.version,
    name: ADDON.name,
    description: ADDON.description,
    logo: "https://stremio-addon-douban.baran.wang/icon.png",
    types: ["movie", "series"],
    resources,
    catalogs,
    idPrefixes,
    behaviorHints: {
      configurable: true,
    },
  } satisfies Manifest);
});
