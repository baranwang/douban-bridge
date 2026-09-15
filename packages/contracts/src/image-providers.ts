import { z } from "zod/v4";

export const TMDB_IMAGE_LANGUAGE = ["zh", "en", "ja", "ko", "null"];

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
