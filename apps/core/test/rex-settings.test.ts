import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { getDrizzle, userConfigs, users } from "../src/db";
import { withTestContext } from "./context";

const CORE = "https://douban-bridge.baran.wang";
const STREMIO = "https://stremio-addon-douban.baran.wang";
const GITHUB_TOKEN = "ghp_REX_SETTINGS_TEST";
const PROVIDER_TOKEN = "REX_PROVIDER_TOKEN_DO_NOT_LEAK";

function withOrigins(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    DASH_ORIGIN: CORE,
    STREMIO_ORIGIN: STREMIO,
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
  const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
  return `token=${token}`;
}

test("Rex page exposes settings only to a starred session", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const anonymous = await app.fetch(new Request(`${CORE}/rex`), bindings, ctx);
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.headers.get("Cache-Control"), "private, no-store");
    const anonymousBody = await anonymous.text();
    assert.equal(anonymousBody.includes('data-section="rex-key-settings"'), false);
    assert.equal(anonymousBody.includes('data-section="image-provider-settings"'), false);
    assert.ok(anonymousBody.includes("GitHub 登录"));

    const unstarredId = await insertUser(env, { hasStarred: false });
    await getDrizzle(env)
      .insert(userConfigs)
      .values({
        userId: unstarredId,
        catalogIds: ["movie_top250"],
        dynamicCollections: true,
        imageProviders: [{ provider: "tmdb", extra: { apiKey: PROVIDER_TOKEN } }],
      });
    const unstarred = await app.fetch(
      new Request(`${CORE}/rex`, { headers: { Cookie: await sessionCookie(env, unstarredId) } }),
      bindings,
      ctx,
    );
    assert.equal(unstarred.status, 200);
    assert.equal(unstarred.headers.get("Cache-Control"), "private, no-store");
    const unstarredBody = await unstarred.text();
    assert.equal(unstarredBody.includes('data-section="rex-key-settings"'), false);
    assert.equal(unstarredBody.includes('data-section="image-provider-settings"'), false);
    assert.equal(unstarredBody.includes(PROVIDER_TOKEN), false);
    assert.equal(unstarredBody.includes(GITHUB_TOKEN), false);
    assert.equal(unstarredBody.includes("githubAccessToken"), false);
    assert.equal(unstarredBody.includes("sk_"), false);
    assert.ok(unstarredBody.includes("去 Star 解锁"));

    const userId = await insertUser(env, { hasStarred: true });
    const cookie = await sessionCookie(env, userId);
    const owner = await app.fetch(new Request(`${CORE}/rex`, { headers: { Cookie: cookie } }), bindings, ctx);
    const body = await owner.text();
    assert.equal(owner.status, 200);
    assert.ok(body.includes('data-section="rex-key-settings"'));
    assert.ok(body.includes('data-section="image-provider-settings"'));
    assert.equal(body.includes(GITHUB_TOKEN), false);
    assert.equal(body.includes("githubAccessToken"), false);
    assert.equal(body.includes("sk_"), false);
    assert.equal(owner.headers.get("Cache-Control"), "private, no-store");
  });
});

test("Rex image save preserves Stremio catalog settings", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const userId = await insertUser(env, { hasStarred: true });
    await getDrizzle(env)
      .insert(userConfigs)
      .values({
        userId,
        catalogIds: ["movie_top250"],
        dynamicCollections: true,
        imageProviders: [{ provider: "douban", extra: {} }],
      });
    const response = await app.fetch(
      new Request(`${CORE}/rex/image-providers`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(env, userId),
          Origin: CORE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageProviders: [{ provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } }],
        }),
      }),
      bindings,
      ctx,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      success: true,
      imageProviders: [{ provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } }],
    });
    const stored = await getDrizzle(env).query.userConfigs.findFirst({
      where: (rows, { eq }) => eq(rows.userId, userId),
    });
    assert.deepEqual(stored?.catalogIds, ["movie_top250"]);
    assert.equal(stored?.dynamicCollections, true);
    assert.deepEqual(stored?.imageProviders, [{ provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } }]);
  });
});

test("Rex image save rejects invalid sessions, origins, entitlement, and providers", async () => {
  await withTestContext(async (env, ctx) => {
    const bindings = withOrigins(env);
    const starredId = await insertUser(env);
    const unstarredId = await insertUser(env, { hasStarred: false });
    const validBody = { imageProviders: [{ provider: "douban", extra: {} }] };
    const cases = [
      { name: "no session", cookie: undefined, origin: CORE, body: validBody, status: 401 },
      {
        name: "cross origin",
        cookie: await sessionCookie(env, starredId),
        origin: STREMIO,
        body: validBody,
        status: 403,
      },
      {
        name: "no Star",
        cookie: await sessionCookie(env, unstarredId),
        origin: CORE,
        body: validBody,
        status: 403,
      },
      {
        name: "unknown provider",
        cookie: await sessionCookie(env, starredId),
        origin: CORE,
        body: { imageProviders: [{ provider: "unknown", extra: {} }] },
        status: 400,
      },
      {
        name: "empty provider list",
        cookie: await sessionCookie(env, starredId),
        origin: CORE,
        body: { imageProviders: [] },
        status: 400,
      },
    ];

    for (const item of cases) {
      const headers = new Headers({ Origin: item.origin, "Content-Type": "application/json" });
      if (item.cookie) headers.set("Cookie", item.cookie);
      const response = await app.fetch(
        new Request(`${CORE}/rex/image-providers`, {
          method: "POST",
          headers,
          body: JSON.stringify(item.body),
        }),
        bindings,
        ctx,
      );
      assert.equal(response.status, item.status, item.name);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store", item.name);
    }
  });
});
