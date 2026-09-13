import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { z } from "zod/v4";

export const doubanMapping = sqliteTable("douban_mapping", {
  doubanId: int("douban_id").notNull().primaryKey(),
  tmdbId: int("tmdb_id"),
  imdbId: text("imdb_id"),
  traktId: int("trakt_id"),
  calibrated: int("calibrated", { mode: "boolean" }).default(false),

  createdAt: int("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const doubanMappingSchema = z.object({
  doubanId: z.coerce.number(),
  tmdbId: z.coerce.number().nullish(),
  imdbId: z.string().nullish(),
  traktId: z.coerce.number().nullish(),
  calibrated: z.boolean().nullish(),
});

export type DoubanIdMapping = z.output<typeof doubanMappingSchema>;

// 用户表 - 存储 GitHub 登录用户信息
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // 使用 nanoid 生成的短 ID
  githubId: int("github_id").notNull().unique(),
  githubLogin: text("github_login").notNull(),
  githubAvatarUrl: text("github_avatar_url"),
  githubAccessToken: text("github_access_token"), // 用于检查 star 状态
  hasStarred: int("has_starred", { mode: "boolean" }).default(false),
  starCheckedAt: int("star_checked_at", { mode: "timestamp_ms" }),
  createdAt: int("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

// 用户配置表 - 存储用户的 Stremio 插件配置
export const userConfigs = sqliteTable("user_configs", {
  userId: text("user_id").primaryKey(),
  catalogIds: text("catalog_ids", { mode: "json" }).$type<string[]>().default([]),
  dynamicCollections: int("dynamic_collections", { mode: "boolean" }).default(false),
  imageProviders: text("image_providers", { mode: "json" })
    .$type<Array<{ provider: string; extra: Record<string, unknown> }>>()
    .default([{ provider: "douban", extra: { proxy: "none" } }]),
  createdAt: int("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type UserConfig = typeof userConfigs.$inferSelect;
