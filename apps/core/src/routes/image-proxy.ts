import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { z } from "zod/v4";
import { getDrizzle, users } from "@/db";
import { fetchDoubanImage } from "@/libs/douban-image";

export const imageProxyRoute = new Hono<Env>();

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

  if (c.req.header("If-None-Match") === url) {
    return c.body(null, 304);
  }

  return fetchDoubanImage(url);
});
