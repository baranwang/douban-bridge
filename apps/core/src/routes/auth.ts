import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Env, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getDrizzle, users } from "@/db";
import { GitHubAPI } from "@/libs/api/github";
import { getOAuthCredentials, getSignedInPath, getSignedOutPath } from "@/libs/public-origins";
import { createSession, deleteSession } from "@/libs/session";

export const authRoute = new Hono<Env>()
  /**
   * GET /auth/github - 跳转到 GitHub 授权页面
   */
  .get("/github", async (c) => {
    const origin = new URL(c.req.url).origin;
    const { clientId, clientSecret } = getOAuthCredentials(c.env, origin);
    const state = randomBytes(16).toString("hex");

    setCookie(c, "oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 60 * 10, // 10 分钟
      path: "/",
    });

    const github = new GitHubAPI(clientId, clientSecret);
    const authUrl = github.getAuthUrl(state, `${origin}/auth/github/callback`);
    return c.redirect(authUrl);
  })

  /**
   * GET /auth/github/callback - 处理 OAuth 回调
   */
  .get("/github/callback", async (c) => {
    const origin = new URL(c.req.url).origin;
    const { clientId, clientSecret } = getOAuthCredentials(c.env, origin);
    const code = c.req.query("code");
    const state = c.req.query("state");
    const savedState = getCookie(c, "oauth_state");

    // 验证 state
    if (!state || state !== savedState) {
      return c.text("Invalid state", 400);
    }

    if (!code) {
      return c.text("Missing code", 400);
    }

    try {
      const github = new GitHubAPI(clientId, clientSecret);

      // 交换 access token
      const accessToken = await github.exchangeCodeForToken(code, `${origin}/auth/github/callback`);

      // 获取用户信息
      const githubUser = await github.getUser(accessToken);

      // 检查 star 状态：登录不该因为 GitHub 抖动而失败
      const hasStarred = await github.checkStarStatus(accessToken).catch(() => false);

      const db = getDrizzle(c.env);

      // 查找或创建用户
      let user = await db.query.users.findFirst({ where: eq(users.githubId, githubUser.id) });

      if (user) {
        // 更新现有用户
        await db
          .update(users)
          .set({
            githubLogin: githubUser.login,
            githubAvatarUrl: githubUser.avatar_url,
            githubAccessToken: accessToken,
            hasStarred,
            starCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      } else {
        // 创建新用户
        const userId = randomUUID();
        await db.insert(users).values({
          id: userId,
          githubId: githubUser.id,
          githubLogin: githubUser.login,
          githubAvatarUrl: githubUser.avatar_url,
          githubAccessToken: accessToken,
          hasStarred,
          starCheckedAt: new Date(),
        });
        user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      }

      if (!user) {
        return c.text("Failed to create user", 500);
      }

      // 创建 session
      await createSession(c, user.id);

      return c.redirect(getSignedInPath(c.env, origin, user.id));
    } catch (error) {
      console.error("OAuth callback error:", error);
      return c.text("Authentication failed", 500);
    }
  })

  /**
   * POST /auth/logout - 登出
   */
  .post("/logout", (c) => {
    const origin = new URL(c.req.url).origin;
    deleteSession(c);
    return c.redirect(getSignedOutPath(c.env, origin));
  })

  /**
   * GET /auth/me - 获取当前用户信息
   */
  .get("/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ user: null }, 200);
    }

    return c.json({
      user: {
        id: user.id,
        githubLogin: user.githubLogin,
        githubAvatarUrl: user.githubAvatarUrl,
        hasStarred: user.hasStarred,
      },
    });
  })

  /**
   * GET /auth/check-star - 实时检查 star 状态（AJAX 用）
   */
  .get("/check-star", async (c) => {
    const user = c.get("user");
    if (!user || !user.githubAccessToken) {
      return c.json({ hasStarred: false, userId: null });
    }

    try {
      const github = new GitHubAPI(c.env.GITHUB_CLIENT_ID, c.env.GITHUB_CLIENT_SECRET);
      const hasStarred = await github.checkStarStatus(user.githubAccessToken);

      // 如果状态有变化，更新数据库
      if (hasStarred !== user.hasStarred) {
        const db = drizzle(c.env.STREMIO_ADDON_DOUBAN);
        await db
          .update(users)
          .set({
            hasStarred,
            starCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      }

      return c.json({ hasStarred, userId: user.id });
    } catch (error) {
      console.error("Check star error:", error);
      return c.json({ hasStarred: false, userId: user.id });
    }
  });

export type AuthRoute = typeof authRoute;
