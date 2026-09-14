import { z } from "zod/v4";
import { SECONDS_PER_WEEK } from "../constants";
import { BaseAPI } from "./base";

const searchResultSchema = z.object({
  top: z
    .object({
      series: z
        .object({
          series: z
            .object({
              id: z.string(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export class ImdbAPI extends BaseAPI {
  constructor() {
    super({ baseURL: "https://imdb.iamidiotareyoutoo.com" });
  }

  async search(imdbId: string) {
    const resp = await this.request({
      url: "/search",
      params: { tt: imdbId },
      cache: { key: `imdb_search:${imdbId}`, ttl: SECONDS_PER_WEEK },
    });
    return searchResultSchema.parse(resp);
  }
}
