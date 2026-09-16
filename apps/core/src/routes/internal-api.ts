import {
  catalogQuerySchema,
  catalogResponseSchema,
  doubanIdSchema,
  itemsRequestSchema,
  metaResponseSchema,
} from "@douban-bridge/contracts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod/v4";
import { authenticateApiKey } from "@/libs/api-key";
import { contextStorage } from "@/libs/middleware";
import { getCatalogPage, getItemsByIds } from "@/services/catalog";
import { getCloudMeta } from "@/services/metadata";

type ApiAccount = Awaited<ReturnType<typeof authenticateApiKey>>;

export const internalApi = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { apiAccount: ApiAccount };
}>();

internalApi.use(contextStorage);

internalApi.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});

internalApi.use("/v1/*", async (c, next) => {
  const account = await authenticateApiKey(c.env, c.req.header("Authorization"));
  c.set("apiAccount", account);
  const { success } = await c.env.USER_RATE_LIMIT.limit({ key: account.userId });
  if (!success) {
    return c.text("Rate limit exceeded", 429);
  }
  await next();
});

internalApi.onError((err, c) => {
  c.header("Cache-Control", "private, no-store");
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  console.error("internal_error");
  return c.json({ error: "internal_error" }, 500);
});

internalApi.get("/v1/catalog/:collectionId", async (c) => {
  const raw = c.req.queries();
  if (
    Object.keys(raw).some((key) => !["skip", "genre"].includes(key)) ||
    Object.values(raw).some((values) => values.length !== 1) ||
    raw.skip?.[0] === ""
  ) {
    throw new HTTPException(400);
  }
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
  const account = c.get("apiAccount");
  const items = await getCatalogPage(query, {
    providers: account.config.imageProviders,
    configId: account.userId,
    origin: new URL(c.req.url).origin,
  });
  return c.json(catalogResponseSchema.parse({ items }));
});

internalApi.get("/v1/meta/:doubanId", async (c) => {
  const raw = c.req.queries();
  if (Object.keys(raw).length > 0) {
    throw new HTTPException(400);
  }
  let doubanId: ReturnType<typeof doubanIdSchema.parse>;
  try {
    doubanId = doubanIdSchema.parse(c.req.param("doubanId"));
  } catch (error) {
    if (error instanceof ZodError) throw new HTTPException(400);
    throw error;
  }
  const account = c.get("apiAccount");
  const item = await getCloudMeta(doubanId, {
    providers: account.config.imageProviders,
    configId: account.userId,
    origin: new URL(c.req.url).origin,
  });
  return c.json(metaResponseSchema.parse({ item }));
});

internalApi.post("/v1/items", async (c) => {
  let body: ReturnType<typeof itemsRequestSchema.parse>;
  try {
    body = itemsRequestSchema.parse(await c.req.json());
  } catch (error) {
    if (error instanceof ZodError) throw new HTTPException(400);
    throw error;
  }
  const account = c.get("apiAccount");
  const items = await getItemsByIds(body.ids, {
    providers: account.config.imageProviders,
    configId: account.userId,
    origin: new URL(c.req.url).origin,
  });
  return c.json(catalogResponseSchema.parse({ items }));
});
