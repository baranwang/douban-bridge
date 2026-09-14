import type { Context, Env } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "@/db";

export function requireWebSession(c: Context<Env>, options: { requireStar?: boolean } = {}): User {
  const user = c.get("user");
  if (!user) throw new HTTPException(401);
  if (c.req.method !== "GET" && c.req.header("Origin") !== new URL(c.req.url).origin) {
    throw new HTTPException(403);
  }
  if (options.requireStar && user.hasStarred !== true) throw new HTTPException(403);
  return user;
}
