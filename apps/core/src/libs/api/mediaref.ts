import { getContext } from "../middleware";

// Connect JSON 协议，接口定义见 media-ref 仓库 proto/mediaref/v1/*.proto；@media-ref/client 未发布，直接调 HTTP。
export const MEDIAREF_API = "https://api.mediaref.org";
export const MEDIAREF_TIMEOUT_MS = 1500;
const MAX_BATCH = 100;

export interface MediaRefMapping {
  tmdbId: number | null;
  imdbId: string | null;
  traktId: number | null;
  confirmed: boolean;
}

interface ExternalId {
  namespace: string;
  nativeId: string;
}
interface Association extends ExternalId {
  id: string;
  unconfirmed?: boolean;
}
interface MediaQueryItem {
  document?: { externalIds?: ExternalId[]; associations?: Association[] };
  matchedAssociationId?: string;
}
interface BatchGetMediaResponse {
  results?: { ref?: { douban?: string }; success?: { items?: MediaQueryItem[] } }[];
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const apiKey = getContext().env.MEDIAREF_API_KEY;
  if (!apiKey) throw new Error("MEDIAREF_API_KEY is not configured");
  const response = await fetch(`${MEDIAREF_API}/mediaref.v1.${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MEDIAREF_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`MediaRef ${method} responded ${response.status}`);
  return response.json() as Promise<T>;
}

// tmdb/trakt 的 nativeId 形如 "movie:278"，取最后一段数字。
function numericId(nativeId: string | undefined): number | null {
  const id = Number(nativeId?.split(":").pop());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function toMapping(item: MediaQueryItem): MediaRefMapping | null {
  const ids = item.document?.externalIds ?? [];
  const find = (namespace: string) => ids.find((ext) => ext.namespace === namespace)?.nativeId;
  const tmdbId = numericId(find("tmdb"));
  if (tmdbId === null) return null;
  const matched = item.document?.associations?.find((assoc) => assoc.id === item.matchedAssociationId);
  return {
    tmdbId,
    imdbId: find("imdb") ?? null,
    traktId: numericId(find("trakt")),
    confirmed: matched ? matched.unconfirmed !== true : false,
  };
}

/** 按豆瓣编号批量查 MediaRef，只返回带 tmdb 编号的命中；出错时抛出，由调用方降级。 */
export async function lookupDoubanIds(doubanIds: number[]): Promise<Map<number, MediaRefMapping>> {
  const chunks: number[][] = [];
  for (let i = 0; i < doubanIds.length; i += MAX_BATCH) chunks.push(doubanIds.slice(i, i + MAX_BATCH));
  const responses = await Promise.all(
    chunks.map((chunk) =>
      call<BatchGetMediaResponse>("MediaService/BatchGetMedia", {
        refs: chunk.map((id) => ({ douban: String(id) })),
        includeUnconfirmed: true,
      }),
    ),
  );
  const result = new Map<number, MediaRefMapping>();
  for (const { results = [] } of responses) {
    for (const entry of results) {
      const doubanId = Number(entry.ref?.douban);
      const mappings = (entry.success?.items ?? []).map(toMapping).filter((m) => m !== null);
      const best = mappings.find((m) => m.confirmed) ?? mappings[0];
      if (best) result.set(doubanId, best);
    }
  }
  return result;
}

/** 把本地查到的豆瓣→TMDB 电影对应作为变更请求交给 MediaRef，过取证关卡后才生效。 */
export async function submitDoubanLead(doubanId: number, tmdbId: number): Promise<void> {
  await call("ChangeRequestService/CreateChangeRequest", {
    target: { tmdb: { type: "MEDIA_TYPE_MOVIE", id: tmdbId } },
    namespace: "douban",
    nativeId: String(doubanId),
    segments: [],
  });
}
