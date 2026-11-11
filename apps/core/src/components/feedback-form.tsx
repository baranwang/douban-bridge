import { Button } from "@douban-bridge/ui/components/button";
import { Input } from "@douban-bridge/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@douban-bridge/ui/components/native-select";
import { Textarea } from "@douban-bridge/ui/components/textarea";
import { useCallback, useEffect, useRef, useState } from "react";

export interface FeedbackSearchItem {
  value: string;
  type: "movie" | "tv";
  title: string;
  originalTitle?: string | null;
  year?: string | null;
  subtitle?: string | null;
  poster?: string | null;
}

export interface FeedbackFormProps {
  douban?: string;
  tmdb?: string;
  reason?: string;
}

function SubjectPicker({
  source,
  selected,
  onSelect,
  initialQuery = "",
  initialType = "movie",
}: {
  source: "douban" | "tmdb";
  selected: FeedbackSearchItem | null;
  onSelect: (item: FeedbackSearchItem | null) => void;
  initialQuery?: string;
  initialType?: "movie" | "tv";
}) {
  const label = source === "douban" ? "豆瓣条目" : "正确的 TMDB 条目";
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [items, setItems] = useState<FeedbackSearchItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const search = useCallback(
    async (keyword: string, mediaType: "movie" | "tv") => {
      const trimmed = keyword.trim();
      if (!trimmed) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setStatus("loading");
      setError("");
      setItems([]);
      try {
        const params = new URLSearchParams({ source, q: trimmed });
        if (source === "tmdb") params.set("type", mediaType);
        const response = await fetch(`/feedback/search?${params}`, { signal: controller.signal });
        const body = (await response.json()) as { items?: FeedbackSearchItem[]; error?: string };
        if (!response.ok || !Array.isArray(body.items)) {
          throw new Error(body.error || "搜索失败，请稍后重试，或使用链接输入");
        }
        if (!controller.signal.aborted) {
          setItems(body.items);
          setStatus("done");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(error instanceof Error ? error.message : "搜索失败，请稍后重试");
        setStatus("error");
      }
    },
    [source],
  );

  useEffect(() => {
    if (initialQuery) void search(initialQuery, initialType);
    return () => request.current?.abort();
  }, [initialQuery, initialType, search]);

  const displayed = selected ? [selected] : items;
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-3 font-semibold text-base">{label}</legend>
      {!selected ? (
        <>
          <label htmlFor={`${source}-query`} className="sr-only">
            搜索{label}
          </label>
          <div className="flex gap-2">
            <Input
              id={`${source}-query`}
              type="search"
              maxLength={100}
              value={query}
              placeholder="输入片名搜索"
              onChange={(event) => {
                request.current?.abort();
                setQuery(event.target.value);
                setItems([]);
                setStatus("idle");
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void search(query, type);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!query.trim() || status === "loading"}
              onClick={() => void search(query, type)}
            >
              搜索
            </Button>
          </div>
          {source === "tmdb" ? (
            <NativeSelect
              aria-label="TMDB 作品类型"
              value={type}
              onChange={(event) => {
                const next = event.target.value === "tv" ? "tv" : "movie";
                setType(next);
                if (query.trim() && status !== "idle") void search(query, next);
              }}
            >
              <NativeSelectOption value="movie">电影</NativeSelectOption>
              <NativeSelectOption value="tv">剧集</NativeSelectOption>
            </NativeSelect>
          ) : null}
          {status === "idle" ? (
            <p className="text-pretty text-muted-foreground text-sm">
              {source === "douban" ? "先找到需要纠正映射的豆瓣作品。" : "选择豆瓣后会自动搜索，也可以自行输入片名。"}
            </p>
          ) : null}
          {status === "loading" ? (
            <div role="status" className="space-y-2">
              <p className="text-muted-foreground text-sm">正在搜索{label}…</p>
              <div className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              <div className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            </div>
          ) : null}
          {status === "error" ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {status === "done" && items.length === 0 ? (
            <p role="status" className="text-pretty text-muted-foreground text-sm">
              没有找到结果，试试原名、其他关键词，或在下方粘贴条目链接。
            </p>
          ) : null}
        </>
      ) : null}
      {displayed.length > 0 ? (
        <ul aria-label={`${label}搜索结果`} className="max-h-80 space-y-2 overflow-y-auto">
          {displayed.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                aria-pressed={selected?.value === item.value}
                onClick={() => onSelect(item)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-muted"
              >
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={`${item.title}海报`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-16 w-12 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="h-16 w-12 shrink-0 rounded-sm bg-muted" />
                )}
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-words font-medium text-sm">{item.title}</span>
                  {item.originalTitle && item.originalTitle !== item.title ? (
                    <span className="block break-words text-muted-foreground text-xs">{item.originalTitle}</span>
                  ) : null}
                  <span className="block text-muted-foreground text-sm">
                    {item.year || "年份未知"} · {item.type === "tv" ? "剧集" : "电影"}
                  </span>
                  {item.subtitle ? (
                    <span className="line-clamp-2 block text-muted-foreground text-xs">{item.subtitle}</span>
                  ) : null}
                  {selected ? <span className="block font-medium text-primary text-xs">已选择</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
          重新选择
        </Button>
      ) : null}
    </fieldset>
  );
}

export function FeedbackForm(initial: FeedbackFormProps) {
  const [douban, setDouban] = useState(initial.douban ?? "");
  const [tmdb, setTmdb] = useState(initial.tmdb ?? "");
  const [reason, setReason] = useState(initial.reason ?? "");
  const [selectedDouban, setSelectedDouban] = useState<FeedbackSearchItem | null>(null);
  const [selectedTmdb, setSelectedTmdb] = useState<FeedbackSearchItem | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(Boolean(initial.douban || initial.tmdb));

  return (
    <form
      method="post"
      action="/feedback"
      className="space-y-6"
      onSubmit={(event) => {
        if (!douban.trim() || !tmdb.trim()) {
          event.preventDefault();
          setError("请选择豆瓣和 TMDB 条目，或在下方粘贴链接");
          return;
        }
        setError("");
        setSubmitting(true);
      }}
    >
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <SubjectPicker
          source="douban"
          selected={selectedDouban}
          onSelect={(item) => {
            setSelectedDouban(item);
            setDouban(item?.value ?? "");
            setSelectedTmdb(null);
            setTmdb("");
            setError("");
          }}
        />
        <SubjectPicker
          key={selectedDouban?.value ?? "manual"}
          source="tmdb"
          selected={selectedTmdb}
          initialQuery={selectedDouban?.title}
          initialType={selectedDouban?.type}
          onSelect={(item) => {
            setSelectedTmdb(item);
            setTmdb(item?.value ?? "");
            setError("");
          }}
        />
      </div>
      <details
        open={manualOpen}
        onToggle={(event) => setManualOpen(event.currentTarget.open)}
        className="space-y-4 rounded-lg border p-4"
      >
        <summary className="cursor-pointer font-medium text-sm">搜不到？粘贴链接或 ID</summary>
        <div className="space-y-2">
          <label htmlFor="douban" className="font-medium text-sm">
            豆瓣条目链接或 ID
          </label>
          <Input
            id="douban"
            name="douban"
            maxLength={500}
            value={douban}
            placeholder="https://movie.douban.com/subject/1292052/"
            onChange={(event) => {
              setDouban(event.target.value);
              setSelectedDouban(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="tmdb" className="font-medium text-sm">
            正确的 TMDB 条目链接
          </label>
          <Input
            id="tmdb"
            name="tmdb"
            type="url"
            maxLength={500}
            value={tmdb}
            placeholder="https://www.themoviedb.org/movie/278"
            onChange={(event) => {
              setTmdb(event.target.value);
              setSelectedTmdb(null);
            }}
          />
          <p className="text-pretty text-muted-foreground text-sm">分季作品请提供整部剧集的 TMDB 链接。</p>
        </div>
      </details>
      <div className="space-y-2">
        <label htmlFor="reason" className="font-medium text-sm">
          修改理由
        </label>
        <Textarea
          id="reason"
          name="reason"
          required
          maxLength={1000}
          value={reason}
          placeholder="说明片名、年份、导演、演员或海报等可以核对的依据"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "正在提交反馈…" : "提交给 Agent 评审"}
      </Button>
      <p className="text-pretty text-muted-foreground text-sm">
        每小时最多提交 5 条，同一豆瓣条目同时只评审一条反馈。超过一小时仍未完成时，可重新提交。
      </p>
    </form>
  );
}
