import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { eq } from "drizzle-orm";
import type { Context, Env } from "hono";
import { z } from "zod/v4";
import { getDrizzle, type UserConfig, userConfigs } from "@/db";
import { DEFAULT_COLLECTION_IDS } from "./collections";

const imageProviderDoubanSchema = z.object({
  provider: z.literal("douban"),
  extra: z.object({}),
});

const imageProviderFanartSchema = z.object({
  provider: z.literal("fanart"),
  extra: z.object({
    apiKey: z.string().optional(),
  }),
});

const imageProviderTmdbSchema = z.object({
  provider: z.literal("tmdb"),
  extra: z.object({
    apiKey: z.string().optional(),
    imageLanguages: z.array(z.string()).optional(),
  }),
});

const imageProviderSchema = z.union([imageProviderDoubanSchema, imageProviderFanartSchema, imageProviderTmdbSchema]);

type ImageProviderBase = z.output<typeof imageProviderSchema>;
export type ImageProvider<T extends ImageProviderBase["provider"] = ImageProviderBase["provider"]> = Extract<
  ImageProviderBase,
  { provider: T }
>;

export const configSchema = z.object({
  catalogIds: z.array(z.string()).default(DEFAULT_COLLECTION_IDS),
  dynamicCollections: z.boolean().default(false).catch(false),
  imageProviders: imageProviderSchema.array().default([{ provider: "douban", extra: {} }]),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;

export const encodeConfig = (config?: ConfigInput | null): string => {
  const stringified = JSON.stringify(configSchema.parse(config ?? {}));
  const compressed = brotliCompressSync(stringified, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    },
  });
  const result = compressed.toString("base64url");
  return result;
};

export const decodeConfig = (encoded?: string): Config => {
  if (!encoded) {
    return configSchema.parse({});
  }
  try {
    const decompressed = brotliDecompressSync(Buffer.from(encoded, "base64url"));
    return configSchema.parse(JSON.parse(decompressed.toString()));
  } catch {
    return configSchema.parse({});
  }
};

/**
 * 检查传入的 ID 是否是用户 ID
 * userId: UUID 格式（如 95db4d74-5d1b-4329-9283-57cb9a20c14b）
 * configId: brotli 压缩后的 base64url 编码
 */
export const isUserId = (id?: string): boolean => {
  return z.uuid().safeParse(id).success;
};

export const getConfig = async (env: CloudflareBindings, id?: string): Promise<Config> => {
  try {
    if (isUserId(id)) {
      const db = getDrizzle(env);
      const config = await db.query.userConfigs.findFirst({
        where: (userConfigs, { eq }) => eq(userConfigs.userId, id ?? ""),
      });
      if (config) {
        const transformedConfig: ConfigInput = {
          catalogIds: config.catalogIds ?? undefined,
          dynamicCollections: config.dynamicCollections,
          imageProviders: config.imageProviders as ConfigInput["imageProviders"],
        };
        return configSchema.parse(transformedConfig);
      }
      return configSchema.parse({});
    }
  } catch {
    return configSchema.parse({});
  }
  return decodeConfig(id);
};

/**
 * 获取用户配置
 */
export async function getUserConfig(c: Context<Env>, userId: string): Promise<UserConfig | null> {
  const db = getDrizzle(c.env);
  const config = await db.query.userConfigs.findFirst({ where: eq(userConfigs.userId, userId) });

  return config ?? null;
}

/**
 * 保存用户配置
 */
export async function saveUserConfig(
  c: Context<Env>,
  userId: string,
  config: {
    catalogIds: string[];
    dynamicCollections: boolean;
    imageProviders: Config["imageProviders"];
  },
): Promise<void> {
  const db = getDrizzle(c.env);

  await db
    .insert(userConfigs)
    .values({
      userId,
      catalogIds: config.catalogIds,
      dynamicCollections: config.dynamicCollections,
      imageProviders: config.imageProviders,
    })
    .onConflictDoUpdate({
      target: userConfigs.userId,
      set: {
        catalogIds: config.catalogIds,
        dynamicCollections: config.dynamicCollections,
        imageProviders: config.imageProviders,
      },
    });
}
