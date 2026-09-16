import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { contextStorage, imageRateLimit } from "./libs/middleware";
import { authMiddleware } from "./libs/session";
import { apiKeysRoute } from "./routes/api-keys";
import { authRoute } from "./routes/auth";
import { configureRoute } from "./routes/configure";
import { dashRoute } from "./routes/dash";
import { imageProxyRoute } from "./routes/image-proxy";
import { internalApi } from "./routes/internal-api";
import { portalRoute } from "./routes/portal";
import { rexRoute } from "./routes/rex";

export const app = new Hono();

app.use(logger());
app.use(cors());
app.use(contextStorage);
app.use(async (c, next) => {
  if (new URL(c.req.url).pathname.startsWith("/v1/")) return next();
  return authMiddleware(c, next);
});
app.route("/", internalApi);
app.route("/", portalRoute);

app.route("/api-keys", apiKeysRoute);
app.route("/auth", authRoute);
app.route("/rex", rexRoute);

app.route("/configure", configureRoute);
app.route("/:config/configure", configureRoute);

app.use("/image-proxy/*", imageRateLimit);
app.route("/image-proxy", imageProxyRoute);

app.route("/dash", dashRoute);

app.get("/icon.png", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/assets/*", (c) => {
  const pathname = new URL(c.req.url).pathname;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return c.notFound();
  }
  if (decoded.includes("..") || decoded.includes("\\")) return c.notFound();
  return c.env.ASSETS.fetch(c.req.raw);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.notFound((c) => c.body(null, 404));
