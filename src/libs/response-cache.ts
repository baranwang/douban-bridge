import type { Context, Env } from "hono";

export type ResponseCacheNamespace = "catalog" | "meta";
export type ResponseCacheUaVariant = "forward" | "standard";

type ResponseCacheOptions = {
  namespace: ResponseCacheNamespace;
  uaVariant: ResponseCacheUaVariant;
};

type ResponseCachePutOptions = ResponseCacheOptions & {
  ttl: number;
};

const RESPONSE_CACHE_ORIGIN = "https://cache.internal";
const RESPONSE_CACHE_PATH = "/response-cache";

export const getResponseCacheKey = (
  c: Context<Env>,
  namespace: ResponseCacheNamespace,
  uaVariant: ResponseCacheUaVariant,
) => {
  const url = new URL(`${RESPONSE_CACHE_PATH}/${namespace}`, RESPONSE_CACHE_ORIGIN);
  url.searchParams.set("url", c.req.url);
  url.searchParams.set("ua", uaVariant);
  return new Request(url, { method: "GET" });
};

export const matchResponseCache = async (c: Context<Env>, { namespace, uaVariant }: ResponseCacheOptions) => {
  if (c.req.method === "GET") {
    try {
      const cached = await caches.default.match(getResponseCacheKey(c, namespace, uaVariant));
      return cached?.clone() ?? null;
    } catch (error: unknown) {
      console.warn("Response cache read failed", error);
      return null;
    }
  }

  return null;
};

export const putResponseCache = (
  c: Context<Env>,
  response: Response,
  { namespace, uaVariant, ttl }: ResponseCachePutOptions,
) => {
  if (c.req.method === "GET" && response.status === 200) {
    try {
      const cachedResponse = response.clone();
      const headers = new Headers(cachedResponse.headers);
      headers.set("Cache-Control", `public, max-age=${ttl}`);

      const cacheEntry = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });

      c.executionCtx.waitUntil(
        caches.default.put(getResponseCacheKey(c, namespace, uaVariant), cacheEntry).catch((error: unknown) => {
          console.warn("Response cache write failed", error);
        }),
      );
    } catch (error: unknown) {
      console.warn("Response cache write failed", error);
    }
  }
};
