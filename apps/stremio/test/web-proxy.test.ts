import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { app } from "../src/index";
import { isWebCompatibilityRoute } from "../src/libs/web-proxy";

const ORIGIN = "https://stremio-addon-douban.baran.wang";
const USER = "11111111-1111-4111-8111-111111111111";

type WebCall = {
  url: string;
  method: string;
  authorization: string | null;
  cookie: string | null;
  origin: string | null;
};

function ctx() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}

function env(opts: {
  web?: (input: Request | URL | string) => Promise<Response>;
  publicOk?: boolean;
  userOk?: boolean;
  protocol?: (input: Request | URL | string) => Promise<Response>;
}) {
  let publicHits = 0;
  let userHits = 0;
  const webCalls: WebCall[] = [];
  const protocolCalls: string[] = [];
  return {
    hits: () => ({ publicHits, userHits, webCalls, protocolCalls }),
    bindings: {
      PUBLIC_RATE_LIMIT: {
        limit: async () => {
          publicHits += 1;
          return { success: opts.publicOk ?? true };
        },
      },
      USER_RATE_LIMIT: {
        limit: async () => {
          userHits += 1;
          return { success: opts.userOk ?? true };
        },
      },
      CORE_WEB: {
        fetch: async (input: Request | URL | string) => {
          const request = input instanceof Request ? input : new Request(input);
          webCalls.push({
            url: request.url,
            method: request.method,
            authorization: request.headers.get("Authorization"),
            cookie: request.headers.get("Cookie"),
            origin: request.headers.get("Origin"),
          });
          if (opts.web) return opts.web(request);
          return new Response("web-ok", { status: 200 });
        },
      },
      CORE_STREMIO: {
        fetch: async (input: Request | URL | string) => {
          const request = new Request(input);
          protocolCalls.push(request.url);
          if (opts.protocol) return opts.protocol(request);
          return Response.json({
            item: { doubanId: 1, mediaType: "movie", title: "x", images: {}, genres: [], links: [] },
          });
        },
      },
    },
  };
}

