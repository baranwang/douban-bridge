import { z } from "zod/v4";

const fanartImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  lang: z.string(),
  likes: z.string(),
  added: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  disc: z.string().optional(),
  disc_type: z.string().optional(),
  size: z.string().optional(),
  season: z.string().optional(),
  colour: z.string().optional(),
});

export const fanartMovieResponseSchema = z.object({
  name: z.string(),
  tmdb_id: z.string(),
  imdb_id: z.string(),
  image_count: z.number().optional(),
  hdmovielogo: fanartImageSchema.array().optional(),
  moviedisc: fanartImageSchema.array().optional(),
  movielogo: fanartImageSchema.array().optional(),
  movieposter: fanartImageSchema.array().optional(),
  hdmovieclearart: fanartImageSchema.array().optional(),
  movieart: fanartImageSchema.array().optional(),
  moviebackground: fanartImageSchema.array().optional(),
  moviebanner: fanartImageSchema.array().optional(),
  moviethumb: fanartImageSchema.array().optional(),
});

export const fanartTVResponseSchema = z.object({
  name: z.string(),
  thetvdb_id: z.string(),
  image_count: z.number().optional(),
  hdtvlogo: fanartImageSchema.array().optional(),
  clearlogo: fanartImageSchema.array().optional(),
  clearart: fanartImageSchema.array().optional(),
  hdclearart: fanartImageSchema.array().optional(),
  showbackground: fanartImageSchema.array().optional(),
  tvthumb: fanartImageSchema.array().optional(),
  tvposter: fanartImageSchema.array().optional(),
  seasonposter: fanartImageSchema.array().optional(),
  seasonthumb: fanartImageSchema.array().optional(),
  tvbanner: fanartImageSchema.array().optional(),
  characterart: fanartImageSchema.array().optional(),
  seasonbanner: fanartImageSchema.array().optional(),
});
