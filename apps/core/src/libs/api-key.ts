import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { apiKeys, getDrizzle, userConfigs, users } from "@/db";
import { type Config, configSchema } from "./config";
import { ensureFreshStarStatus } from "./star";

export async function hashApiKey(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function replaceApiKey(env: CloudflareBindings, userId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const sk = `sk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const keyHash = await hashApiKey(sk);
  const createdAt = new Date();
  await getDrizzle(env)
    .insert(apiKeys)
    .values({ userId, keyHash, createdAt })
    .onConflictDoUpdate({ target: apiKeys.userId, set: { keyHash, createdAt } });
  return sk;
}

export async function revokeApiKey(env: CloudflareBindings, userId: string): Promise<void> {
  await getDrizzle(env).delete(apiKeys).where(eq(apiKeys.userId, userId));
}

const bearerPattern = /^Bearer (sk_[0-9a-f]{64})$/;

export async function authenticateApiKey(
  env: CloudflareBindings,
  header: string | undefined,
): Promise<{ userId: string; config: Config }> {
  const match = header?.match(bearerPattern);
  if (!match) throw new HTTPException(401);
  const keyHash = await hashApiKey(match[1]);
  try {
    const db = getDrizzle(env);
    const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, keyHash) });
    if (!keyRow) throw new HTTPException(401);
    const row = await db.query.users.findFirst({ where: eq(users.id, keyRow.userId) });
    if (!row) throw new HTTPException(401);
    const user = await ensureFreshStarStatus(env, row);
    if (user.hasStarred !== true) throw new HTTPException(403);
    const configRow = await db.query.userConfigs.findFirst({ where: eq(userConfigs.userId, user.id) });
    if (!configRow) return { userId: user.id, config: configSchema.parse({}) };
    return {
      userId: user.id,
      config: configSchema.parse({
        catalogIds: configRow.catalogIds ?? undefined,
        dynamicCollections: configRow.dynamicCollections,
        imageProviders: configRow.imageProviders,
      }),
    };
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(503);
  }
}