describe("web compatibility allowlist", () => {
  test("allows the listed methods and rejects unknown and malicious paths", () => {
    assert.equal(isWebCompatibilityRoute("GET", "/"), true);
    assert.equal(isWebCompatibilityRoute("HEAD", "/"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/configure"), true);
    assert.equal(isWebCompatibilityRoute("HEAD", "/configure"), true);
    assert.equal(isWebCompatibilityRoute("POST", "/configure"), true);
    assert.equal(isWebCompatibilityRoute("GET", `/${USER}/configure`), true);
    assert.equal(isWebCompatibilityRoute("POST", `/${USER}/configure`), true);
    assert.equal(isWebCompatibilityRoute("GET", "/auth/github"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/auth/github/callback"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/auth/me"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/auth/check-star"), true);
    assert.equal(isWebCompatibilityRoute("POST", "/auth/logout"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/api-keys"), false);
    assert.equal(isWebCompatibilityRoute("POST", "/api-keys"), false);
    assert.equal(isWebCompatibilityRoute("DELETE", "/api-keys"), false);
    assert.equal(isWebCompatibilityRoute("GET", `/image-proxy/${USER}`), true);
    assert.equal(isWebCompatibilityRoute("HEAD", `/image-proxy/${USER}`), true);
    assert.equal(isWebCompatibilityRoute("GET", "/dash/tidy-up"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/dash/tidy-up/"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/dash/tidy-up/1291546"), true);
    assert.equal(isWebCompatibilityRoute("POST", "/dash/tidy-up/1291546"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/icon.png"), true);
    assert.equal(isWebCompatibilityRoute("HEAD", "/icon.png"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/stremio-logo.png"), true);
    assert.equal(isWebCompatibilityRoute("HEAD", "/stremio-logo.png"), true);
    assert.equal(isWebCompatibilityRoute("GET", "/assets/style-abc.css"), true);
    assert.equal(isWebCompatibilityRoute("HEAD", "/assets/configure.js"), true);

    assert.equal(isWebCompatibilityRoute("POST", "/"), false);
    assert.equal(isWebCompatibilityRoute("HEAD", "/auth/me"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/v1/catalog/movie_top250"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/stremio/manifest"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/internal/anything"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/dash/tidy-up/0123"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/dash/tidy-up/not-an-id"), false);
    assert.equal(isWebCompatibilityRoute("GET", `/image-proxy/${USER}/extra`), false);
    assert.equal(isWebCompatibilityRoute("GET", "/foo/bar/configure"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/assets/../secret"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/assets/%2e%2e/secret"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/assets/foo\\bar.js"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/manifest.json"), false);
    assert.equal(isWebCompatibilityRoute("GET", "/catalog/movie/movie_top250.json"), false);
  });

  test("forwards the original request to CORE_WEB including Basic auth and cookies", async () => {
    const { bindings, hits } = env({});
    const request = new Request(`${ORIGIN}/dash/tidy-up/1291546`, {
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
        Cookie: "token=keep",
        Origin: ORIGIN,
      },
    });
    const response = await app.fetch(request, bindings, ctx());
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "web-ok");
    const { webCalls, publicHits, userHits, protocolCalls } = hits();
    assert.equal(webCalls.length, 1);
    assert.equal(webCalls[0].url, request.url);
    assert.equal(webCalls[0].method, "GET");
    assert.equal(webCalls[0].authorization, "Basic dXNlcjpwYXNz");
    assert.equal(webCalls[0].cookie, "token=keep");
    assert.equal(webCalls[0].origin, ORIGIN);
    assert.equal(publicHits, 0);
    assert.equal(userHits, 0);
    assert.equal(protocolCalls.length, 0);
  });

  test("HEAD of listed GET/HEAD routes reaches CORE_WEB as HEAD", async () => {
    const { bindings, hits } = env({});
    const response = await app.fetch(new Request(`${ORIGIN}/configure`, { method: "HEAD" }), bindings, ctx());
    assert.equal(response.status, 200);
    assert.equal(hits().webCalls[0].method, "HEAD");
    assert.equal(hits().webCalls[0].url, `${ORIGIN}/configure`);
  });

  test("unknown paths never call CORE_WEB and protocol rate-limit is not applied to web", async () => {
    const { bindings, hits } = env({ publicOk: false });
    for (const path of ["/v1/catalog/movie_top250", "/stremio/manifest", "/internal/anything", "/not-a-route"]) {
      const response = await app.fetch(new Request(`${ORIGIN}${path}`), bindings, ctx());
      assert.equal(response.status, 404, path);
    }
    assert.equal(hits().webCalls.length, 0);

    const web = await app.fetch(new Request(`${ORIGIN}/configure`), bindings, ctx());
    assert.equal(web.status, 200);
    assert.equal(hits().webCalls.length, 1);
    assert.equal(hits().publicHits, 0);
  });

  test("returns upstream Set-Cookie values without merging them", async () => {
    const { bindings } = env({
      web: async () => {
        const headers = new Headers();
        headers.append("Set-Cookie", "oauth_state=abc; Path=/; HttpOnly; Secure; SameSite=Lax");
        headers.append("Set-Cookie", "token=jwt; Path=/; HttpOnly; Secure; SameSite=Lax");
        return new Response("ok", { headers });
      },
    });
    const response = await app.fetch(new Request(`${ORIGIN}/auth/github`), bindings, ctx());
    assert.deepEqual(response.headers.getSetCookie(), [
      "oauth_state=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
      "token=jwt; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  test("rate-limits Stremio protocol at the edge", async () => {
    const { bindings, hits } = env({ publicOk: false });
    const limited = await app.fetch(new Request(`${ORIGIN}/meta/movie/douban:1291546.json`), bindings, ctx());
    assert.equal(limited.status, 429);
    assert.equal(hits().protocolCalls.length, 0);
    assert.equal(hits().publicHits, 1);
    assert.equal(hits().webCalls.length, 0);
  });
});
