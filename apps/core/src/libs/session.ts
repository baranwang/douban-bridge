import { eq } from "drizzle-orm";
import type { Context, Env, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { getDrizzle, type User, users } from "@/db";

const JWT_COOKIE_NAME = "token";
const JWT_TTL = 60 * 60 * 24 * 30; // 30 天

interface JwtPayload {
  sub: string; // userId
  exp: number;
}

/**
 * 创建 JWT 并设置 cookie
 */
export async function createSession(c: Context<Env>, userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + JWT_TTL;

  const token = await sign(
    {
      sub: userId,
      exp,
    } satisfies JwtPayload,
    c.env.JWT_SECRET,
  );

  setCookie(c, JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: JWT_TTL,
    path: "/",
  });

  return token;
}

/**
 * 验证 JWT 并获取 payload
 */
export async function getSession(c: Context<Env>): Promise<JwtPayload | null> {
  const token = getCookie(c, JWT_COOKIE_NAME);
  if (!token) {
    return null;
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    if (typeof payload.sub !== "string") {
      return null;
    }
    return { sub: payload.sub, exp: payload.exp as number };
  } catch {
    // token 无效或过期
    return null;
  }
}

/**
 * 删除 session（登出）- 仅清除 cookie
 */
export function deleteSession(c: Context<Env>): void {
  deleteCookie(c, JWT_COOKIE_NAME, {
    path: "/",
  });
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUser(c: Context<Env>): Promise<User | null> {
  const payload = await getSession(c);
  if (!payload) {
    return null;
  }

  const db = getDrizzle(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });

  return user ?? null;
}

// 扩展 Hono 的 Context 类型
declare module "hono" {
  interface ContextVariableMap {
    user: User | null;
  }
}

/**
 * 认证中间件 - 加载用户信息到 context
 */
export const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const user = await getCurrentUser(c);
  c.set("user", user);
  await next();
};
