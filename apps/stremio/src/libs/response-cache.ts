import type { Context } from "hono";
import type { StremioEnv } from "../env";

export type ResponseCacheNamespace = "catalog" | "meta";

type ResponseCacheOptions = {
  namespace: ResponseCacheNamespace;
};

type ResponseCachePutOptions = ResponseCacheOptions & {
  ttl: number;
};

const RESPONSE_CACHE_ORIGIN = "https://cache.internal";
const RESPONSE_CACHE_PATH = "/response-cache";

export const getResponseCacheKey = (c: Context<StremioEnv>, namespace: ResponseCacheNamespace) => {
  const url = new URL(`${RESPONSE_CACHE_PATH}/${namespace}`, RESPONSE_CACHE_ORIGIN);
  url.searchParams.set("url", c.req.url);
  return new Request(url, { method: "GET" });
};

export const matchResponseCache = async (c: Context<StremioEnv>, { namespace }: ResponseCacheOptions) => {
  if (process.env.NODE_ENV === "development") {
    return null;
  }
  if (c.req.method === "GET") {
    try {
      if (typeof caches === "undefined") return null;
      const cached = await caches.default.match(getResponseCacheKey(c, namespace));
      return cached?.clone() ?? null;
    } catch (error: unknown) {
      console.warn("Response cache read failed", error);
      return null;
    }
  }

  return null;
};

export const putResponseCache = (
  c: Context<StremioEnv>,
  response: Response,
  { namespace, ttl }: ResponseCachePutOptions,
) => {
  if (c.req.method === "GET" && response.status === 200) {
    try {
      if (typeof caches === "undefined") return;
      const cachedResponse = response.clone();
      const headers = new Headers(cachedResponse.headers);
      headers.set("Cache-Control", `public, max-age=${ttl}`);

      const cacheEntry = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });

      c.executionCtx.waitUntil(
        caches.default.put(getResponseCacheKey(c, namespace), cacheEntry).catch((error: unknown) => {
          console.warn("Response cache write failed", error);
        }),
      );
    } catch (error: unknown) {
      console.warn("Response cache write failed", error);
    }
  }
};
