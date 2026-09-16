import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { describe, mock } from "node:test";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { getDrizzle, users } from "../src/db";
import { DoubanAPI } from "../src/libs/api";
import { withTestContext } from "./context";

const PUBLIC = "https://douban-bridge.baran.wang";
const POSTER = "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg";

function withRateLimits(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
    IMAGE_RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
}

async function insertUser(
  env: CloudflareBindings,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<string> {
  const userId = overrides.id ?? randomUUID();
  await getDrizzle(env)
    .insert(users)
    .values({
      id: userId,
      githubId: Math.floor(Math.random() * 1e9),
      githubLogin: `user-${userId.slice(0, 8)}`,
      githubAvatarUrl: "https://example.com/a.png",
      githubAccessToken: "ghp_TEST_TOKEN_DO_NOT_LEAK_abc123",
      hasStarred: true,
      starCheckedAt: new Date(),
      ...overrides,
    });
  return userId;
}

function imageUrl(origin: string, userId: string, url: string) {
  return `${origin}/image-proxy/${userId}?url=${encodeURIComponent(url)}`;
}

describe("image proxy", { concurrency: false }, () => {
  test("anonymous starred image works on web and internal mounts; unstarred does not", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        const starred = await insertUser(env);
        const blocked = await insertUser(env, { hasStarred: false });
        const limited = withRateLimits(env);
        const fetched: Request[] = [];
        mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
          fetched.push(new Request(input, init));
          return new Response("img", {
            status: 200,
            headers: { "Content-Type": "image/jpeg", "Set-Cookie": "secret=1", "X-Powered-By": "origin" },
          });
        });
        const ok = await app.fetch(
          new Request(imageUrl(PUBLIC, starred, POSTER), {
            headers: { Cookie: "token=nope", Authorization: "Bearer sk_nope", Host: "evil.example" },
          }),
          limited,
          ctx,
        );
        assert.equal(ok.status, 200);
        assert.equal(ok.headers.get("Content-Type"), "image/jpeg");
        assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "*");
        assert.equal(ok.headers.get("Set-Cookie"), null);
        assert.equal(ok.headers.get("X-Powered-By"), null);
        assert.equal(await ok.text(), "img");
        const denied = await app.fetch(new Request(imageUrl(PUBLIC, blocked, POSTER)), limited, ctx);
        assert.equal(denied.status, 401);
        assert.notEqual(denied.status, 200);
        assert.ok(fetched.length >= 1);
        for (const request of fetched) {
          assert.equal(request.url, POSTER);
          assert.equal(request.headers.get("Cookie"), null);
          assert.equal(request.headers.get("Authorization"), null);
          assert.notEqual(request.headers.get("Host"), "evil.example");
          assert.equal(request.headers.get("User-Agent"), DoubanAPI.BASE_HEADERS["User-Agent"]);
          assert.equal(request.headers.get("Referer"), DoubanAPI.BASE_HEADERS.Referer);
          assert.equal(request.redirect, "manual");
        }
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("authorizes before If-None-Match so unstarring never 304s", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        const userId = await insertUser(env);
        const limited = withRateLimits(env);
        mock.method(
          globalThis,
          "fetch",
          async () => new Response("img", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        );
        const first = await app.fetch(new Request(imageUrl(PUBLIC, userId, POSTER)), limited, ctx);
        assert.equal(first.status, 200);
        await getDrizzle(env).update(users).set({ hasStarred: false }).where(eq(users.id, userId));
        const conditional = await app.fetch(
          new Request(imageUrl(PUBLIC, userId, POSTER), { headers: { "If-None-Match": POSTER } }),
          limited,
          ctx,
        );
        assert.equal(conditional.status, 401);
        assert.notEqual(conditional.status, 304);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("rejects non-https, credentials, non-443, suffix forgery, intranet, and redirects", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        const userId = await insertUser(env);
        const limited = withRateLimits(env);
        let fetchCalls = 0;
        mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
          fetchCalls += 1;
          const request = new Request(input, init);
          if (request.url === POSTER) {
            return new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/secret" } });
          }
          return new Response("should-not-fetch", { status: 200 });
        });
        const rejected = [
          POSTER.replace("https://", "http://"),
          "https://user:pass@img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg",
          "https://img9.doubanio.com:8443/view/photo/s_ratio_poster/public/p480747492.jpg",
          "https://img9.doubanio.com.evil.example/view/photo/s_ratio_poster/public/p480747492.jpg",
          "https://notdoubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg",
          "https://127.0.0.1/p480747492.jpg",
          "https://10.0.0.1/p480747492.jpg",
        ];
        for (const url of rejected) {
          const before = fetchCalls;
          const response = await app.fetch(new Request(imageUrl(PUBLIC, userId, url)), limited, ctx);
          assert.equal(response.status, 400, url);
          assert.equal(await response.text(), "Unsupported image source");
          assert.equal(fetchCalls, before, url);
        }
        const redirected = await app.fetch(new Request(imageUrl(PUBLIC, userId, POSTER)), limited, ctx);
        assert.equal(redirected.status, 502);
        assert.equal(await redirected.text(), "Image source redirected");
        assert.equal(fetchCalls, 1);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("rate-limits image proxy when the limiter is exhausted", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const limited = {
        ...withRateLimits(env),
        PUBLIC_RATE_LIMIT: { limit: async () => ({ success: false }) },
      };
      const response = await app.fetch(new Request(imageUrl(PUBLIC, userId, POSTER)), limited, ctx);
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("Retry-After"), "60");
    });
  });

  test("uses the image bucket for identified users, never the /v1 user bucket", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const keys: string[] = [];
      const limited = {
        ...withRateLimits(env),
        USER_RATE_LIMIT: {
          limit: async () => {
            throw new Error("image proxy must not consume USER_RATE_LIMIT");
          },
        },
        IMAGE_RATE_LIMIT: {
          limit: async ({ key }: { key: string }) => {
            keys.push(key);
            return { success: false };
          },
        },
      };
      const response = await app.fetch(
        new Request(imageUrl(PUBLIC, userId, POSTER), { headers: { "User-Agent": "Stremio/5" } }),
        limited,
        ctx,
      );
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.deepEqual(keys, [userId]);
    });
  });

  test("upstream image errors keep their status", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        const userId = await insertUser(env);
        mock.method(
          globalThis,
          "fetch",
          async () => new Response("missing", { status: 404, headers: { "Content-Type": "text/plain" } }),
        );
        const response = await app.fetch(new Request(imageUrl(PUBLIC, userId, POSTER)), withRateLimits(env), ctx);
        assert.equal(response.status, 404);
        assert.notEqual(response.status, 200);
      } finally {
        mock.restoreAll();
      }
    });
  });
});
