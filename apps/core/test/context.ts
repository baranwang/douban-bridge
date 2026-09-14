import { readdir, readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { asyncLocalStorage } from "../src/libs/middleware/context";

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function prepareMigrationSql(raw: string): string | null {
  let sql = raw.replaceAll("--> statement-breakpoint", "");
  if (stripSqlComments(sql).trim() === "") {
    const body = sql.match(/\/\*([\s\S]*?)\*\//)?.[1];
    sql = body ?? "";
  }
  if (stripSqlComments(sql).trim() === "") return null;
  return sql.replace(/\s+/g, " ").trim();
}

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
      const sql = prepareMigrationSql(await readFile(`drizzle/${name}`, "utf8"));
      if (sql) await env.STREMIO_ADDON_DOUBAN.exec(sql);
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
