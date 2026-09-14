import { isNull } from "drizzle-orm";
import { type Env, Hono } from "hono";
import { AlertTriangle, CheckCircle, Hash, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { tidyUpDetailRoute } from "./detail";

export const tidyUpRoute = new Hono<Env>();

tidyUpRoute.route("/", tidyUpDetailRoute);

tidyUpRoute.get("/", async (c) => {
  const data = await api.db.select().from(doubanMapping).where(isNull(doubanMapping.tmdbId));

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
                ID 映射整理
              </h1>
              <p className="mt-2 text-muted-foreground">以下条目缺少 TMDB ID，需要手动补充</p>
            </div>
            <div className="flex items-center gap-3">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
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
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
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
    </div>,
  );
});
