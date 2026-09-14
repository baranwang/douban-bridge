import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getPlatformProxy } from "wrangler";
import { assertScheduledSafe } from "./scheduled-safe.mjs";

const core = "http://localhost:8787";
const stremio = "http://localhost:8788";

function timeout() {
  return AbortSignal.timeout(15000);
}

async function get(url, init = {}) {
  return fetch(url, { ...init, signal: timeout() });
}

function assertAssetContentType(pathname, contentType) {
  const type = contentType ?? "";
  if (pathname.endsWith(".css")) assert.match(type, /text\/css/i);
  else if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) assert.match(type, /javascript|ecmascript/i);
  else if (pathname.endsWith(".png")) assert.match(type, /image\/png/i);
  else if (pathname.endsWith(".svg")) assert.match(type, /image\/svg/i);
  else assert.ok(type, `missing content-type for ${pathname}`);
}

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function prepareMigrationSql(raw) {
  let sql = raw.replaceAll("--> statement-breakpoint", "");
  if (stripSqlComments(sql).trim() === "") {
    const body = sql.match(/\/\*([\s\S]*?)\*\//)?.[1];
    sql = body ?? "";
  }
  if (stripSqlComments(sql).trim() === "") return null;
  return sql.replace(/\s+/g, " ").trim();
}

async function withLocalD1(run) {
  const dir = mkdtempSync(join(tmpdir(), "bridge-smoke-d1-"));
  const configPath = join(dir, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "douban-bridge-smoke-d1",
      compatibility_date: "2025-11-28",
      d1_databases: [
        {
          binding: "STREMIO_ADDON_DOUBAN",
          database_name: "stremio-addon-douban",
          database_id: "543ed1d5-3da8-4ed1-8084-25084af52953",
          remote: false,
        },
      ],
    }),
  );
  const platform = await getPlatformProxy({
    configPath,
    persist: { path: resolve(".wrangler/bridge-smoke/v3") },
    remoteBindings: false,
  });
  try {
    return await run(platform.env.STREMIO_ADDON_DOUBAN);
  } finally {
    await platform.dispose();
  }
}

