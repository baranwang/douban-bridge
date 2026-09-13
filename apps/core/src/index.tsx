import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { scheduled } from "./cron";
import { contextStorage, rateLimit } from "./libs/middleware";
import { authMiddleware } from "./libs/session";
import { authRoute } from "./routes/auth";
import { catalogRoute } from "./routes/catalog";
import { configureRoute } from "./routes/configure";
import { dashRoute } from "./routes/dash";
import { imageProxyRoute } from "./routes/image-proxy";
import { manifestRoute } from "./routes/manifest";
import { metaRoute } from "./routes/meta";

const app = new Hono();

app.use(logger());
app.use(cors());
app.use(rateLimit);
app.use(contextStorage);
app.use(authMiddleware);

app.get("/", (c) => c.redirect("/configure"));

app.route("/auth", authRoute);

app.route("/manifest.json", manifestRoute);
app.route("/:config/manifest.json", manifestRoute);

app.route("/configure", configureRoute);
app.route("/:config/configure", configureRoute);

app.route("/catalog", catalogRoute);
app.route("/:config/catalog", catalogRoute);

app.route("/meta", metaRoute);
app.route("/:config/meta", metaRoute);

app.route("/image-proxy", imageProxyRoute);

app.route("/dash", dashRoute);

export default {
  fetch: app.fetch,
  scheduled,
};
