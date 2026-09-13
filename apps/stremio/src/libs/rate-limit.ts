import { createMiddleware } from "hono/factory";
import { match } from "path-to-regexp";
import { z } from "zod/v4";
import type { StremioEnv } from "../env";
import { matchResourceRoute } from "./router";

const isUserId = (id?: string) => z.uuid().safeParse(id).success;

function isStremioProtocol(pathname: string): boolean {
  if (pathname === "/manifest.json" || match("/:config/manifest.json")(pathname)) return true;
  return matchResourceRoute(pathname)[0];
}

export const rateLimit = createMiddleware<StremioEnv>(async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (!isStremioProtocol(pathname)) {
    await next();
    return;
  }

  let success = false;
  const [, firstSegment] = pathname.split("/");
  if (isUserId(firstSegment) && c.req.header("User-Agent")) {
    ({ success } = await c.env.USER_RATE_LIMIT.limit({ key: firstSegment }));
  } else {
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    ({ success } = await c.env.PUBLIC_RATE_LIMIT.limit({ key }));
  }

  if (!success) {
    return c.text("Rate limit exceeded", 429);
  }
  await next();
});
