import { z } from "zod/v4";

export * from "./image-providers";

export const bridgeItemSchema = z.object({
  doubanId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  description: z.string().optional(),
  year: z.string().optional(),
  rating: z.number().optional(),
  tmdbId: z.number().int().positive().nullable().catch(null),
  imdbId: z
    .string()
    .regex(/^tt\d+$/)
    .nullable()
    .catch(null),
  images: z.object({
    poster: z.string().url().nullable().catch(null),
    background: z.string().url().nullable().catch(null),
    logo: z.string().url().nullable().catch(null),
  }),
});
export const bridgeDetailSchema = bridgeItemSchema.extend({
  actors: z.array(z.string()),
  directors: z.array(z.string()),
  genres: z.array(z.string()),
});
export const catalogResponseSchema = z.object({ items: z.array(bridgeItemSchema) });
export const metaResponseSchema = z.object({ item: bridgeDetailSchema });
export type BridgeItem = z.infer<typeof bridgeItemSchema>;
export type BridgeDetail = z.infer<typeof bridgeDetailSchema>;
export const catalogQuerySchema = z.object({
  collectionId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_]+$/),
  skip: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  genre: z.string().min(1).max(128).optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export const doubanIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
