import { HTTPException } from "hono/http-exception";

export function getStremioOrigin(env: { STREMIO_ORIGIN: string }): string {
  return env.STREMIO_ORIGIN;
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
    DASH_GITHUB_CLIENT_ID?: string;
    DASH_GITHUB_CLIENT_SECRET?: string;
  },
  origin: string,
): { clientId: string; clientSecret: string } {
  if (origin === env.STREMIO_ORIGIN) {
    return { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }
  if (origin === env.DASH_ORIGIN) {
    const clientId = env.DASH_GITHUB_CLIENT_ID;
    const clientSecret = env.DASH_GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new HTTPException(503);
    return { clientId, clientSecret };
  }
  throw new HTTPException(400);
}
