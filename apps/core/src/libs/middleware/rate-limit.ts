import type { Env } from "hono";
import { createMiddleware } from "hono/factory";
import { isUserId } from "../config";

// 与 wrangler.jsonc 里 IMAGE_RATE_LIMIT / PUBLIC_RATE_LIMIT 的 period 保持一致
const RETRY_AFTER_SECONDS = "60";

/** 图片代理专用限流：命中用户走独立的 IMAGE_RATE_LIMIT，不再和 /v1 抢 USER_RATE_LIMIT 的额度 */
export const imageRateLimit = createMiddleware<Env>(async (c, next) => {
  const userId = new URL(c.req.url).pathname.split("/")[2];
  const { success } =
    isUserId(userId) && c.req.header("User-Agent")
      ? await c.env.IMAGE_RATE_LIMIT.limit({ key: userId })
      : await c.env.PUBLIC_RATE_LIMIT.limit({ key: c.req.header("cf-connecting-ip") ?? "unknown" });

  if (!success) {
    return c.text("Rate limit exceeded", 429, { "Retry-After": RETRY_AFTER_SECONDS });
  }
  await next();
});
