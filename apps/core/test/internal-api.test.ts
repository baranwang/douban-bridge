import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { describe, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { getDrizzle, userConfigs, users } from "../src/db";
import { api } from "../src/libs/api";
import { replaceApiKey } from "../src/libs/api-key";
import { internalApi } from "../src/routes/internal-api";
import { withTestContext } from "./context";

const DASH = "https://douban-bridge-dash.baran.wang";
const API = "https://douban-bridge-api.baran.wang";
const POSTER = "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg";

function withRateLimits(env: CloudflareBindings, userSuccess = true): CloudflareBindings {
  return {
    ...env,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: userSuccess }) },
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
      ...overrides,
    });
  return userId;
}

function noStore(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}

describe("internal api entry isolation", { concurrency: false }, () => {
  test("web app does not serve /v1 catalog and bypass headers never grant access", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          sourceCalls += 1;
          return { subject_collection_items: [], total: 0 };
        });
        const limited = withRateLimits(env);
        const web = await app.fetch(new Request(`${DASH}/v1/catalog/movie_top250`), limited, ctx);
        assert.equal(web.status, 404);
        assert.equal(sourceCalls, 0);

        const denied = await Promise.all([
          internalApi.fetch(new Request(`${API}/v1/catalog/movie_top250`), limited, ctx),
          internalApi.fetch(
            new Request(`${API}/v1/catalog/movie_top250`, { headers: { "X-Internal": "true", "X-User-Id": "u1" } }),
            limited,
            ctx,
          ),
          internalApi.fetch(new Request(`${API}/v1/catalog/movie_top250?mode=stremio`), limited, ctx),
        ]);
        for (const response of denied) {
          assert.equal(response.status, 401);
          noStore(response);
        }
        assert.equal(sourceCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });
});

