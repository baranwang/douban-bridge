import { Button } from "@douban-bridge/ui/components/button";
import { desc, eq } from "drizzle-orm";
import { type Context, type Env, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { Script } from "vite-ssr-components/react";
import { z } from "zod/v4";
import { FeedbackForm, type FeedbackSearchItem } from "@/components/feedback-form";
import { MappingFeedbackList } from "@/components/mapping-feedback-list";
import { PageShell } from "@/components/page-shell";
import { mappingFeedback } from "@/db";
import { AGENT_AUTO_WRITE_MIN_CONFIDENCE } from "@/libs/agent-match/constants";
import { mappingFeedbackSchema, submitMappingFeedback } from "@/libs/agent-match/feedback";
import { api } from "@/libs/api";
import { TmdbAPI } from "@/libs/api/tmdb";
import { fetchDoubanImage, isAllowedDoubanImageUrl } from "@/libs/douban-image";
import { requireWebSession } from "@/libs/require-web-session";
import { webRenderer } from "./web-renderer";

export const feedbackRoute = new Hono<Env>();

feedbackRoute.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});
feedbackRoute.use("*", webRenderer);
feedbackRoute.use("*", bodyLimit({ maxSize: 32 * 1024 }));

async function renderFeedback(
  c: Context<Env>,
  error?: string,
  values: { douban?: string; tmdb?: string; reason?: string } = {},
) {
  const user = c.get("user");
  const rows = user
    ? await api.db.query.mappingFeedback.findMany({
        where: eq(mappingFeedback.userId, user.id),
        orderBy: desc(mappingFeedback.createdAt),
        limit: 20,
      })
    : [];
  return c.render(
    <>
      <title>映射反馈 · Douban Bridge</title>
      <PageShell
        title="映射反馈"
        description="提供正确的 TMDB 条目，由 Agent 独立核对作品信息"
        actions={
          <Button variant="ghost" size="sm" render={<a href="/" />}>
            返回首页
          </Button>
        }
      >
        <div className="mt-8 space-y-4">
          <p className="text-pretty text-muted-foreground text-sm">
            提交后保留原映射。Agent 置信度达到 {AGENT_AUTO_WRITE_MIN_CONFIDENCE * 100}%
            且认可你的建议时会自动更新，其他情况保留评审结论供人工判断。
          </p>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {c.req.query("submitted") === "1" && !error ? (
            <p role="status" className="text-sm">
              反馈已提交并进入评审队列。稍后刷新页面可查看结论。
            </p>
          ) : null}
          {user ? (
            <>
              <Script src="/src/client/feedback.tsx" />
              <script
                id="__FEEDBACK_FORM__"
                type="application/json"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: initialize the user's own form values
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({ ...values, douban: values.douban ?? c.req.query("douban") ?? "" }).replace(
                    /</g,
                    "\\u003c",
                  ),
                }}
              />
              <div id="feedback-form">
                <FeedbackForm {...values} douban={values.douban ?? c.req.query("douban") ?? ""} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">登录 GitHub 后即可提交反馈并查看评审结果，无需 Star。</p>
              <Button render={<a href="/auth/github" />}>GitHub 登录</Button>
            </div>
          )}
        </div>
        {user ? <MappingFeedbackList rows={rows} /> : null}
      </PageShell>
    </>,
  );
}

feedbackRoute.onError(async (error, c) => {
  if (c.req.path === "/feedback/search" || c.req.path === "/feedback/image") {
    const status = error instanceof HTTPException ? error.status : 502;
    const message =
      status === 401
        ? "登录已过期，请重新登录"
        : status === 429
          ? "搜索过于频繁，请稍后重试"
          : status === 400
            ? "请检查搜索关键词和作品类型"
            : "搜索服务暂不可用，请稍后重试或粘贴链接";
    return c.json({ error: message }, status);
  }
  if (error instanceof HTTPException) {
    c.status(error.status);
    const message =
      error.status === 401
        ? "请先登录后再提交反馈"
        : error.status === 403
          ? "请求来源无效，请回到本站重新提交"
          : error.message;
    return renderFeedback(c, message);
  }
  console.error("mapping-feedback route failed", error);
  c.status(500);
  return renderFeedback(c, "反馈服务暂不可用，请稍后重试");
});

feedbackRoute.get("/", (c) => renderFeedback(c));

const searchQuerySchema = z.strictObject({
  source: z.enum(["douban", "tmdb"]),
  q: z.string().trim().min(1).max(100),
  type: z.enum(["movie", "tv"]).optional(),
});

feedbackRoute.get("/search", async (c) => {
  const user = requireWebSession(c);
  const query = searchQuerySchema.safeParse(c.req.query());
  if (!query.success) throw new HTTPException(400);
  const { success } = await c.env.USER_RATE_LIMIT.limit({ key: `mapping-feedback:search:${user.id}` });
  if (!success) throw new HTTPException(429);
  const { source, q, type = "movie" } = query.data;
  let items: FeedbackSearchItem[];
  if (source === "douban") {
    const results = await api.doubanAPI.search(q);
    items = results.slice(0, 12).map((item) => ({
      value: String(item.id),
      type: item.type,
      title: item.title,
      originalTitle: item.original_title,
      year: item.year,
      subtitle: item.card_subtitle,
      poster:
        item.cover && isAllowedDoubanImageUrl(item.cover)
          ? `/feedback/image?url=${encodeURIComponent(item.cover)}`
          : null,
    }));
  } else {
    const results = await new TmdbAPI().search(type, { query: q, language: "zh-CN" });
    items = results.results.slice(0, 12).map((item) => ({
      value: `https://www.themoviedb.org/${type}/${item.id}`,
      type,
      title: item.title ?? item.original_title ?? "未命名作品",
      originalTitle: item.original_title,
      year: (item.release_date || item.first_air_date)?.slice(0, 4),
      poster: item.poster_path,
    }));
  }
  return c.json({ items });
});

feedbackRoute.get("/image", async (c) => {
  const user = requireWebSession(c);
  const url = c.req.query("url");
  if (!url || url.length > 2048 || !isAllowedDoubanImageUrl(url)) throw new HTTPException(400);
  const { success } = await c.env.USER_RATE_LIMIT.limit({ key: `mapping-feedback:image:${user.id}` });
  if (!success) throw new HTTPException(429);
  return fetchDoubanImage(url);
});

feedbackRoute.post("/", async (c) => {
  const user = requireWebSession(c);
  const { success } = await c.env.USER_RATE_LIMIT.limit({ key: `mapping-feedback:${user.id}` });
  if (!success) throw new HTTPException(429, { message: "提交过于频繁，请稍后重试" });
  const form = await c.req.formData();
  const values = {
    douban: String(form.get("douban") ?? ""),
    tmdb: String(form.get("tmdb") ?? ""),
    reason: String(form.get("reason") ?? ""),
  };
  const parsed = mappingFeedbackSchema.safeParse(values);
  if (!parsed.success) {
    c.status(400);
    return renderFeedback(c, parsed.error.issues[0]?.message ?? "请检查反馈内容", values);
  }
  try {
    await submitMappingFeedback(user.id, parsed.data);
  } catch (error) {
    if (!(error instanceof HTTPException)) throw error;
    c.status(error.status);
    return renderFeedback(c, error.message, values);
  }
  return c.redirect("/feedback?submitted=1", 303);
});
