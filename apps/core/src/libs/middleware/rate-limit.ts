import type { Env } from "hono";
import { createMiddleware } from "hono/factory";
import { isUserId } from "../config";

export const rateLimit = createMiddleware<Env>(async (c, next) => {
  const userId = new URL(c.req.url).pathname.split("/")[2];
  const { success } =
    isUserId(userId) && c.req.header("User-Agent")
      ? await c.env.USER_RATE_LIMIT.limit({ key: userId })
      : await c.env.PUBLIC_RATE_LIMIT.limit({ key: c.req.header("cf-connecting-ip") ?? "unknown" });

  if (!success) {
    return c.text("Rate limit exceeded", 429);
  }
  await next();
});
