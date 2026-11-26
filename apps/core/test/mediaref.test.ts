import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import { app } from "../src/app";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { MEDIAREF_API } from "../src/libs/api/mediaref";
import { withTestContext } from "./context";

type Call = { url: string; headers: Headers; body: Record<string, unknown> };
type Handler = (call: Call, init?: RequestInit) => Promise<Response> | Response;

const BATCH = `${MEDIAREF_API}/mediaref.v1.MediaService/BatchGetMedia`;
const SUBMIT = `${MEDIAREF_API}/mediaref.v1.ChangeRequestService/CreateChangeRequest`;

function mediaItem(doubanId: number, tmdb: string, opts: { unconfirmed?: boolean; imdb?: string } = {}) {
  return {
    document: {
      externalIds: [
        { namespace: "tmdb", nativeId: tmdb },
        ...(opts.imdb ? [{ namespace: "imdb", nativeId: opts.imdb }] : []),
        { namespace: "trakt", nativeId: "movie:77" },
      ],
      associations: [
        {
          id: `assoc-${doubanId}-${tmdb}`,
          namespace: "douban",
          nativeId: String(doubanId),
          ...(opts.unconfirmed ? { unconfirmed: true } : {}),
        },
      ],
    },
    matchedAssociationId: `assoc-${doubanId}-${tmdb}`,
  };
}

function batchResponse(hits: Record<number, unknown[]>) {
  return (call: Call) => {
    const refs = call.body.refs as { douban: string }[];
    return Response.json({
      results: refs.map((ref) =>
        hits[Number(ref.douban)]
          ? { ref, success: { items: hits[Number(ref.douban)] } }
          : { ref, error: { code: "NOT_FOUND", message: "Media not found" } },
      ),
    });
  };
}

/** 拦截 MediaRef 请求，其余请求视为测试漏 mock。返回记录下的调用。 */
function mockMediaRef(handlers: { batch?: Handler; submit?: Handler }) {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const call = { url: request.url, headers: request.headers, body: await request.json() };
    calls.push(call);
    if (call.url === BATCH && handlers.batch) return handlers.batch(call, init);
    if (call.url === SUBMIT && handlers.submit) return handlers.submit(call, init);
    throw new Error(`unexpected fetch ${call.url}`);
  });
  return calls;
}

function trackFindExternalId(result: { tmdbId: number | null; imdbId?: string | null } = { tmdbId: null }) {
  const requested: number[] = [];
  mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => {
    requested.push(doubanId);
    return { doubanId, tmdbId: result.tmdbId, imdbId: result.imdbId ?? null, traktId: null };
  });
  return requested;
}

async function withMediaRef<T>(run: (env: CloudflareBindings, flush: () => Promise<void>) => Promise<T>) {
  return withTestContext(async (env, ctx) => {
    env.MEDIAREF_API_KEY = "mr-test-key";
    const pending: Promise<unknown>[] = [];
    const waitUntil = ctx.waitUntil.bind(ctx);
    ctx.waitUntil = (promise: Promise<unknown>) => {
      pending.push(promise);
      waitUntil(promise);
    };
    try {
      return await run(env, async () => {
        await Promise.all(pending);
      });
    } finally {
      mock.restoreAll();
    }
  });
}

