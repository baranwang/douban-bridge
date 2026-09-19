import { Badge } from "@douban-bridge/ui/components/badge";
import { Button } from "@douban-bridge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@douban-bridge/ui/components/card";
import { Input } from "@douban-bridge/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@douban-bridge/ui/components/table";
import axios from "axios";
import { eq } from "drizzle-orm";
import { uniqBy } from "es-toolkit";
import { type Env, Hono } from "hono";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { z } from "zod/v4";
import { doubanMapping, doubanMappingSchema } from "@/db";
import { parseAgent, serializeAgent } from "@/libs/agent-match/blob";
import { api } from "@/libs/api";
import { TmdbAPI } from "@/libs/api/tmdb";
import { dashDoubanImageSrc } from "@/libs/douban-image";

export const tidyUpDetailRoute = new Hono<Env>();

// POST: 保存编辑
tidyUpDetailRoute.post("/:doubanId", async (c) => {
  const doubanId = c.req.param("doubanId");
  if (!doubanId) {
    return c.notFound();
  }

  const form = await c.req.formData();
  const numericId = Number.parseInt(doubanId, 10);
  const existing = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, numericId) });
  if (!existing) return c.notFound();

  const intent = String(form.get("intent") ?? "save");
  const blob = parseAgent(existing.agent);

  if (intent === "confirm") {
    const tmdbId = existing.tmdbId ?? blob?.tmdbId ?? null;
    if (tmdbId == null) return c.json({ error: "missing_candidate" }, 400);
    await api.db
      .update(doubanMapping)
      .set({
        tmdbId,
        imdbId: existing.tmdbId != null ? (existing.imdbId ?? null) : (blob?.imdbId ?? existing.imdbId ?? null),
        traktId: existing.tmdbId != null ? (existing.traktId ?? null) : (blob?.traktId ?? existing.traktId ?? null),
        calibrated: true,
        agent: null,
      })
      .where(eq(doubanMapping.doubanId, numericId));
    return c.redirect("/dash/tidy-up");
  }

  if (intent === "reject") {
    const wroteOfficial =
      existing.tmdbId != null && blob?.tmdbId != null && existing.tmdbId === blob.tmdbId && blob.status !== "suggested";
    await api.db
      .update(doubanMapping)
      .set({
        tmdbId: wroteOfficial ? null : existing.tmdbId,
        imdbId: wroteOfficial ? null : existing.imdbId,
        traktId: wroteOfficial ? null : existing.traktId,
        agent: serializeAgent({
          status: "no_match",
          confidence: blob?.confidence,
          reason: blob?.reason,
          candidateId: blob?.candidateId,
          tmdbId: blob?.tmdbId ?? null,
          imdbId: blob?.imdbId ?? null,
          traktId: blob?.traktId ?? null,
        }),
      })
      .where(eq(doubanMapping.doubanId, numericId));
    return c.redirect("/dash/tidy-up?view=no_match");
  }

  const emptyToNull = (value: FormDataEntryValue | null) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text === "" ? null : text;
  };
  const optionalPositiveInt = z.union([
    z.null(),
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform((value) => Number(value)),
  ]);
  const tmdbParsed = optionalPositiveInt.safeParse(emptyToNull(form.get("tmdbId")));
  const traktParsed = optionalPositiveInt.safeParse(emptyToNull(form.get("traktId")));
  if (!tmdbParsed.success || !traktParsed.success) {
    return c.json({ error: "invalid_id" }, 400);
  }
  const result = doubanMappingSchema.safeParse({
    doubanId,
    tmdbId: tmdbParsed.data,
    imdbId: emptyToNull(form.get("imdbId")),
    traktId: traktParsed.data,
    calibrated: form.get("calibrated") === "on",
  });

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const { tmdbId, imdbId, traktId, calibrated } = result.data;
  await api.db
    .update(doubanMapping)
    .set({
      tmdbId: tmdbId ?? null,
      imdbId: imdbId ?? null,
      traktId: traktId ?? null,
      calibrated,
      agent: null,
    })
    .where(eq(doubanMapping.doubanId, numericId));

  return c.redirect("/dash/tidy-up");
});

