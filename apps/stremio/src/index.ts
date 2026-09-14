import { Hono } from "hono";
import { cors } from "hono/cors";
import type { StremioEnv } from "./env";
import { rateLimit } from "./libs/rate-limit";
import { isWebCompatibilityRoute } from "./libs/web-proxy";
import { catalogRoute } from "./routes/catalog";
import { manifestRoute } from "./routes/manifest";
import { metaRoute } from "./routes/meta";

export const app = new Hono<StremioEnv>();

app.use(async (c, next) => {
  if (isWebCompatibilityRoute(c.req.method, new URL(c.req.url).pathname)) {
    return c.env.CORE_WEB.fetch(c.req.raw);
  }
  await next();
});

app.use(cors());
app.use(rateLimit);

app.route("/manifest.json", manifestRoute);
app.route("/:config/manifest.json", manifestRoute);
app.route("/catalog", catalogRoute);
app.route("/:config/catalog", catalogRoute);
app.route("/meta", metaRoute);
app.route("/:config/meta", metaRoute);

export default app;
