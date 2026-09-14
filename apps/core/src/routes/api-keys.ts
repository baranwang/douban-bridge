import { eq } from "drizzle-orm";
import { type Context, type Env, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { apiKeys, getDrizzle } from "@/db";
import { replaceApiKey, revokeApiKey } from "@/libs/api-key";

const requireSessionOrigin = (c: Context<Env>) => {
  if (!c.get("user")) throw new HTTPException(401);
  if (c.req.method !== "GET" && c.req.header("Origin") !== new URL(c.req.url).origin) throw new HTTPException(403);
};

const isEmptyJsonObject = (value: unknown): value is Record<string, never> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;

export const apiKeysRoute = new Hono<Env>();

apiKeysRoute.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});

apiKeysRoute.onError((err, c) => {
  c.header("Cache-Control", "private, no-store");
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  return c.body(null, 500);
});

apiKeysRoute.get("/", async (c) => {
  requireSessionOrigin(c);
  const user = c.get("user");
  if (!user) throw new HTTPException(401);
  const row = await getDrizzle(c.env).query.apiKeys.findFirst({ where: eq(apiKeys.userId, user.id) });
  return c.json({ hasKey: !!row });
});

apiKeysRoute.post("/", async (c) => {
  requireSessionOrigin(c);
  const user = c.get("user");
  if (!user) throw new HTTPException(401);
  const contentType = c.req.header("Content-Type")?.toLowerCase().split(";")[0]?.trim();
  if (contentType !== "application/json") throw new HTTPException(400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400);
  }
  if (!isEmptyJsonObject(body)) throw new HTTPException(400);
  if (user.hasStarred !== true) throw new HTTPException(403);
  const sk = await replaceApiKey(c.env, user.id);
  return c.json({ sk });
});

apiKeysRoute.delete("/", async (c) => {
  requireSessionOrigin(c);
  const user = c.get("user");
  if (!user) throw new HTTPException(401);
  await revokeApiKey(c.env, user.id);
  return c.body(null, 204);
});
