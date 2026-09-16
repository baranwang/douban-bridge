import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { describe, mock } from "node:test";
import { fileURLToPath } from "node:url";
import axios from "axios";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { getDrizzle, userConfigs, users } from "../src/db";
import { api } from "../src/libs/api";
import { replaceApiKey } from "../src/libs/api-key";
import { internalApi } from "../src/routes/internal-api";
import { withTestContext } from "./context";

const PUBLIC = "https://douban-bridge.baran.wang";
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
      starCheckedAt: new Date(),
      ...overrides,
    });
  return userId;
}

function noStore(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}

describe("internal api entry isolation", { concurrency: false }, () => {
  test("public /v1 requires Bearer and ignores cookies or bypass headers", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectCollectionItems", async () => {
          sourceCalls += 1;
          return { subject_collection_items: [], total: 0 };
        });
        const limited = withRateLimits(env);
        const web = await app.fetch(new Request(`${PUBLIC}/v1/catalog/movie_top250`), limited, ctx);
        assert.equal(web.status, 401);
        noStore(web);
        assert.equal(sourceCalls, 0);

        const userId = await insertUser(env);
        const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
        const cookied = await app.fetch(
          new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers: { Cookie: `token=${token}` } }),
          limited,
          ctx,
        );
        assert.equal(cookied.status, 401);
        noStore(cookied);

        const denied = await Promise.all([
          app.fetch(new Request(`${PUBLIC}/v1/catalog/movie_top250`), limited, ctx),
          app.fetch(
            new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers: { "X-Internal": "true", "X-User-Id": "u1" } }),
            limited,
            ctx,
          ),
          app.fetch(new Request(`${PUBLIC}/v1/catalog/movie_top250?mode=stremio`), limited, ctx),
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
          `${PUBLIC}/v1/catalog/movie_top250?foo=1`,
          `${PUBLIC}/v1/catalog/movie_top250?skip=0&skip=20`,
          `${PUBLIC}/v1/catalog/movie_top250?skip=`,
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
          new Request(`${PUBLIC}/v1/meta/1291546?origin=https://evil.example`, { headers }),
          withRateLimits(env),
          ctx,
        );
        assert.equal(meta.status, 400);
        noStore(meta);

        const limited = await internalApi.fetch(
          new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers }),
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
        const url = `${PUBLIC}/v1/catalog/movie_top250`;
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
          new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers }),
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
          new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers }),
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
          new Request(`${PUBLIC}/v1/catalog/movie_top250`, { headers }),
          limited,
          ctx,
        );
        assert.equal(crashed.status, 500);
        noStore(crashed);
        assert.deepEqual(await crashed.json(), { error: "internal_error" });
        const dumped = JSON.stringify(logs);
        assert.equal(dumped.includes(`${PUBLIC}/v1/catalog/movie_top250`), false);
        assert.equal(dumped.includes("Authorization"), false);
        assert.ok(logs.some((args) => args.includes("internal_error")));
        error.mock.restore();
      } finally {
        mock.restoreAll();
      }
    });
  });
});

describe("internal api batch items", { concurrency: false }, () => {
  test("POST /v1/items requires Bearer and rejects empty, oversized, and extra keys", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        let sourceCalls = 0;
        mock.method(api.doubanAPI, "getSubjectDetail", async () => {
          sourceCalls += 1;
          return { id: 1, type: "movie", title: "x", linewatches: [] };
        });
        const limited = withRateLimits(env);
        const denied = await internalApi.fetch(
          new Request(`${PUBLIC}/v1/items`, { method: "POST", body: JSON.stringify({ ids: [1291546] }) }),
          limited,
          ctx,
        );
        assert.equal(denied.status, 401);
        noStore(denied);

        const userId = await insertUser(env);
        const sk = await replaceApiKey(env, userId);
        const headers = { Authorization: `Bearer ${sk}`, "Content-Type": "application/json" };
        const bads = [
          { ids: [] },
          { ids: Array.from({ length: 21 }, (_, i) => i + 1) },
          { ids: [1291546], extra: true },
          { ids: [0] },
        ];
        for (const body of bads) {
          const response = await internalApi.fetch(
            new Request(`${PUBLIC}/v1/items`, { method: "POST", headers, body: JSON.stringify(body) }),
            limited,
            ctx,
          );
          assert.equal(response.status, 400, JSON.stringify(body));
          noStore(response);
        }
        assert.equal(sourceCalls, 0);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test("POST /v1/items maps ids in request order and omits missing subjects", async () => {
    await withTestContext(async (env, ctx) => {
      try {
        mock.method(api.doubanAPI, "getSubjectDetail", async (id: number) => {
          if (id === 2) {
            const error = new axios.AxiosError("missing");
            error.status = 404;
            error.response = { status: 404, data: null, statusText: "Not Found", headers: {}, config: error.config! };
            throw error;
          }
          return {
            id,
            type: "movie",
            title: `标题${id}`,
            year: "1994",
            cover_url: POSTER,
            rating: { value: 9.1 },
            linewatches: [],
          };
        });
        mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => ({
          doubanId,
          tmdbId: doubanId === 1 ? 101 : null,
          imdbId: null,
          traktId: null,
        }));
        const userId = await insertUser(env);
        const sk = await replaceApiKey(env, userId);
        const response = await internalApi.fetch(
          new Request(`${PUBLIC}/v1/items`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [1, 2, 3] }),
          }),
          withRateLimits(env),
          ctx,
        );
        assert.equal(response.status, 200);
        noStore(response);
        const body = (await response.json()) as {
          items: Array<{ doubanId: number; title: string; tmdbId: number | null }>;
        };
        assert.deepEqual(
          body.items.map((item) => item.doubanId),
          [1, 3],
        );
        assert.equal(body.items[0].tmdbId, 101);
        assert.equal(body.items[0].title, "标题1");
      } finally {
        mock.restoreAll();
      }
    });
  });
});