// GET: 显示编辑页面
tidyUpDetailRoute.get("/:doubanId", async (c) => {
  const doubanId = c.req.param("doubanId");
  if (!doubanId) {
    return c.notFound();
  }

  const numericId = Number.parseInt(doubanId, 10);
  let doubanMissing = false;
  const [subject, idMapping] = await Promise.all([
    api.doubanAPI.getSubjectDetail(doubanId).catch((error) => {
      doubanMissing = axios.isAxiosError(error) && error.response?.status === 404;
      return null;
    }),
    api.db
      .select()
      .from(doubanMapping)
      .where(eq(doubanMapping.doubanId, numericId))
      .then((r) => r[0]),
  ]);
  if (!idMapping || idMapping.deletedAt) return c.notFound();
  if (doubanMissing) {
    await api.db.update(doubanMapping).set({ deletedAt: new Date() }).where(eq(doubanMapping.doubanId, numericId));
    return c.notFound();
  }
  const type = subject?.type ?? "movie";
  const title = subject?.title ?? String(doubanId);
  const originalTitle = subject?.original_title ?? null;

  const tmdbAPI = new TmdbAPI(c.env.TMDB_API_KEY);
  const tmdbResults = await tmdbAPI
    .search(type, {
      query: originalTitle || title,
      // year: subject?.year ?? undefined,
    })
    .catch(() => null);

  const doubanCoverUrl = subject?.cover_url || subject?.pic?.large || subject?.pic?.normal || "";
  const doubanCoverSrc = doubanCoverUrl ? dashDoubanImageSrc(doubanCoverUrl) : "";

  let traktResults = await api.traktAPI.search(type === "tv" ? "show" : "movie", title).catch(() => []);

  if (tmdbResults?.results?.length === 1) {
    const resp = await api.traktAPI.searchByTmdbId(tmdbResults.results[0].id.toString()).catch(() => []);
    traktResults.push(...resp);
  }

  if (idMapping.tmdbId) {
    const resp = await api.traktAPI.searchByTmdbId(idMapping.tmdbId.toString()).catch(() => []);
    traktResults.push(...resp);
  }

  if (idMapping.imdbId) {
    const resp = await tmdbAPI.findById(idMapping.imdbId, "imdb_id").catch(() => null);
    if (type === "movie" && resp?.movie_results.length) {
      tmdbResults?.results.push(...resp.movie_results);
    }
    if (type === "tv" && resp?.tv_results.length) {
      tmdbResults?.results.push(...resp.tv_results);
    }
    if (type === "tv" && resp?.tv_episode_results.length) {
      tmdbResults?.results.push(...resp.tv_episode_results);
    }
    const traktSearchResp = await api.traktAPI.searchByImdbId(idMapping.imdbId).catch(() => []);
    traktResults.push(...traktSearchResp);
  }

  traktResults = uniqBy(traktResults, (item) => api.traktAPI.getSearchResultField(item, "ids")?.trakt);

  if (tmdbResults?.results?.length) {
    tmdbResults.results = uniqBy(tmdbResults.results, (item) => item.id);
    try {
      tmdbResults.results = await Promise.all(
        tmdbResults.results.map(async (item) => {
          const resp = await tmdbAPI.getExternalId(type, item.id);
          return {
            ...item,
            imdb_id: resp.imdb_id,
          };
        }),
      );
    } catch {}
  }

  return c.render(
    <div className="min-h-screen bg-linear-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button & Header */}
        <div className="mb-8">
          <a
            href="/dash/tidy-up"
            className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </a>
          <h1 className="mt-2 bg-linear-to-r from-emerald-600 to-teal-600 bg-clip-text font-bold text-3xl text-transparent tracking-tight">
            编辑 ID 映射
          </h1>
          <p className="mt-2 text-muted-foreground">豆瓣 ID: {doubanId}</p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column - Douban Info */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>豆瓣信息</CardTitle>
                <CardDescription>来自豆瓣的条目详情</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  className="flex flex-col items-center"
                  href={`https://movie.douban.com/subject/${doubanId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {doubanCoverUrl && (
                    <div className="mb-4 overflow-hidden rounded-lg shadow-lg">
                      <img
                        src={doubanCoverSrc}
                        alt={title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-72 w-48 object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>
                  )}
                  <h3 className="text-center font-bold text-xl">{title}</h3>
                  {originalTitle && originalTitle !== title && (
                    <p className="mt-1 text-center text-muted-foreground text-sm">{originalTitle}</p>
                  )}
                </a>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground text-sm">类型</span>
                    <Badge variant={type === "tv" ? "default" : "secondary"}>
                      {type === "tv" ? "剧集" : "电影"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground text-sm">年份</span>
                    <span className="font-medium">{subject?.year || "-"}</span>
                  </div>
                  {subject?.countries && subject?.countries.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-muted-foreground text-sm">国家/地区</span>
                      <span className="font-medium">{subject?.countries.join(" / ")}</span>
                    </div>
                  )}
                  {subject?.languages && subject?.languages.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-muted-foreground text-sm">语言</span>
                      <span className="font-medium">{subject?.languages.join(" / ")}</span>
                    </div>
                  )}
                  {subject?.directors && subject?.directors.length > 0 && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-muted-foreground text-sm">导演</span>
                      <p className="mt-1 font-medium text-sm">{subject?.directors.map((d) => d.name).join(" / ")}</p>
                    </div>
                  )}
                  {subject?.actors && subject?.actors.length > 0 && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-muted-foreground text-sm">演员</span>
                      <p className="mt-1 font-medium text-sm">
                        {subject?.actors
                          .slice(0, 5)
                          .map((a) => a.name)
                          .join(" / ")}
                        {subject?.actors.length > 5 && " ..."}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Search Results & Form */}
          <div className="space-y-6 lg:col-span-2">
            {/* Trakt Search Results */}
            <Card>
              <CardHeader>
                <CardTitle>Trakt 搜索结果</CardTitle>
                <CardDescription>根据标题搜索的 Trakt 匹配结果，点击行可快速填充</CardDescription>
              </CardHeader>
              <CardContent>
                {traktResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>标题</TableHead>
                        <TableHead>年份</TableHead>
                        <TableHead>Trakt ID</TableHead>
                        <TableHead>IMDb ID</TableHead>
                        <TableHead>TMDB ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {traktResults.map((result) => {
                        const ids = api.traktAPI.getSearchResultField(result, "ids");
                        return (
                          <TableRow
                            key={ids?.trakt}
                            className="cursor-pointer"
                            data-fill-row
                            data-tmdb={ids?.tmdb || ""}
                            data-imdb={ids?.imdb || ""}
                            data-trakt={ids?.trakt || ""}
                          >
                            <TableCell>
                              <div>
                                <span className="font-medium">
                                  {api.traktAPI.getSearchResultField(result, "title")}
                                </span>
                                {api.traktAPI.getSearchResultField(result, "original_title") &&
                                  api.traktAPI.getSearchResultField(result, "original_title") !==
                                    api.traktAPI.getSearchResultField(result, "title") && (
                                    <span className="ml-2 text-muted-foreground text-xs">
                                      ({api.traktAPI.getSearchResultField(result, "original_title")})
                                    </span>
                                  )}
                              </div>
                            </TableCell>
                            <TableCell>{api.traktAPI.getSearchResultField(result, "year") || "-"}</TableCell>
                            <TableCell>
                              {ids?.trakt ? (
                                <span className="font-mono text-xs">{ids.trakt}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {ids?.imdb ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
                                >
                                  {ids.imdb}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {ids?.tmdb ? (
                                <a
                                  href={`https://www.themoviedb.org/${type}/${ids.tmdb}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-no-fill
                                >
                                  <Badge variant="outline" className="border-blue-500/50 bg-blue-500/10 text-blue-600">
                                    {ids.tmdb}
                                  </Badge>
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Search className="mb-3 h-12 w-12 text-muted-foreground/30" />
                    <p className="text-muted-foreground">未找到 Trakt 匹配结果</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* TMDB Search Results */}
            <Card>
              <CardHeader>
                <CardTitle>TMDB 搜索结果</CardTitle>
                <CardDescription>根据标题搜索的 TMDB 匹配结果，点击行可快速填充</CardDescription>
              </CardHeader>
              <CardContent>
                {(tmdbResults?.results?.length ?? 0) > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>TMDB ID</TableHead>
                        <TableHead>封面</TableHead>
                        <TableHead>标题</TableHead>
                        <TableHead>IMDB ID</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tmdbResults?.results.map((result) => (
                        <TableRow
                          key={result.id}
                          className="cursor-pointer"
                          data-fill-row
                          data-tmdb={result.id}
                          data-imdb={(result as any).imdb_id}
                          data-trakt=""
                        >
                          <TableCell>
                            <span className="font-mono text-sm">{result.id}</span>
                          </TableCell>
                          <TableCell>
                            {result.poster_path ? (
                              <img
                                src={result.poster_path}
                                alt={result.title ?? ""}
                                className="h-20 w-14 rounded object-cover"
                              />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{result.title}</span>
                            {result.title !== result.original_title && result.original_title && (
                              <span className="ml-2 text-muted-foreground text-xs">({result.original_title})</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {"imdb_id" in result ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
                              >
                                {(result as any).imdb_id}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <a
                              href={`https://www.themoviedb.org/${type}/${result.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-no-fill
                              className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                              查看详情
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Search className="mb-3 h-12 w-12 text-muted-foreground/30" />
                    <p className="text-muted-foreground">未找到 TMDB 匹配结果</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit Form */}
            <Card>
              <form method="post">
                <CardHeader>
                  <CardTitle>ID 映射</CardTitle>
                  <CardDescription>编辑此条目的外部 ID 映射关系</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="tmdbId" className="font-medium text-sm">
                      TMDB ID
                    </label>
                    <Input
                      id="tmdbId"
                      name="tmdbId"
                      type="number"
                      defaultValue={idMapping?.tmdbId ?? parseAgent(idMapping?.agent)?.tmdbId ?? ""}
                      placeholder="请输入 TMDB ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="imdbId" className="font-medium text-sm">
                      IMDb ID
                    </label>
                    <Input
                      id="imdbId"
                      name="imdbId"
                      type="text"
                      defaultValue={idMapping?.imdbId ?? parseAgent(idMapping?.agent)?.imdbId ?? ""}
                      placeholder="请输入 IMDb ID (如 tt1234567)"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="traktId" className="font-medium text-sm">
                      Trakt ID
                    </label>
                    <Input
                      id="traktId"
                      name="traktId"
                      type="number"
                      defaultValue={idMapping?.traktId ?? parseAgent(idMapping?.agent)?.traktId ?? ""}
                      placeholder="请输入 Trakt ID"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="calibrated"
                      name="calibrated"
                      type="checkbox"
                      defaultChecked={idMapping?.calibrated ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="calibrated" className="text-muted-foreground text-sm">
                      已校准（已校准的记录不会被自动覆盖）
                    </label>
                  </div>
                </CardContent>
                {idMapping?.agent ? (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p>Agent 置信度：{parseAgent(idMapping.agent)?.confidence ?? "-"}</p>
                    <p>原因：{parseAgent(idMapping.agent)?.reason ?? "-"}</p>
                    <p>建议 TMDB：{parseAgent(idMapping.agent)?.tmdbId ?? "-"}</p>
                    <p>建议 IMDb：{parseAgent(idMapping.agent)?.imdbId ?? "-"}</p>
                    <p>建议 Trakt：{parseAgent(idMapping.agent)?.traktId ?? "-"}</p>
                  </div>
                ) : null}
                <CardFooter className="justify-end gap-3">
                  <a href="/dash/tidy-up">
                    <Button type="button" variant="ghost">
                      取消
                    </Button>
                  </a>
                  <Button type="submit" name="intent" value="reject" variant="outline">
                    <X className="h-4 w-4" />
                    驳回
                  </Button>
                  <Button type="submit" name="intent" value="confirm" variant="secondary">
                    确认
                  </Button>
                  <Button type="submit" name="intent" value="save">
                    <Check className="h-4 w-4" />
                    保存
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        </div>
      </div>

      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Script for handling row clicks
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelectorAll('[data-fill-row]').forEach(function(row) {
              row.addEventListener('click', function(e) {
                if (e.target.closest('[data-no-fill]')) return;
                document.getElementById('tmdbId').value = this.dataset.tmdb || '';
                document.getElementById('imdbId').value = this.dataset.imdb || '';
                document.getElementById('traktId').value = this.dataset.trakt || '';
              });
            });
          `,
        }}
      />
    </div>,
  );
});
