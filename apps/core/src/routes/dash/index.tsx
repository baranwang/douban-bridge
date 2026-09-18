import { reactRenderer } from "@hono/react-renderer";
import { zValidator } from "@hono/zod-validator";
import { type Env, Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Link, ViteClient } from "vite-ssr-components/react";
import { z } from "zod/v4";
import { fetchDoubanImage } from "@/libs/douban-image";
import { tidyUpRoute } from "./tidy-up";

export const dashRoute = new Hono<Env>({ strict: false });

dashRoute.use(
  "*",
  basicAuth({
    verifyUser: async (username, password, c) => {
      const [dashUser, dashPass] = await Promise.all([
        c.env.KV.get("DASH_USER", "text"),
        c.env.KV.get("DASH_PASS", "text"),
      ]);
      if (!dashUser || !dashPass) {
        return true;
      }
      if (dashUser !== username || dashPass !== password) {
        return false;
      }
      return true;
    },
  }),
);

dashRoute.get("/image-proxy", zValidator("query", z.object({ url: z.url() })), async (c) => {
  const { url } = c.req.valid("query");
  if (c.req.header("If-None-Match") === url) {
    return c.body(null, 304);
  }
  return fetchDoubanImage(url);
});

dashRoute.use(
  "*",
  reactRenderer(({ children }) => {
    return (
      <html lang="zh">
        <head>
          <ViteClient />
          <Link rel="stylesheet" href="/src/style.css" />

          <title>Dashboard</title>
        </head>
        <body>{children}</body>
      </html>
    );
  }),
);

dashRoute.route("/tidy-up", tidyUpRoute);
