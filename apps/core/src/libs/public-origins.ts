import { HTTPException } from "hono/http-exception";

type WebOriginEnv = { STREMIO_ORIGIN: string; DASH_ORIGIN: string };

function isLoopback(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function isStremioWebRequest(env: WebOriginEnv, requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return url.origin === env.STREMIO_ORIGIN || (isLoopback(url) && url.port === "8788");
}

export function toStremioWebUrl(env: WebOriginEnv, requestUrl: string): string {
  const request = new URL(requestUrl);
  const origin = isLoopback(request) ? `${request.protocol}//${request.hostname}:8788` : env.STREMIO_ORIGIN;
  const target = new URL(origin);
  target.pathname = request.pathname;
  target.search = request.search;
  return target.toString();
}

export function getStremioOrigin(env: { STREMIO_ORIGIN: string }): string {
  return env.STREMIO_ORIGIN;
}

export function getSignedInPath(env: WebOriginEnv, origin: string, userId: string): string {
  return origin === env.STREMIO_ORIGIN ? `/${userId}/configure` : "/rex";
}

export function getSignedOutPath(env: WebOriginEnv, origin: string): string {
  return origin === env.STREMIO_ORIGIN ? "/configure" : "/";
}

export function isAllowedStremioOrigin(env: { STREMIO_ORIGIN: string }, origin: string | undefined): origin is string {
  if (!origin) return false;
  if (origin === env.STREMIO_ORIGIN) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getOAuthCredentials(
  env: {
    STREMIO_ORIGIN: string;
    DASH_ORIGIN: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  },
  origin: string,
): { clientId: string; clientSecret: string } {
  if (origin !== env.STREMIO_ORIGIN && origin !== env.DASH_ORIGIN) {
    throw new HTTPException(400);
  }
  return { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}
