import { compact } from "es-toolkit";
import { z } from "zod/v4";

export const doubanSubjectCollectionCategorySchema = z
  .object({
    category: z.string(),
    items: z
      .array(
        z.object({
          current: z.boolean(),
          id: z.string(),
          name: z.string(),
        }),
      )
      .nullish(),
  })
  .nullish()
  .catch(() => null);

export type DoubanSubjectCollectionCategory = z.output<typeof doubanSubjectCollectionCategorySchema>;

export const doubanSubjectCollectionInfoSchema = z.object({
  category_tabs: z
    .array(doubanSubjectCollectionCategorySchema)
    .nullish()
    .catch(() => []),
});

const doubanSubjectCollectionItemSchema = z
  .object({
    id: z.coerce.number(),
    type: z.enum(["movie", "tv"]),
    title: z.string(),
    original_title: z.string().nullish(),
    year: z.string().nullish(),
    card_subtitle: z.string().nullish(),
    cover_url: z.string().nullish(),
    cover: z
      .object({
        url: z.string(),
      })
      .nullish(),
    pic: z
      .object({
        large: z.string().nullish(),
        normal: z.string().nullish(),
      })
      .nullish(),
    photos: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    comment: z.string().nullish(),
    rating: z
      .object({
        value: z.coerce.number().nullish(),
      })
      .nullish(),
    url: z.string().nullish(),
    release_date: z.string().nullish(),
  })
  .transform((v) => ({
    ...v,
    cover: v.cover?.url ?? v.cover_url ?? v.pic?.large ?? v.pic?.normal,
    year: v.year ?? v.card_subtitle?.split("/")?.[0].trim(),
    description: v.description || v.comment,
  }));

export type DoubanSubjectCollectionItem = z.output<typeof doubanSubjectCollectionItemSchema>;

export const doubanSubjectCollectionSchema = z.object({
  subject_collection_items: z
    .array(
      z.unknown().transform((v) => {
        const result = doubanSubjectCollectionItemSchema.safeParse(v);
        if (result.success) {
          return result.data;
        }
        console.warn(z.prettifyError(result.error));
        return null;
      }),
    )
    .transform((v) => v.filter((v) => v !== null)),
  total: z.number(),
});

export const doubanSubjectDetailSchema = z.object({
  id: z.coerce.number(),
  type: z.enum(["movie", "tv"]),
  title: z.string(),
  original_title: z.string().nullish(),
  intro: z.string().nullish(),
  cover_url: z.string().nullish(),
  year: z.string().nullish(),
  pic: z
    .object({
      large: z.string().nullish(),
      normal: z.string().nullish(),
    })
    .nullish(),
  directors: z
    .array(
      z.object({
        name: z.string(),
      }),
    )
    .nullish(),
  actors: z
    .array(
      z.object({
        name: z.string(),
      }),
    )
    .nullish(),
  genres: z.array(z.string()).nullish(),
  countries: z.array(z.string()).nullish(),
  honor_infos: z
    .array(
      z.object({
        title: z.string(),
      }),
    )
    .nullish(),
  languages: z.array(z.string()).nullish(),
  pubdate: z.array(z.string()).nullish(),
  rating: z
    .object({
      value: z.coerce.number().nullish(),
    })
    .nullish(),
  url: z.string().nullish(),
  linewatches: z
    .array(
      z
        .object({
          source_uri: z.string().nullish(),
          source: z.object({
            name: z.string(),
          }),
        })
        .nullish()
        .catch(() => null),
    )
    .nullish()
    .transform((v) => (v ? compact(v) : [])),
});

export const doubanModulesSchema = z.object({
  modules: z.array(
    z
      .object({
        module_name: z.union([
          z.literal("tv_selected_chart_collections"),
          z.literal("movie_selected_chart_collections"),
        ]),
        data: z.object({
          selected_collections: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              is_merged_cover: z.boolean(),
              is_official: z.boolean(),
            }),
          ),
        }),
      })
      .nullish()
      .catch(() => null),
  ),
});
