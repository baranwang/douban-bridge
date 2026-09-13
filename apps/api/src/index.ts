import { type Context, Hono } from "hono";
import { cors } from "hono/cors";

type ApiBindings = {
  CORE_API: Fetcher;
  PUBLIC_RATE_LIMIT: RateLimit;
};

type ApiContext = Context<{ Bindings: ApiBindings }>;

const NO_STORE = { "Cache-Control": "private, no-store" };

export const app = new Hono<{ Bindings: ApiBindings }>();

app.use(
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Authorization", "Accept", "If-None-Match", "User-Agent"],
    credentials: false,
  }),
);

app.use(async (c, next) => {
  const key = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await c.env.PUBLIC_RATE_LIMIT.limit({ key });
  if (!success) {
    return new Response("Rate limit exceeded", { status: 429, headers: NO_STORE });
  }
  await next();
});

async function forward(c: ApiContext, forwardedHeaders: Headers) {
  try {
    const upstream = await c.env.CORE_API.fetch(new Request(c.req.url, { method: "GET", headers: forwardedHeaders }));
    const response = new Response(upstream.body, upstream);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return new Response(null, { status: 503, headers: NO_STORE });
  }
}

async function forwardData(c: ApiContext) {
  const forwardedHeaders = new Headers();
  const authorization = c.req.header("Authorization");
  if (authorization) forwardedHeaders.set("Authorization", authorization);
  const accept = c.req.header("Accept");
  if (accept) forwardedHeaders.set("Accept", accept);
  const userAgent = c.req.header("User-Agent");
  if (userAgent) forwardedHeaders.set("User-Agent", userAgent);
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) forwardedHeaders.set("CF-Connecting-IP", ip);
  return forward(c, forwardedHeaders);
}

async function forwardImage(c: ApiContext) {
  const forwardedHeaders = new Headers();
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch) forwardedHeaders.set("If-None-Match", ifNoneMatch);
  const accept = c.req.header("Accept");
  if (accept) forwardedHeaders.set("Accept", accept);
  return forward(c, forwardedHeaders);
}

app.get("/v1/catalog/:collectionId", forwardData);
app.get("/v1/meta/:doubanId", forwardData);
app.get("/image-proxy/:userId", forwardImage);

app.all("/v1/catalog/:collectionId", () => new Response(null, { status: 405, headers: NO_STORE }));
app.all("/v1/meta/:doubanId", () => new Response(null, { status: 405, headers: NO_STORE }));
app.all("/image-proxy/:userId", () => new Response(null, { status: 405, headers: NO_STORE }));

app.notFound(() => new Response(null, { status: 404, headers: NO_STORE }));

export default app;
