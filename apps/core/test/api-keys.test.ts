import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { describe } from "node:test";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { getDrizzle, userConfigs, users } from "../src/db";
import { authenticateApiKey, replaceApiKey, revokeApiKey } from "../src/libs/api-key";
import { configSchema } from "../src/libs/config";
import { withTestContext } from "./context";

const GITHUB_TOKEN = "ghp_TEST_TOKEN_DO_NOT_LEAK_abc123";
const OLD_ORIGIN = "https://stremio-addon-douban.baran.wang";
const DASH_ORIGIN = "https://douban-bridge-dash.baran.wang";

function withRateLimits(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
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
      githubAccessToken: GITHUB_TOKEN,
      hasStarred: true,
      ...overrides,
    });
  return userId;
}

async function sessionCookie(env: CloudflareBindings, userId: string): Promise<string> {
  const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET);
  return `token=${token}`;
}

async function fetchApiKeys(env: CloudflareBindings, ctx: ExecutionContext, request: Request): Promise<Response> {
  return app.fetch(request, withRateLimits(env), ctx);
}

describe("api key digest auth", { concurrency: false }, () => {
  test("replace rotates keys, stores only hashes, and revoke invalidates", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env);
      const first = await replaceApiKey(env, userId);
      assert.match(first, /^sk_[0-9a-f]{64}$/);
      assert.equal((await authenticateApiKey(env, `Bearer ${first}`)).userId, userId);
      const second = await replaceApiKey(env, userId);
      await assert.rejects(
        authenticateApiKey(env, `Bearer ${first}`),
        (error: unknown) => error instanceof HTTPException && error.status === 401,
      );
      assert.equal((await authenticateApiKey(env, `Bearer ${second}`)).userId, userId);
      const rows = await env.STREMIO_ADDON_DOUBAN.prepare("SELECT * FROM api_keys").all();
      const dumped = JSON.stringify(rows);
      assert.equal(dumped.includes("sk_"), false);
      assert.equal(dumped.includes(first), false);
      assert.equal(dumped.includes(second), false);
      await revokeApiKey(env, userId);
      await assert.rejects(authenticateApiKey(env, `Bearer ${second}`));
    });
  });

  test("missing config row uses defaults and stored config is parsed", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env);
      const sk = await replaceApiKey(env, userId);
      const withoutConfig = await authenticateApiKey(env, `Bearer ${sk}`);
      assert.deepEqual(withoutConfig.config, configSchema.parse({}));
      await getDrizzle(env)
        .insert(userConfigs)
        .values({
          userId,
          catalogIds: ["movie_top250"],
          dynamicCollections: true,
          imageProviders: [{ provider: "douban", extra: {} }],
        });
      const withConfig = await authenticateApiKey(env, `Bearer ${sk}`);
      assert.deepEqual(withConfig.config.catalogIds, ["movie_top250"]);
      assert.equal(withConfig.config.dynamicCollections, true);
    });
  });

  test("false star entitlement returns 403", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env, { hasStarred: false });
      const sk = await replaceApiKey(env, userId);
      await assert.rejects(
        authenticateApiKey(env, `Bearer ${sk}`),
        (error: unknown) => error instanceof HTTPException && error.status === 403,
      );
    });
  });

  test("duplicate Bearer or empty key returns 401", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env);
      const sk = await replaceApiKey(env, userId);
      for (const header of [undefined, "", "Bearer", "Bearer ", `Bearer ${sk} Bearer ${sk}`, `bearer ${sk}`]) {
        await assert.rejects(
          authenticateApiKey(env, header as string),
          (error: unknown) => error instanceof HTTPException && error.status === 401,
        );
      }
    });
  });

  test("database faults return 503", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env);
      const sk = await replaceApiKey(env, userId);
      await env.STREMIO_ADDON_DOUBAN.prepare(
        "INSERT INTO user_configs (user_id, catalog_ids, dynamic_collections, image_providers) VALUES (?, ?, ?, ?)",
      )
        .bind(userId, "not-json", 0, "[]")
        .run();
      await assert.rejects(
        authenticateApiKey(env, `Bearer ${sk}`),
        (error: unknown) => error instanceof HTTPException && error.status === 503,
      );
    });
  });

  test("query errors return 503", async () => {
    await withTestContext(async (env) => {
      const userId = await insertUser(env);
      const sk = await replaceApiKey(env, userId);
      const broken = {
        ...env,
        STREMIO_ADDON_DOUBAN: {
          prepare() {
            throw new Error("db down");
          },
          batch() {
            throw new Error("db down");
          },
          exec() {
            throw new Error("db down");
          },
        },
      } as unknown as CloudflareBindings;
      await assert.rejects(
        authenticateApiKey(broken, `Bearer ${sk}`),
        (error: unknown) => error instanceof HTTPException && error.status === 503,
      );
    });
  });
});