async function ensureLocalSchema(db) {
  const drizzleDir = resolve("apps/core/drizzle");
  const hasUsers = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
  if (!hasUsers) {
    for (const name of readdirSync(drizzleDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      const sql = prepareMigrationSql(readFileSync(resolve(drizzleDir, name), "utf8"));
      if (sql) await db.exec(sql);
    }
    return;
  }
  const hasKeys = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'").first();
  if (!hasKeys) {
    const sql = prepareMigrationSql(readFileSync(resolve(drizzleDir, "0002_api_keys.sql"), "utf8"));
    if (sql) await db.exec(sql);
  }
}

async function waitForApiDenied() {
  for (let i = 0; i < 30; i++) {
    const response = await get(`${core}/v1/catalog/movie_top250`);
    if (response.status === 401) return response;
    await delay(500);
  }
  throw new Error("core did not serve /v1");
}

const UNMAPPED_SQL =
  "SELECT COUNT(*) AS n FROM douban_mapping WHERE tmdb_id IS NULL AND (calibrated IS NOT 1 OR calibrated IS NULL)";

async function countUnmapped(db) {
  const row = await db.prepare(UNMAPPED_SQL).first();
  return Number(row?.n ?? 0);
}

async function deletePendingMappings(db) {
  await db
    .prepare("DELETE FROM douban_mapping WHERE tmdb_id IS NULL AND (calibrated IS NOT 1 OR calibrated IS NULL)")
    .run();
}

await withLocalD1(ensureLocalSchema);
await waitForApiDenied();

assert.equal((await get(`${core}/stremio/manifest`)).status, 404);
const denied = await get(`${core}/v1/catalog/movie_top250`);
assert.equal(denied.status, 401);
assert.equal(denied.headers.get("cache-control"), "private, no-store");
const install = await get(`${stremio}/manifest.json`, { redirect: "manual" });
assert.equal(install.status, 302);
assert.match(install.headers.get("location"), /^\/[^/]+\/manifest\.json$/);
assert.equal((await get(`${stremio}/internal/anything`)).status, 404);
const configure = await get(`${stremio}/configure`);
assert.equal(configure.status, 200);
const html = await configure.text();
assert.match(html, /localhost:8788/);
assert.equal((await get(`${stremio}/icon.png`)).status, 200);

const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
assert.ok(assetPaths.length > 0, "configure HTML must reference /assets/ URLs");
for (const pathname of new Set(assetPaths)) {
  const asset = await get(`${stremio}${pathname}`);
  assert.equal(asset.status, 200, pathname);
  assertAssetContentType(pathname, asset.headers.get("content-type"));
}

const stremioWrangler = readFileSync(resolve("apps/stremio/wrangler.jsonc"), "utf8");
const coreWrangler = readFileSync(resolve("apps/core/wrangler.jsonc"), "utf8");
assert.equal(stremioWrangler.includes('"crons"'), false);
assert.match(coreWrangler, /"0 \* \* \* \*"/);
assert.equal(readFileSync(resolve("apps/stremio/src/index.ts"), "utf8").includes("scheduled"), false);
assert.match(readFileSync(resolve("apps/core/src/index.tsx"), "utf8"), /scheduled/);

await withLocalD1(deletePendingMappings);
const unmappedCount = await withLocalD1(countUnmapped);
assertScheduledSafe(unmappedCount);
const scheduled = await get(`${core}/cdn-cgi/handler/scheduled`);
assert.equal(scheduled.status, 200);

const location = install.headers.get("location");
const configId = location.replace(/^\/([^/]+)\/manifest\.json$/, "$1");
const manifest = await get(`${stremio}${location}`);
assert.equal(manifest.status, 200);
const manifestBody = await manifest.json();
assert.equal(typeof manifestBody.id, "string");
const catalogRes = await get(`${stremio}/${configId}/catalog/movie/movie_top250.json`);
assert.equal(catalogRes.status, 200);
const catalogBody = await catalogRes.json();
assert.equal(catalogBody.cacheMaxAge, 86400);
assert.equal(catalogBody.staleRevalidate, 604800);
assert.equal(catalogBody.staleError, 604800);
assert.ok(Array.isArray(catalogBody.metas));
assert.ok(catalogBody.metas.length > 0);
assert.equal(typeof catalogBody.metas[0].name, "string");
assert.match(catalogBody.metas[0].id, /^douban:\d+$/);
const doubanId = catalogBody.metas[0].id.replace(/^douban:/, "");
const stremioMeta = await get(`${stremio}/${configId}/meta/movie/douban:${doubanId}.json`);
assert.equal(stremioMeta.status, 200);
const stremioMetaBody = await stremioMeta.json();
assert.equal(stremioMetaBody.cacheMaxAge, 86400);
assert.equal(stremioMetaBody.staleRevalidate, 604800);
assert.equal(stremioMetaBody.staleError, 604800);
assert.equal(typeof stremioMetaBody.meta?.name, "string");
assert.ok("behaviorHints" in stremioMetaBody.meta);

const testKeys = await withLocalD1(async (db) => {
  const keys = [];
  for (const [index, providers] of [
    [0, [{ provider: "douban", extra: {} }]],
    [1, []],
  ]) {
    const userId = crypto.randomUUID();
    const sk = `sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sk))).toString("hex");
    await db
      .prepare("INSERT INTO users (id, github_id, github_login, has_starred) VALUES (?, ?, ?, 1)")
      .bind(userId, Date.now() + index, `smoke-${userId}`)
      .run();
    await db
      .prepare("INSERT INTO user_configs (user_id, image_providers) VALUES (?, ?)")
      .bind(userId, JSON.stringify(providers))
      .run();
    await db
      .prepare("INSERT INTO api_keys (user_id, key_hash, created_at) VALUES (?, ?, ?)")
      .bind(userId, hash, Date.now())
      .run();
    keys.push({ userId, sk });
  }
  return keys;
});

try {
  await waitForApiDenied();
  const catalogUrl = `${core}/v1/catalog/movie_top250`;
  const pages = [];
  for (const { sk } of testKeys) {
    const response = await get(catalogUrl, { headers: { Authorization: `Bearer ${sk}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length > 0);
    assert.equal(typeof body.items[0].title, "string");
    assert.equal(typeof body.items[0].doubanId, "number");
    pages.push(body);
  }
  assert.notEqual(pages[0].items[0].images.poster, pages[1].items[0].images.poster);

  const liveMeta = await get(`${core}/v1/meta/${pages[0].items[0].doubanId}`, {
    headers: { Authorization: `Bearer ${testKeys[0].sk}` },
  });
  assert.equal(liveMeta.status, 200);
  assert.equal(liveMeta.headers.get("cache-control"), "private, no-store");
  const liveMetaBody = await liveMeta.json();
  assert.equal(typeof liveMetaBody.item?.title, "string");
  assert.equal(liveMetaBody.item.doubanId, pages[0].items[0].doubanId);

  await withLocalD1(async (db) => {
    await db.prepare("DELETE FROM api_keys WHERE user_id = ?").bind(testKeys[0].userId).run();
  });
  await waitForApiDenied();
  const revoked = await get(catalogUrl, { headers: { Authorization: `Bearer ${testKeys[0].sk}` } });
  assert.equal(revoked.status, 401);
} finally {
  await withLocalD1(async (db) => {
    for (const { userId } of testKeys) {
      await db.prepare("DELETE FROM api_keys WHERE user_id = ?").bind(userId).run();
      await db.prepare("DELETE FROM user_configs WHERE user_id = ?").bind(userId).run();
      await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    }
    await deletePendingMappings(db);
  });
}
