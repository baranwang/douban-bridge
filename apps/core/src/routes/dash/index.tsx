import { reactRenderer } from "@hono/react-renderer";
import { zValidator } from "@hono/zod-validator";
import { desc } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Link, ViteClient } from "vite-ssr-components/react";
import { z } from "zod/v4";
import { MappingFeedbackList } from "@/components/mapping-feedback-list";
import { mappingFeedback } from "@/db";
import { api } from "@/libs/api";
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
dashRoute.get("/feedback", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const rows = await api.db.query.mappingFeedback.findMany({
    orderBy: desc(mappingFeedback.createdAt),
    limit: 100,
  });
  return c.render(
    <main className="page-container px-4 py-8">
      <a href="/dash/tidy-up" className="text-sm underline underline-offset-4">
        返回映射管理
      </a>
      <MappingFeedbackList rows={rows} admin />
    </main>,
  );
});
