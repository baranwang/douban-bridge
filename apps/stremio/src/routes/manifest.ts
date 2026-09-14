import { ADDON } from "@douban-bridge/contracts/addon";
import type { StremioManifestData } from "@douban-bridge/contracts/stremio";
import type { Manifest } from "@stremio-addon/sdk";
import { Hono } from "hono";
import type { StremioEnv } from "../env";
import { coreGet } from "../libs/core-client";
import { idPrefixes } from "./meta";

export const manifestRoute = new Hono<StremioEnv>();

manifestRoute.get("/", async (c) => {
  const configId = c.req.param("config");
  const data = await coreGet<StremioManifestData>(c.env, "/stremio/manifest", { config: configId });
  if (!configId) {
    if ("redirectConfig" in data) return c.redirect(`/${data.redirectConfig}/manifest.json`);
    return c.notFound();
  }
  if (!("catalogs" in data)) return c.notFound();

  const resources: Manifest["resources"] = ["catalog", "meta"];
  return c.json({
    id: `${ADDON.id}.${configId}`,
    version: ADDON.version,
    name: ADDON.name,
    description: ADDON.description,
    logo: "https://stremio-addon-douban.baran.wang/icon.png",
    types: ["movie", "series"],
    resources,
    catalogs: data.catalogs,
    idPrefixes,
    behaviorHints: {
      configurable: true,
    },
  } satisfies Manifest);
});
