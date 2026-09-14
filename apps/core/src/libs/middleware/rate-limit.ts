import type { Env } from "hono";
import { createMiddleware } from "hono/factory";
import { isUserId } from "../config";

export const rateLimit = createMiddleware<Env>(async (c, next) => {
  let success = false;

  const pathname = new URL(c.req.url).pathname;
  const [, firstSegment, secondSegment] = pathname.split("/");
  // 支持 /:userId/... 和 /image-proxy/:userId 两种路径格式
  const configId = firstSegment === "image-proxy" ? secondSegment : firstSegment;
  if (isUserId(configId) && c.req.header("User-Agent")) {
    ({ success } = await c.env.USER_RATE_LIMIT.limit({ key: configId }));
  } else {
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    ({ success } = await c.env.PUBLIC_RATE_LIMIT.limit({ key }));
  }

  if (!success) {
    return c.text("Rate limit exceeded", 429);
  }
  await next();
});
