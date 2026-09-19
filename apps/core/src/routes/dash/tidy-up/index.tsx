import { Badge } from "@douban-bridge/ui/components/badge";
import { Button } from "@douban-bridge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@douban-bridge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@douban-bridge/ui/components/table";
import { and, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { AlertTriangle, CheckCircle, Hash, Pencil } from "lucide-react";
import { doubanMapping } from "@/db";
import { parseAgent } from "@/libs/agent-match/blob";
import { claimAgentJobs, parseEnqueueIds } from "@/libs/agent-match/pool";
import { api } from "@/libs/api";
import { getContext } from "@/libs/middleware";
import { tidyUpDetailRoute } from "./detail";

export const tidyUpRoute = new Hono<Env>();

export type TidyUpView = "unmatched" | "suggested" | "auto" | "no_match";

export function tidyUpListFilter<
  T extends { agent?: string | null; calibrated?: boolean | null; tmdbId?: number | null },
>(rows: T[], view: TidyUpView): T[] {
  if (view === "unmatched")
    return rows.filter((row) => {
      const status = parseAgent(row.agent)?.status;
      return row.tmdbId == null && status !== "suggested" && status !== "no_match";
    });
  if (view === "suggested")
    return rows.filter((row) => parseAgent(row.agent)?.status === "suggested" && row.tmdbId == null);
  if (view === "auto")
    return rows.filter((row) => {
      const blob = parseAgent(row.agent);
      return (
        row.tmdbId != null &&
        row.calibrated !== true &&
        blob != null &&
        blob.status == null &&
        blob.tmdbId === row.tmdbId
      );
    });
  return rows.filter((row) => parseAgent(row.agent)?.status === "no_match");
}

const VIEW_COPY: Record<TidyUpView, { title: string; description: string }> = {
  unmatched: { title: "未匹配", description: "还没有 TMDB ID，等 Agent 抽到或人工补上" },
  suggested: { title: "待确认建议", description: "Agent 给出了建议，尚未写入正式 TMDB ID" },
  auto: { title: "Agent 已写未校准", description: "Agent 已直写正式 ID，仍可人工确认或驳回" },
  no_match: { title: "无匹配", description: "Agent 未能给出可用匹配" },
};

export async function enqueueSelectedAgentJobs(
  doubanIds: readonly number[],
  queue: { send: (job: { doubanId: number; agentToken: string }) => Promise<unknown> } | undefined,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
): Promise<number> {
  const jobs = await claimAgentJobs(parseEnqueueIds(doubanIds.map(String)).length, Date.now(), doubanIds);
  await Promise.all(
    jobs.map((job) => {
      const sent = queue?.send(job) ?? Promise.resolve();
      ctx.waitUntil(sent);
      return sent;
    }),
  );
  return jobs.length;
}

tidyUpRoute.post("/enqueue", async (c) => {
  const form = await c.req.formData();
  const ids = parseEnqueueIds(form.getAll("doubanId"));
  const view = form.get("view") === "suggested" ? "suggested" : "unmatched";
  const { env, ctx } = getContext();
  await enqueueSelectedAgentJobs(ids, env.AGENT_MATCH_QUEUE, ctx);
  return c.redirect(`/dash/tidy-up?view=${view}`);
});

tidyUpRoute.route("/", tidyUpDetailRoute);

tidyUpRoute.get("/", async (c) => {
  const viewParam = c.req.query("view");
  const view: TidyUpView =
    viewParam === "unmatched" || viewParam === "auto" || viewParam === "no_match" || viewParam === "suggested"
      ? viewParam
      : "suggested";
  const viewWhere =
    view === "unmatched"
      ? and(
          isNull(doubanMapping.tmdbId),
          sql`coalesce(json_extract(${doubanMapping.agent}, '$.status'), '') NOT IN ('suggested', 'no_match')`,
        )
      : view === "suggested"
        ? and(isNull(doubanMapping.tmdbId), sql`json_extract(${doubanMapping.agent}, '$.status') = 'suggested'`)
        : view === "auto"
          ? and(
              isNotNull(doubanMapping.tmdbId),
              or(ne(doubanMapping.calibrated, true), isNull(doubanMapping.calibrated)),
              sql`json_extract(${doubanMapping.agent}, '$.status') IS NULL`,
              sql`json_extract(${doubanMapping.agent}, '$.tmdbId') = ${doubanMapping.tmdbId}`,
            )
          : sql`json_extract(${doubanMapping.agent}, '$.status') = 'no_match'`;
  const data = await api.db.select().from(doubanMapping).where(viewWhere);

  const withImdbCount = data.filter((item) => item.imdbId).length;
  const withTraktCount = data.filter((item) => item.traktId).length;

  return c.render(
    <div className="min-h-screen bg-linear-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="bg-linear-to-r from-emerald-600 to-teal-600 bg-clip-text font-bold text-3xl text-transparent tracking-tight">
                {VIEW_COPY[view].title}
              </h1>
              <p className="mt-2 text-muted-foreground">{VIEW_COPY[view].description}</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/dash/tidy-up?view=unmatched">
                <Button variant={view === "unmatched" ? "default" : "outline"} size="sm">
                  未匹配
                </Button>
              </a>
              <a href="/dash/tidy-up?view=suggested">
                <Button variant={view === "suggested" ? "default" : "outline"} size="sm">
                  待确认建议
                </Button>
              </a>
              <a href="/dash/tidy-up?view=auto">
                <Button variant={view === "auto" ? "default" : "outline"} size="sm">
                  Agent 已写未校准
                </Button>
              </a>
              <a href="/dash/tidy-up?view=no_match">
                <Button variant={view === "no_match" ? "default" : "outline"} size="sm">
                  无匹配
                </Button>
              </a>
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                {data.length} 条待处理
              </Badge>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">缺少 TMDB ID</p>
                <p className="font-bold text-2xl">{data.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">有 IMDb ID</p>
                <p className="font-bold text-2xl">{withImdbCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Hash className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">有 Trakt ID</p>
                <p className="font-bold text-2xl">{withTraktCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        {data.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>待处理列表</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="post" action="/dash/tidy-up/enqueue" id="enqueue-form">
                {view === "unmatched" || view === "suggested" ? (
                  <div className="mb-4 flex items-center justify-end">
                    <input type="hidden" name="view" value={view} />
                    <Button type="submit" size="sm">
                      加入队列
                    </Button>
                  </div>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      {view === "unmatched" || view === "suggested" ? (
                        <TableHead className="w-10">
                          <input type="checkbox" data-select-all form="enqueue-form" aria-label="全选" />
                        </TableHead>
                      ) : (
                        <TableHead className="w-16">#</TableHead>
                      )}
                      <TableHead>豆瓣 ID</TableHead>
                      <TableHead>IMDb ID</TableHead>
                      <TableHead>TMDB ID</TableHead>
                      <TableHead>Trakt ID</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>更新时间</TableHead>
                      <TableHead className="w-32 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((item, index) => (
                      <TableRow key={item.doubanId}>
                        {view === "unmatched" || view === "suggested" ? (
                          <TableCell>
                            <input
                              type="checkbox"
                              name="doubanId"
                              value={String(item.doubanId)}
                              form="enqueue-form"
                              data-row-select
                              disabled={Boolean(parseAgent(item.agent)?.token)}
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                        )}
                        <TableCell>
                          <a
                            href={`https://movie.douban.com/subject/${item.doubanId}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            {item.doubanId}
                          </a>
                        </TableCell>
                        <TableCell>
                          {item.imdbId ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            >
                              {item.imdbId}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.tmdbId ? (
                            <Badge
                              variant="outline"
                              className="border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            >
                              {item.tmdbId}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">缺失</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.traktId ? (
                            <Badge variant="secondary">{item.traktId}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.createdAt?.toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.updatedAt?.toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <a href={`/dash/tidy-up/${item.doubanId}`}>
                            <Button variant="outline" size="sm">
                              <Pencil className="mr-1.5 h-4 w-4" />
                              编辑
                            </Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle className="mb-4 h-16 w-16 text-emerald-500" />
              <h3 className="font-semibold text-xl">全部完成！</h3>
              <p className="mt-2 text-muted-foreground">暂无需要整理的 ID 映射</p>
            </CardContent>
          </Card>
        )}
      </div>
      {view === "unmatched" || view === "suggested" ? (
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: checkbox select-all for unmatched enqueue
          dangerouslySetInnerHTML={{
            __html: `
              const form = document.getElementById('enqueue-form');
              const selectAll = form?.querySelector('[data-select-all]');
              const boxes = () => Array.from(form?.querySelectorAll('[data-row-select]:not(:disabled)') ?? []);
              selectAll?.addEventListener('change', function() {
                boxes().forEach((box) => { box.checked = selectAll.checked; });
              });
            `,
          }}
        />
      ) : null}
    </div>,
  );
});