describe("api-keys session routes", { concurrency: false }, () => {
  test("Bearer cannot substitute for a web session", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const sk = await replaceApiKey(env, userId);
      const response = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sk}`,
            Origin: OLD_ORIGIN,
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    });
  });

  test("cross-origin session POST returns 403", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const cookie = await sessionCookie(env, userId);
      const response = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: DASH_ORIGIN,
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    });
  });

  test("old domain and dash domain each accept their own origin", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const cookie = await sessionCookie(env, userId);
      for (const origin of [OLD_ORIGIN, DASH_ORIGIN]) {
        const created = await fetchApiKeys(
          env,
          ctx,
          new Request(`${origin}/api-keys`, {
            method: "POST",
            headers: {
              Cookie: cookie,
              Origin: origin,
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
        );
        assert.equal(created.status, 200);
        assert.equal(created.headers.get("Cache-Control"), "private, no-store");
        const body = (await created.json()) as { sk: string };
        assert.match(body.sk, /^sk_[0-9a-f]{64}$/);
        const listed = await fetchApiKeys(env, ctx, new Request(`${origin}/api-keys`, { headers: { Cookie: cookie } }));
        assert.equal(listed.status, 200);
        assert.deepEqual(await listed.json(), { hasKey: true });
        assert.equal(listed.headers.get("Cache-Control"), "private, no-store");
      }
    });
  });

  test("POST requires JSON empty object and star; DELETE works after star loss", async () => {
    await withTestContext(async (env, ctx) => {
      const starredId = await insertUser(env);
      const cookie = await sessionCookie(env, starredId);
      const missingType = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: OLD_ORIGIN },
          body: "{}",
        }),
      );
      assert.equal(missingType.status, 400);
      const extraBody = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: OLD_ORIGIN, "Content-Type": "application/json" },
          body: JSON.stringify({ extra: true }),
        }),
      );
      assert.equal(extraBody.status, 400);

      const unstarredId = await insertUser(env, { hasStarred: false });
      const unstarredCookie = await sessionCookie(env, unstarredId);
      const denied = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "POST",
          headers: {
            Cookie: unstarredCookie,
            Origin: OLD_ORIGIN,
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
      assert.equal(denied.status, 403);

      await replaceApiKey(env, unstarredId);
      const revoked = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/api-keys`, {
          method: "DELETE",
          headers: { Cookie: unstarredCookie, Origin: OLD_ORIGIN },
        }),
      );
      assert.equal(revoked.status, 204);
      assert.equal(revoked.headers.get("Cache-Control"), "private, no-store");
    });
  });
});

describe("configure SSR public user", { concurrency: false }, () => {
  test("SSR body does not contain the test GitHub token", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const cookie = await sessionCookie(env, userId);
      const response = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/configure`, { headers: { Cookie: cookie } }),
      );
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.equal(body.includes(GITHUB_TOKEN), false);
      assert.equal(body.includes("githubAccessToken"), false);
    });
  });

  test("anonymous UUID configure SSR does not embed image-provider api keys", async () => {
    await withTestContext(async (env, ctx) => {
      const planted = "PLANTED_TMDB_API_KEY_DO_NOT_LEAK";
      const userId = await insertUser(env);
      await getDrizzle(env)
        .insert(userConfigs)
        .values({
          userId,
          catalogIds: ["movie_top250"],
          dynamicCollections: false,
          imageProviders: [{ provider: "tmdb", extra: { apiKey: planted } }],
        });

      const anonymous = await fetchApiKeys(env, ctx, new Request(`${OLD_ORIGIN}/${userId}/configure`));
      assert.equal(anonymous.status, 200);
      const anonymousBody = await anonymous.text();
      assert.equal(anonymousBody.includes(planted), false);

      const cookie = await sessionCookie(env, userId);
      const owner = await fetchApiKeys(
        env,
        ctx,
        new Request(`${OLD_ORIGIN}/configure`, { headers: { Cookie: cookie } }),
      );
      assert.equal(owner.status, 200);
      assert.equal((await owner.text()).includes(planted), true);
    });
  });
});
