import { Badge } from "@douban-bridge/ui/components/badge";
import type { mappingFeedback } from "@/db";
import { parseAgent } from "@/libs/agent-match/blob";

const STATUS_LABELS: Record<typeof mappingFeedback.$inferSelect.status, string> = {
  pending: "等待 Agent 评审",
  accepted: "已采纳并更新映射",
  suggested: "建议人工确认",
  rejected: "未采纳",
  failed: "执行失败，可重新提交",
  stale: "映射已变更，请重新提交",
};

export function MappingFeedbackList({
  rows,
  admin = false,
}: {
  rows: (typeof mappingFeedback.$inferSelect)[];
  admin?: boolean;
}) {
  return (
    <section className="mt-8 space-y-4" aria-labelledby="feedback-history">
      <h2 id="feedback-history" className="font-semibold text-xl">
        {admin ? "用户映射反馈" : "我的反馈"}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无反馈。发现映射有误时，可以提供正确的 TMDB 条目和修改理由。</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => {
            const result = parseAgent(row.result);
            const tmdbPath = row.candidateId.replace(/^tmdb:/, "").replace(":", "/");
            return (
              <li key={row.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={`https://movie.douban.com/subject/${row.doubanId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm underline underline-offset-4"
                  >
                    豆瓣 {row.doubanId}
                  </a>
                  <Badge variant="outline">{STATUS_LABELS[row.status]}</Badge>
                </div>
                <p className="break-words text-sm">
                  建议映射：
                  <a
                    href={`https://www.themoviedb.org/${tmdbPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {row.candidateId}
                  </a>
                </p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground text-sm">修改理由：{row.reason}</p>
                {result?.reason ? (
                  <p className="whitespace-pre-wrap break-words text-sm">评审结论：{result.reason}</p>
                ) : null}
                {result?.confidence != null ? (
                  <p className="text-muted-foreground text-sm">置信度：{Math.round(result.confidence * 100)}%</p>
                ) : null}
                {admin ? (
                  <a href={`/dash/tidy-up/${row.doubanId}`} className="text-sm underline underline-offset-4">
                    查看映射并人工处理
                  </a>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  提交时间：{row.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
