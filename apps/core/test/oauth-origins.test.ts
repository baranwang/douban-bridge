import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { describe, mock } from "node:test";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { getDrizzle, users } from "../src/db";
import { api } from "../src/libs/api";
import { encodeConfig } from "../src/libs/config";
import { internalStremio } from "../src/routes/internal-stremio";
import { withTestContext } from "./context";

const STREMIO = "https://stremio-addon-douban.baran.wang";
const DASH = "https://douban-bridge-core.baran.wang";
const CLIENT_ID = "stremio-gh-id";

function withOrigins(env: CloudflareBindings, extra: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    ...env,
    STREMIO_ORIGIN: STREMIO,
    DASH_ORIGIN: DASH,
    GITHUB_CLIENT_ID: CLIENT_ID,
    GITHUB_CLIENT_SECRET: "stremio-gh-secret",
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
    ...extra,
  } as CloudflareBindings;
}

function cookieAttrs(header: string) {
  const parts = header.split(";").map((part) => part.trim());
  return {
    httpOnly: parts.some((part) => part.toLowerCase() === "httponly"),
    secure: parts.some((part) => part.toLowerCase() === "secure"),
    sameSite: parts.find((part) => part.toLowerCase().startsWith("samesite="))?.split("=")[1],
    domain: parts.find((part) => part.toLowerCase().startsWith("domain=")),
  };
}

async function insertUser(env: CloudflareBindings): Promise<string> {
  const userId = randomUUID();
  await getDrizzle(env)
    .insert(users)
    .values({
      id: userId,
      githubId: Math.floor(Math.random() * 1e9),
      githubLogin: `user-${userId.slice(0, 8)}`,
      githubAvatarUrl: "https://example.com/a.png",
      githubAccessToken: "ghp_TEST_TOKEN_DO_NOT_LEAK_abc123",
      hasStarred: true,
    });
  return userId;
}

describe("oauth origins", { concurrency: false }, () => {
  test("both public origins share one GitHub app and send matching redirect_uri", async () => {
    await withTestContext(async (env, ctx) => {
      const limited = withOrigins(env);
      const stremio = await app.fetch(new Request(`${STREMIO}/auth/github`), limited, ctx);
      assert.equal(stremio.status, 302);
      const stremioLocation = new URL(stremio.headers.get("location") ?? "");
      assert.equal(stremioLocation.origin, "https://github.com");
      assert.equal(stremioLocation.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(stremioLocation.searchParams.get("redirect_uri"), `${STREMIO}/auth/github/callback`);

      const dash = await app.fetch(
        new Request(`${DASH}/auth/github`, { headers: { "X-Forwarded-Host": "stremio-addon-douban.baran.wang" } }),
        limited,
        ctx,
      );
      assert.equal(dash.status, 302);
      const dashLocation = new URL(dash.headers.get("location") ?? "");
      assert.equal(dashLocation.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(dashLocation.searchParams.get("redirect_uri"), `${DASH}/auth/github/callback`);

      const forwarded = await app.fetch(
        new Request(`${STREMIO}/auth/github`, { headers: { "X-Forwarded-Host": "douban-bridge-core.baran.wang" } }),
        limited,
        ctx,
      );
      const forwardedLocation = new URL(forwarded.headers.get("location") ?? "");
      assert.equal(forwardedLocation.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(forwardedLocation.searchParams.get("redirect_uri"), `${STREMIO}/auth/github/callback`);

      const cookies = stremio.headers.getSetCookie();
      const state = cookies.find((value) => value.startsWith("oauth_state="));
      assert.ok(state);
      const attrs = cookieAttrs(state ?? "");
      assert.equal(attrs.httpOnly, true);
      assert.equal(attrs.secure, true);
      assert.equal(attrs.sameSite, "Lax");
      assert.equal(attrs.domain, undefined);
    });
  });

  test("unknown origin is 400 and a 302 is not a login", async () => {
    await withTestContext(async (env, ctx) => {
      const limited = withOrigins(env);
      const unknown = await app.fetch(new Request("https://evil.example/auth/github"), limited, ctx);
      assert.equal(unknown.status, 400);

      const start = await app.fetch(new Request(`${STREMIO}/auth/github`), limited, ctx);
      const state = new URL(start.headers.get("location") ?? "").searchParams.get("state");
      const callback = await app.fetch(
        new Request(`${DASH}/auth/github/callback?code=not-a-login&state=${state}`),
        limited,
        ctx,
      );
      assert.equal(callback.status, 400);
      assert.equal(callback.headers.get("location"), null);

      const wrongState = await app.fetch(
        new Request(`${STREMIO}/auth/github/callback?code=abc&state=other`, {
          headers: { Cookie: "oauth_state=expected" },
        }),
        limited,
        ctx,
      );
      assert.equal(wrongState.status, 400);
    });
  });

  test("existing /auth/me session still works", async () => {
    await withTestContext(async (env, ctx) => {
      const userId = await insertUser(env);
      const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
      const me = await app.fetch(
        new Request(`${STREMIO}/auth/me`, { headers: { Cookie: `token=${token}` } }),
        withOrigins(env),
        ctx,
      );
      assert.equal(me.status, 200);
      const body = (await me.json()) as { user: { id: string } };
      assert.equal(body.user.id, userId);
    });
  });
});

describe("install origin and internal stremio isolation", { concurrency: false }, () => {
  test("configure GET/POST emit STREMIO_ORIGIN even on the dash host", async () => {
    await withTestContext(async (env, ctx) => {
      const limited = withOrigins(env);
      const html = await app.fetch(new Request(`${DASH}/configure`), limited, ctx);
      assert.equal(html.status, 200);
      const body = await html.text();
      assert.match(body, new RegExp(`${STREMIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));
      assert.equal(body.includes(`${DASH}/`), false);

      const posted = await app.fetch(
        new Request(`${DASH}/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalogIds: ["movie_top250"] }),
        }),
        limited,
        ctx,
      );
      assert.equal(posted.status, 200);
      const json = (await posted.json()) as { success: boolean; manifestUrl: string };
      assert.equal(json.success, true);
      assert.equal(json.manifestUrl.startsWith(`${STREMIO}/`), true);
      assert.equal(json.manifestUrl.includes("douban-bridge-core.baran.wang"), false);
    });
  });

  test("default web app does not serve /stremio and origin is required for catalog", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          sourceCalls += 1;
          return { subject_collection_items: [], total: 0 };
        });
        const limited = withOrigins(env);
        const web = await app.fetch(new Request(`${DASH}/stremio/manifest`), limited, ctx);
        assert.equal(web.status, 404);

        const redirect = await internalStremio.fetch(
          new Request("https://core.internal/stremio/manifest"),
          limited,
          ctx,
        );
        assert.equal(redirect.status, 200);
        const missing = (await redirect.json()) as { redirectConfig: string };
        assert.equal(missing.redirectConfig, encodeConfig());

        const denied = await internalStremio.fetch(
          new Request(`https://core.internal/stremio/catalog/movie_top250?origin=${encodeURIComponent(DASH)}`),
          limited,
          ctx,
        );
        assert.equal(denied.status, 400);
        assert.equal(sourceCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });
});
