import { eq } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { apiKeys, getDrizzle } from "@/db";
import { replaceApiKey, revokeApiKey } from "@/libs/api-key";
import { requireWebSession } from "@/libs/require-web-session";

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
  console.error("api-keys route failed", err);
  return c.body(null, 500);
});

apiKeysRoute.get("/", async (c) => {
  const user = requireWebSession(c);
  const row = await getDrizzle(c.env).query.apiKeys.findFirst({ where: eq(apiKeys.userId, user.id) });
  return c.json({ hasKey: !!row, createdAt: row?.createdAt.toISOString() ?? null });
});

apiKeysRoute.post("/", async (c) => {
  const user = requireWebSession(c, { requireStar: true });
  const contentType = c.req.header("Content-Type")?.toLowerCase().split(";")[0]?.trim();
  if (contentType !== "application/json") throw new HTTPException(400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400);
  }
  if (!isEmptyJsonObject(body)) throw new HTTPException(400);
  const sk = await replaceApiKey(c.env, user.id);
  return c.json({ sk });
});

apiKeysRoute.delete("/", async (c) => {
  const user = requireWebSession(c);
  await revokeApiKey(c.env, user.id);
  return c.body(null, 204);
});
