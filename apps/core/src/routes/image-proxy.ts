import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { z } from "zod/v4";
import { getDrizzle, users } from "@/db";
import { DoubanAPI } from "@/libs/api";

export const imageProxyRoute = new Hono<Env>();

export const imageETag = (url: string) => `"${createHash("sha256").update(url).digest("base64url")}"`;

const imageProxySchema = z.object({
  url: z.url(),
});

imageProxyRoute.get("/:userId", zValidator("query", imageProxySchema), async (c) => {
  const { url } = c.req.valid("query");
  const { userId } = c.req.param();
  if (!userId) {
    return c.text("Unauthorized", 401);
  }
  const db = getDrizzle(c.env);
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.hasStarred, true)),
  });
  if (!user) {
    return c.text("Unauthorized", 401);
  }

  const etag = imageETag(url);
  if (c.req.header("If-None-Match") === etag) {
    return c.body(null, 304, { ETag: etag, "Cache-Control": "private, no-cache" });
  }

  const image = new URL(url);
  if (
    image.protocol !== "https:" ||
    image.username ||
    image.password ||
    (image.port && image.port !== "443") ||
    !image.hostname.endsWith(".doubanio.com")
  ) {
    return c.text("Unsupported image source", 400);
  }

  const response = await fetch(image, {
    headers: DoubanAPI.BASE_HEADERS,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    return c.text("Image source redirected", 502);
  }

  const headers = new Headers();
  const contentType = response.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  if (response.status === 200) {
    headers.set("ETag", etag);
    headers.set("Cache-Control", "private, no-cache");
    headers.set("Access-Control-Allow-Origin", "*");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
