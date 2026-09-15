import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { app } from "../src/app";
import { isStremioWebRequest, toStremioWebUrl } from "../src/libs/public-origins";
import { withTestContext } from "./context";

const CORE = "https://douban-bridge.baran.wang";
const STREMIO = "https://stremio-addon-douban.baran.wang";

function withOrigins(env: CloudflareBindings): CloudflareBindings {
  return {
    ...env,
    DASH_ORIGIN: CORE,
    STREMIO_ORIGIN: STREMIO,
    PUBLIC_RATE_LIMIT: { limit: async () => ({ success: true }) },
    USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
}

describe("product entry routing", { concurrency: false }, () => {
  test("Core root renders Rex before Stremio without advertising v1", async () => {
    await withTestContext(async (env, ctx) => {
      const response = await app.fetch(new Request(`${CORE}/`), withOrigins(env), ctx);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      const body = await response.text();
      assert.ok(body.indexOf('data-product="rex"') < body.indexOf('data-product="stremio"'));
      assert.equal(body.includes("/v1"), false);
      assert.ok(body.includes('href="/rex"'));
      assert.ok(body.includes(`${STREMIO}/configure`));
    });
  });

  test("Stremio root and Core configure paths redirect to the Stremio domain", async () => {
    await withTestContext(async (env, ctx) => {
      const bindings = withOrigins(env);
      const stremioRoot = await app.fetch(new Request(`${STREMIO}/`), bindings, ctx);
      assert.equal(stremioRoot.status, 307);
      assert.equal(stremioRoot.headers.get("location"), `${STREMIO}/configure`);

      const legacy = await app.fetch(new Request(`${CORE}/abc/configure?from=bookmark`), bindings, ctx);
      assert.equal(legacy.status, 307);
      assert.equal(legacy.headers.get("location"), `${STREMIO}/abc/configure?from=bookmark`);
    });
  });

  test("local ports distinguish Core and Stremio surfaces", () => {
    const env = { DASH_ORIGIN: CORE, STREMIO_ORIGIN: STREMIO };
    assert.equal(isStremioWebRequest(env, "http://localhost:8787/configure"), false);
    assert.equal(isStremioWebRequest(env, "http://localhost:8788/configure"), true);
    assert.equal(
      toStremioWebUrl(env, "http://localhost:8787/a/configure?q=1"),
      "http://localhost:8788/a/configure?q=1",
    );
  });

  test("double-slash paths retain the trusted Stremio origin", () => {
    const env = { DASH_ORIGIN: CORE, STREMIO_ORIGIN: STREMIO };
    assert.equal(
      toStremioWebUrl(env, `${CORE}//evil.example/configure?from=bookmark`),
      `${STREMIO}//evil.example/configure?from=bookmark`,
    );
  });

  test("unmatched development assets fall through to the ASSETS binding", async () => {
    await withTestContext(async (env, ctx) => {
      const bindings = {
        ...withOrigins(env),
        ASSETS: {
          fetch: async () => new Response("body { color: red; }", { headers: { "Content-Type": "text/css" } }),
        },
      } as CloudflareBindings;

      const response = await app.fetch(new Request("http://localhost:5173/src/style.css"), bindings, ctx);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Content-Type"), "text/css");
      assert.equal(await response.text(), "body { color: red; }");
    });
  });
});
