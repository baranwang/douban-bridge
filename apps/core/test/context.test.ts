import assert from "node:assert/strict";
import test from "node:test";
import { withTestContext } from "./context";

test("withTestContext bootstraps local D1 so douban_mapping is writable", async () => {
  await withTestContext(async (env) => {
    await env.STREMIO_ADDON_DOUBAN.prepare(
      "INSERT INTO douban_mapping (douban_id, tmdb_id) VALUES (?, ?)",
    )
      .bind(1291546, 550)
      .run();
    const row = await env.STREMIO_ADDON_DOUBAN.prepare(
      "SELECT douban_id, tmdb_id FROM douban_mapping WHERE douban_id = ?",
    )
      .bind(1291546)
      .first();
    assert.deepEqual(row, { douban_id: 1291546, tmdb_id: 550 });
  });
});
