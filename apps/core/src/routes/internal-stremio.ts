import { catalogQuerySchema, doubanIdSchema } from "@douban-bridge/contracts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod/v4";
import { getCatalogs } from "@/libs/catalog";
import { encodeConfig, getConfig } from "@/libs/config";
import { contextStorage } from "@/libs/middleware";
import { isAllowedStremioOrigin } from "@/libs/public-origins";
import { getCatalogPage } from "@/services/catalog";
import { getStremioMeta } from "@/services/metadata";

export const internalStremio = new Hono<{ Bindings: CloudflareBindings }>();

internalStremio.use(contextStorage);

internalStremio.get("/stremio/manifest", async (c) => {
  const configId = c.req.query("config");
  if (!configId) return c.json({ redirectConfig: encodeConfig() });
  const config = await getConfig(c.env, configId);
  return c.json({ catalogs: await getCatalogs(config) });
});

internalStremio.get("/stremio/catalog/:collectionId", async (c) => {
  const origin = c.req.query("origin");
  if (!isAllowedStremioOrigin(c.env, origin)) throw new HTTPException(400);
  const configId = c.req.query("config");
  let query: ReturnType<typeof catalogQuerySchema.parse>;
  try {
    query = catalogQuerySchema.parse({
      collectionId: c.req.param("collectionId"),
      skip: c.req.query("skip"),
      genre: c.req.query("genre"),
    });
  } catch (error) {
    if (error instanceof ZodError) throw new HTTPException(400);
    throw error;
  }
  const config = await getConfig(c.env, configId);
  const items = await getCatalogPage(query, {
    providers: config.imageProviders,
    configId,
    origin,
  });
  return c.json({ items });
});

internalStremio.get("/stremio/meta/:doubanId", async (c) => {
  const origin = c.req.query("origin");
  if (!isAllowedStremioOrigin(c.env, origin)) throw new HTTPException(400);
  const configId = c.req.query("config");
  let doubanId: ReturnType<typeof doubanIdSchema.parse>;
  try {
    doubanId = doubanIdSchema.parse(c.req.param("doubanId"));
  } catch (error) {
    if (error instanceof ZodError) throw new HTTPException(400);
    throw error;
  }
  const config = await getConfig(c.env, configId);
  const item = await getStremioMeta(doubanId, {
    providers: config.imageProviders,
    configId,
    origin,
  });
  return c.json({ item });
});
