import { z } from "zod/v4";

export const TMDB_IMAGE_LANGUAGE = ["zh", "en", "ja", "ko", "null"];

/** TMDB v4 Read Access Token is a JWT. v3 API Keys are 32-char hex and cannot be sent as Bearer. */
export function isTmdbReadAccessToken(value?: string): boolean {
  const token = value?.trim();
  return !!token && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export function resolveTmdbAccessToken(
  userToken: string | undefined,
  fallback: string | undefined,
): string | undefined {
  const token = userToken?.trim();
  return isTmdbReadAccessToken(token) ? token : fallback;
}

const imageProviderDoubanSchema = z.object({
  provider: z.literal("douban"),
  extra: z.object({}),
});

const imageProviderFanartSchema = z.object({
  provider: z.literal("fanart"),
  extra: z.object({ apiKey: z.string().optional() }),
});

const imageProviderTmdbSchema = z.object({
  provider: z.literal("tmdb"),
  extra: z.object({
    apiKey: z.string().optional(),
    imageLanguages: z.array(z.string()).optional(),
  }),
});

export const imageProviderSchema = z.union([
  imageProviderDoubanSchema,
  imageProviderFanartSchema,
  imageProviderTmdbSchema,
]);

export const imageProvidersSchema = imageProviderSchema.array();

type ImageProviderBase = z.output<typeof imageProviderSchema>;

export type ImageProvider<T extends ImageProviderBase["provider"] = ImageProviderBase["provider"]> = Extract<
  ImageProviderBase,
  { provider: T }
>;
