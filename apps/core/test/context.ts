import { readdir, readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { asyncLocalStorage } from "../src/libs/middleware/context";
export async function withTestContext<T>(
  run: (env: CloudflareBindings, ctx: ExecutionContext) => Promise<T>,
): Promise<T> {
  const proxy = await getPlatformProxy<CloudflareBindings>({ configPath: "wrangler.test.jsonc", persist: false });
  const env = proxy.env;
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      pending.push(p);
    },
    passThroughOnException() {},
  } as ExecutionContext;
  try {
    const migrations = (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      const sql = (await readFile(`drizzle/${name}`, "utf8")).replaceAll("--> statement-breakpoint", "");
      await env.STREMIO_ADDON_DOUBAN.exec(sql);
    }
    return await asyncLocalStorage.run({ env, ctx }, () => run(env, ctx));
  } finally {
    try {
      await Promise.all(pending);
    } finally {
      await proxy.dispose();
    }
  }
}
