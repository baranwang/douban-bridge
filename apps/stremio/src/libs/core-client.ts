import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export async function coreGet<T>(
  env: { CORE_STREMIO: { fetch: (input: Request | URL | string) => Promise<Response> } },
  path: string,
  query: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(path, "https://core.internal");
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  const response = await env.CORE_STREMIO.fetch(new Request(url));
  if (!response.ok) throw new HTTPException(response.status as ContentfulStatusCode);
  return response.json() as Promise<T>;
}
