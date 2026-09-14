import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { app } from "../src/index";

type ApiEnv = {
  CORE_API: { fetch: (input: Request | URL | string, init?: RequestInit) => Promise<Response> };
  PUBLIC_RATE_LIMIT: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
};

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

const ORIGIN = "https://douban-bridge-api.baran.wang";
const POSTER = "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg";

function env(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    CORE_API: {
      fetch: async () => new Response("ok", { status: 200, headers: { "X-Upstream": "1" } }),
    },
    ...overrides,
  };
}

describe("public api forwarding", () => {
  test("rate-limits by public IP before forwarding", async () => {
    let forwarded = 0;
    const response = await app.fetch(
      new Request(`${ORIGIN}/v1/catalog/movie_top250`),
      env({
        PUBLIC_RATE_LIMIT: { limit: async ({ key }) => ({ success: key !== "203.0.113.9" }) },
        CORE_API: {
          fetch: async () => {
            forwarded += 1;
            return new Response("ok");
          },
        },
      }),
      ctx,
    );
    const limited = await app.fetch(
      new Request(`${ORIGIN}/v1/catalog/movie_top250`, { headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      env({
        PUBLIC_RATE_LIMIT: { limit: async ({ key }) => ({ success: key !== "203.0.113.9" }) },
        CORE_API: {
          fetch: async () => {
            forwarded += 1;
            return new Response("ok");
          },
        },
      }),
      ctx,
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.status, 200);
    assert.equal(forwarded, 1);
  });

  test("forwards data headers and original URL, not cookies", async () => {
    let incoming: Request | undefined;
    const url = `${ORIGIN}/v1/catalog/movie_top250?skip=20`;
    const response = await app.fetch(
      new Request(url, {
        headers: {
          Authorization: "Bearer sk_test",
          Accept: "application/json",
          "User-Agent": "Rex/1",
          "CF-Connecting-IP": "198.51.100.2",
          Cookie: "token=secret",
          "X-Extra": "nope",
        },
      }),
      env({
        CORE_API: {
          fetch: async (input) => {
            incoming = new Request(input);
            return new Response(JSON.stringify({ items: [] }), { status: 200 });
          },
        },
      }),
      ctx,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.ok(incoming);
    assert.equal(incoming.url, url);
    assert.equal(incoming.headers.get("Authorization"), "Bearer sk_test");
    assert.equal(incoming.headers.get("Accept"), "application/json");
    assert.equal(incoming.headers.get("User-Agent"), "Rex/1");
    assert.equal(incoming.headers.get("CF-Connecting-IP"), "198.51.100.2");
    assert.equal(incoming.headers.get("Cookie"), null);
    assert.equal(incoming.headers.get("X-Extra"), null);
  });

  test("image forwarding omits Authorization and does not consume the body", async () => {
    let incoming: Request | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const url = `${ORIGIN}/image-proxy/11111111-1111-1111-1111-111111111111?url=${encodeURIComponent(POSTER)}`;
    const response = await app.fetch(
      new Request(url, {
        headers: {
          Authorization: "Bearer sk_test",
          Accept: "image/*",
          "If-None-Match": POSTER,
          Cookie: "token=secret",
        },
      }),
      env({
        CORE_API: {
          fetch: async (input) => {
            incoming = new Request(input);
            return new Response(body, { status: 200, headers: { "Content-Type": "image/jpeg" } });
          },
        },
      }),
      ctx,
    );
    assert.ok(incoming);
    assert.equal(incoming.url, url);
    assert.equal(incoming.headers.get("Authorization"), null);
    assert.equal(incoming.headers.get("Accept"), "image/*");
    assert.equal(incoming.headers.get("If-None-Match"), POSTER);
    assert.equal(incoming.headers.get("Cookie"), null);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  test("unknown paths 404, wrong methods 405, CORE_API throw 503, OPTIONS is CORS", async () => {
    let forwarded = 0;
    const core = env({
      CORE_API: {
        fetch: async () => {
          forwarded += 1;
          return new Response("ok");
        },
      },
    });
    const missing = await app.fetch(new Request(`${ORIGIN}/v1/unknown`), core, ctx);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("Cache-Control"), "private, no-store");
    const wrong = await app.fetch(new Request(`${ORIGIN}/v1/catalog/movie_top250`, { method: "POST" }), core, ctx);
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get("Cache-Control"), "private, no-store");
    const options = await app.fetch(
      new Request(`${ORIGIN}/v1/catalog/movie_top250`, {
        method: "OPTIONS",
        headers: { Origin: "https://example.com", "Access-Control-Request-Method": "GET" },
      }),
      core,
      ctx,
    );
    assert.ok(options.status === 204 || options.status === 200);
    assert.ok((options.headers.get("Access-Control-Allow-Methods") ?? "").includes("GET"));
    assert.equal(forwarded, 0);

    const failed = await app.fetch(
      new Request(`${ORIGIN}/v1/meta/1291546`),
      env({
        CORE_API: {
          fetch: async () => {
            throw new Error("binding down");
          },
        },
      }),
      ctx,
    );
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("Cache-Control"), "private, no-store");
  });
});