describe("internal api catalog and meta", { concurrency: false }, () => {
  test("rejects unknown, duplicate, and empty catalog query keys before the service", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          sourceCalls += 1;
          return { subject_collection_items: [], total: 0 };
        });
        const userId = await insertUser(env);
        const sk = await replaceApiKey(env, userId);
        const limited = withRateLimits(env);
        const headers = { Authorization: `Bearer ${sk}` };
        const urls = [
          `${API}/v1/catalog/movie_top250?foo=1`,
          `${API}/v1/catalog/movie_top250?skip=0&skip=20`,
          `${API}/v1/catalog/movie_top250?skip=`,
        ];
        for (const url of urls) {
          const response = await internalApi.fetch(new Request(url, { headers }), limited, ctx);
          assert.equal(response.status, 400, url);
          noStore(response);
        }
        assert.equal(sourceCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("meta rejects all query params and catalog rate-limits by userId", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectDetail", async () => {
          sourceCalls += 1;
          return { id: 1, type: "movie", title: "x", linewatches: [] };
        });
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          sourceCalls += 1;
          return { subject_collection_items: [], total: 0 };
        });
        const userId = await insertUser(env);
        const sk = await replaceApiKey(env, userId);
        const headers = { Authorization: `Bearer ${sk}` };
        const meta = await internalApi.fetch(
          new Request(`${API}/v1/meta/1291546?origin=https://evil.example`, { headers }),
          withRateLimits(env),
          ctx,
        );
        assert.equal(meta.status, 400);
        noStore(meta);

        const limited = await internalApi.fetch(
          new Request(`${API}/v1/catalog/movie_top250`, { headers }),
          withRateLimits(env, false),
          ctx,
        );
        assert.equal(limited.status, 429);
        noStore(limited);
        assert.equal(sourceCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("isolates two accounts, empty pages, items without ids, and never caches", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [
            {
              id: 1291546,
              type: "movie",
              title: "肖申克的救赎",
              cover: POSTER,
              year: "1994",
              description: "hope",
            },
          ],
          total: 1,
        }));
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => ({
          doubanId,
          tmdbId: null,
          imdbId: null,
          traktId: null,
        }));
        const doubanUser = await insertUser(env);
        const emptyUser = await insertUser(env);
        await getDrizzle(env)
          .insert(userConfigs)
          .values([
            { userId: doubanUser, imageProviders: [{ provider: "douban", extra: {} }] },
            { userId: emptyUser, imageProviders: [] },
          ]);
        const doubanSk = await replaceApiKey(env, doubanUser);
        const emptySk = await replaceApiKey(env, emptyUser);
        const limited = withRateLimits(env);
        const url = `${API}/v1/catalog/movie_top250`;
        const first = await internalApi.fetch(
          new Request(url, { headers: { Authorization: `Bearer ${doubanSk}` } }),
          limited,
          ctx,
        );
        const second = await internalApi.fetch(
          new Request(url, { headers: { Authorization: `Bearer ${emptySk}` } }),
          limited,
          ctx,
        );
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        noStore(first);
        noStore(second);
        const firstBody = (await first.json()) as {
          items: Array<{ images: { poster: string | null }; tmdbId: number | null; imdbId: string | null }>;
        };
        const secondBody = (await second.json()) as {
          items: Array<{ images: { poster: string | null }; tmdbId: number | null; imdbId: string | null }>;
        };
        assert.equal(firstBody.items.length, 1);
        assert.notEqual(firstBody.items[0].images.poster, secondBody.items[0].images.poster);
        assert.match(firstBody.items[0].images.poster ?? "", /\/image-proxy\//);
        assert.equal(secondBody.items[0].images.poster, null);
        assert.equal(firstBody.items[0].tmdbId, null);
        assert.equal(firstBody.items[0].imdbId, null);

        await getDrizzle(env).update(userConfigs).set({ imageProviders: [] }).where(eq(userConfigs.userId, doubanUser));
        const after = await internalApi.fetch(
          new Request(url, { headers: { Authorization: `Bearer ${doubanSk}` } }),
          limited,
          ctx,
        );
        assert.equal(after.status, 200);
        noStore(after);
        const afterBody = (await after.json()) as { items: Array<{ images: { poster: string | null } }> };
        assert.equal(afterBody.items[0].images.poster, null);

        mock.restoreAll();
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [],
          total: 0,
        }));
        const emptyPage = await internalApi.fetch(
          new Request(url, { headers: { Authorization: `Bearer ${emptySk}` } }),
          limited,
          ctx,
        );
        assert.equal(emptyPage.status, 200);
        noStore(emptyPage);
        assert.deepEqual(await emptyPage.json(), { items: [] });

        const src = await readFile(fileURLToPath(new URL("../src/routes/internal-api.ts", import.meta.url)), "utf8");
        assert.equal(src.includes("putResponseCache"), false);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("maps missing source to 404, upstream faults to 502, and unknown errors to internal_error", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        const userId = await insertUser(env);
        const sk = await replaceApiKey(env, userId);
        const limited = withRateLimits(env);
        const headers = { Authorization: `Bearer ${sk}` };
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => undefined);
        const missing = await internalApi.fetch(
          new Request(`${API}/v1/catalog/movie_top250`, { headers }),
          limited,
          ctx,
        );
        assert.equal(missing.status, 404);
        noStore(missing);

        mock.restoreAll();
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          throw new Error("upstream down");
        });
        const badGateway = await internalApi.fetch(
          new Request(`${API}/v1/catalog/movie_top250`, { headers }),
          limited,
          ctx,
        );
        assert.equal(badGateway.status, 502);
        noStore(badGateway);

        mock.restoreAll();
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => ({
          subject_collection_items: [{ id: 1, type: "show", title: "坏类型" }],
          total: 1,
        }));
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => ({
          doubanId,
          tmdbId: null,
          imdbId: null,
          traktId: null,
        }));
        const logs: unknown[][] = [];
        const error = mock.method(console, "error", (...args: unknown[]) => {
          logs.push(args);
        });
        const crashed = await internalApi.fetch(
          new Request(`${API}/v1/catalog/movie_top250`, { headers }),
          limited,
          ctx,
        );
        assert.equal(crashed.status, 500);
        noStore(crashed);
        assert.deepEqual(await crashed.json(), { error: "internal_error" });
        const dumped = JSON.stringify(logs);
        assert.equal(dumped.includes(`${API}/v1/catalog/movie_top250`), false);
        assert.equal(dumped.includes("Authorization"), false);
        assert.ok(logs.some((args) => args.includes("internal_error")));
        error.mock.restore();
      } finally {
        mock.restoreAll();
      }
    });
  });
});
