import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getDrizzle = (env: CloudflareBindings) =>
  drizzle(env.STREMIO_ADDON_DOUBAN, {
    schema,
  });

export * from "./schema";
