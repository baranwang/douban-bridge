import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { proxy } from "hono/proxy";
import { z } from "zod/v4";
import { getDrizzle, users } from "@/db";
import { DoubanAPI } from "@/libs/api";

export const imageProxyRoute = new Hono<Env>();

const imageProxySchema = z.object({
  url: z.url(),
});

imageProxyRoute.get("/:userId", zValidator("query", imageProxySchema), async (c) => {
  const { url } = c.req.valid("query");
  if (c.req.header("If-None-Match") === url) {
    return c.body(null, 304);
  }

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

  const resp = await proxy(url, {
    ...c.req,
    headers: {
      ...c.req.header(),
      ...DoubanAPI.BASE_HEADERS,
    },
  });
  resp.headers.set("Access-Control-Allow-Origin", "*");
  if (resp.status === 200) {
    resp.headers.set("ETag", url);
  }
  return resp;
});