describe("MediaRef id mapping", { concurrency: false }, () => {
  test("MediaRef hit wins over local and skips lookup and lead submission", async () => {
    await withMediaRef(async (_env, flush) => {
      await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 999, calibrated: true });
      const calls = mockMediaRef({ batch: batchResponse({ 1: [mediaItem(1, "movie:278", { imdb: "tt0111161" })] }) });
      const requested = trackFindExternalId({ tmdbId: 5 });

      const result = await api.fetchIdMapping([{ doubanId: 1, type: "movie", title: "肖申克的救赎" }]);
      await flush();

      assert.deepEqual(result.get(1), { tmdbId: 278, imdbId: "tt0111161", traktId: 77 });
      assert.deepEqual(requested, []);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers.get("X-API-Key"), "mr-test-key");
      assert.deepEqual(calls[0].body, { refs: [{ douban: "1" }], includeUnconfirmed: true });
    });
  });

  test("confirmed MediaRef items are preferred over unconfirmed ones", async () => {
    await withMediaRef(async () => {
      mockMediaRef({
        batch: batchResponse({ 1: [mediaItem(1, "tv:11", { unconfirmed: true }), mediaItem(1, "tv:22")] }),
      });
      trackFindExternalId();
      const result = await api.fetchIdMapping([{ doubanId: 1, type: "tv" }]);
      assert.equal(result.get(1)?.tmdbId, 22);
    });
  });

  test("malformed MediaRef fields are dropped without discarding other hits", async () => {
    await withMediaRef(async () => {
      mockMediaRef({
        batch: () =>
          Response.json({
            results: [
              {
                ref: { douban: "1" },
                success: { items: [mediaItem(1, "movie:278", { imdb: 123 as unknown as string })] },
              },
              {
                ref: { douban: "2" },
                success: { items: [{ document: { externalIds: "oops" } }, mediaItem(2, "movie:9")] },
              },
              { ref: 42, success: { items: [mediaItem(3, "movie:3")] } },
            ],
          }),
      });
      trackFindExternalId();
      const result = await api.fetchIdMapping([
        { doubanId: 1, type: "movie" },
        { doubanId: 2, type: "movie" },
      ]);
      assert.deepEqual(result.get(1), { tmdbId: 278, imdbId: null, traktId: 77 });
      assert.equal(result.get(2)?.tmdbId, 9);
    });
  });

  test("MediaRef miss falls back to local mapping, then KV lead cache", async () => {
    await withMediaRef(async (env) => {
      await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, imdbId: "tt101" });
      await env.KV.put("mediaref:lead:2", JSON.stringify({ tmdbId: 202, imdbId: null, traktId: null }));
      mockMediaRef({ batch: batchResponse({}) });
      const requested = trackFindExternalId({ tmdbId: 5 });

      const result = await api.fetchIdMapping([
        { doubanId: 1, type: "movie" },
        { doubanId: 2, type: "movie" },
      ]);

      assert.deepEqual(result.get(1), { tmdbId: 101, imdbId: "tt101", traktId: null });
      assert.deepEqual(result.get(2), { tmdbId: 202, imdbId: null, traktId: null });
      assert.deepEqual(requested, []);
    });
  });

  for (const [name, batch] of [
    [
      "fetch throws",
      () => {
        throw new TypeError("network down");
      },
    ],
    ["500", () => new Response("boom", { status: 500 })],
    [
      "timeout",
      (_call: Call, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    ],
  ] as [string, Handler][]) {
    test(`MediaRef error (${name}) falls back to local behaviour`, async () => {
      await withMediaRef(async () => {
        await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101 });
        mock.method(console, "warn", () => {});
        mockMediaRef({ batch });
        const requested = trackFindExternalId({ tmdbId: null });

        const result = await api.fetchIdMapping([
          { doubanId: 1, type: "movie" },
          { doubanId: 2, type: "movie" },
        ]);

        assert.equal(result.get(1)?.tmdbId, 101);
        assert.equal(result.get(2)?.tmdbId, null);
        assert.deepEqual(requested, [2]);
      });
    });
  }

  test("a found movie is cached and submitted to MediaRef as a lead; tv is not submitted", async () => {
    await withMediaRef(async (env, flush) => {
      const calls = mockMediaRef({
        batch: batchResponse({}),
        submit: () => Response.json({ changeRequest: { id: "cr-1" } }),
      });
      trackFindExternalId({ tmdbId: 278, imdbId: "tt0111161" });

      const result = await api.fetchIdMapping([
        { doubanId: 1, type: "movie" },
        { doubanId: 2, type: "tv" },
      ]);
      await flush();

      assert.equal(result.get(1)?.tmdbId, 278);
      const submits = calls.filter((call) => call.url === SUBMIT);
      assert.deepEqual(
        submits.map((call) => call.body),
        [
          {
            target: { tmdb: { type: "MEDIA_TYPE_MOVIE", id: 278 } },
            namespace: "douban",
            nativeId: "1",
            segments: [],
          },
        ],
      );
      assert.deepEqual(await env.KV.get("mediaref:lead:1", "json"), {
        tmdbId: 278,
        imdbId: "tt0111161",
        traktId: null,
      });
      assert.equal((await env.KV.get<{ tmdbId: number }>("mediaref:lead:2", "json"))?.tmdbId, 278);
    });
  });

  test("cached leads are not resubmitted and lead submissions are capped per request", async () => {
    await withMediaRef(async (env, flush) => {
      await env.KV.put("mediaref:lead:1", JSON.stringify({ tmdbId: 11, imdbId: null, traktId: null }));
      const calls = mockMediaRef({ batch: batchResponse({}), submit: () => Response.json({}) });
      const requested = trackFindExternalId({ tmdbId: 9 });
      const items = Array.from({ length: 8 }, (_, i) => ({ doubanId: i + 1, type: "movie" as const }));

      await api.fetchIdMapping(items);
      await flush();

      assert.equal(requested.includes(1), false);
      assert.equal(calls.filter((call) => call.url === SUBMIT).length, 5);
    });
  });

  test("a failed lead submission does not affect the result", async () => {
    await withMediaRef(async (_env, flush) => {
      mock.method(console, "warn", () => {});
      mockMediaRef({ batch: batchResponse({}), submit: () => new Response("quota", { status: 429 }) });
      trackFindExternalId({ tmdbId: 278 });
      const result = await api.fetchIdMapping([{ doubanId: 1, type: "movie" }]);
      await flush();
      assert.equal(result.get(1)?.tmdbId, 278);
    });
  });

  test("lookups with upstream errors are used but not cached", async () => {
    await withMediaRef(async (env, flush) => {
      mockMediaRef({ batch: batchResponse({}) });
      mock.method(api, "findExternalId", async ({ doubanId }: { doubanId: number }) => ({
        doubanId,
        tmdbId: null,
        imdbId: "tt1",
        traktId: null,
        failed: true,
      }));
      const result = await api.fetchIdMapping([{ doubanId: 1, type: "movie" }]);
      await flush();
      assert.equal(result.get(1)?.imdbId, "tt1");
      assert.equal(await env.KV.get("mediaref:lead:1"), null);
    });
  });

  test("a failing lead cache read is treated as a miss", async () => {
    await withMediaRef(async (env) => {
      mockMediaRef({ batch: batchResponse({}) });
      const kv = env.KV;
      env.KV = {
        get: async () => {
          throw new Error("kv down");
        },
        put: (...args: Parameters<KVNamespace["put"]>) => kv.put(...args),
      } as unknown as KVNamespace;
      const requested = trackFindExternalId({ tmdbId: 7 });
      const result = await api.fetchIdMapping([{ doubanId: 1, type: "tv" }]);
      assert.deepEqual(requested, [1]);
      assert.equal(result.get(1)?.tmdbId, 7);
    });
  });

  test("discover: false reads MediaRef and the lead cache without looking up", async () => {
    await withMediaRef(async (env) => {
      await env.KV.put("mediaref:lead:2", JSON.stringify({ tmdbId: 202, imdbId: null, traktId: null }));
      mockMediaRef({ batch: batchResponse({ 1: [mediaItem(1, "movie:278")] }) });
      const requested = trackFindExternalId({ tmdbId: 5 });
      const result = await api.fetchIdMapping(
        [
          { doubanId: 1, type: "movie" },
          { doubanId: 2, type: "movie" },
          { doubanId: 3, type: "movie" },
        ],
        { discover: false },
      );
      assert.deepEqual(requested, []);
      assert.equal(result.get(1)?.tmdbId, 278);
      assert.equal(result.get(2)?.tmdbId, 202);
      assert.equal(result.get(3)?.tmdbId, null);
    });
  });

  test("without MEDIAREF_API_KEY nothing is sent to MediaRef", async () => {
    await withMediaRef(async (env, flush) => {
      delete env.MEDIAREF_API_KEY;
      const calls = mockMediaRef({});
      trackFindExternalId({ tmdbId: 278 });
      const result = await api.fetchIdMapping([{ doubanId: 1, type: "movie" }]);
      await flush();
      assert.equal(result.get(1)?.tmdbId, 278);
      assert.equal(calls.length, 0);
    });
  });
});

test("feedback redirects to MediaRef", async () => {
  await withTestContext(async (env, ctx) => {
    const response = await app.fetch(new Request("https://douban-bridge.baran.wang/feedback"), env, ctx);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "https://mediaref.org/");
  });
});
