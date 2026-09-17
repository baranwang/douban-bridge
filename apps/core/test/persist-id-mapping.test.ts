import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("persistIdMapping does not replace an existing tmdb id", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 1, tmdbId: 101, mappingRevision: 1, matchSource: "agent" });
    await api.persistIdMapping([{ doubanId: 1, tmdbId: 202, imdbId: "tt-new", traktId: 3 }]);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 1) });
    assert.equal(row?.tmdbId, 101);
    assert.equal(row?.imdbId, "tt-new");
    assert.equal(row?.matchSource, "agent");
  });
});

test("persistIdMapping bumps revision when writing ids to an empty row", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 2 });
    await api.persistIdMapping([{ doubanId: 2, tmdbId: 5, imdbId: "tt5", traktId: 5 }]);
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 2) });
    assert.equal(row?.tmdbId, 5);
    assert.equal(row?.mappingRevision, 1);
    assert.equal(row?.matchSource, "deterministic");
    assert.notEqual(row?.calibrated, true);
  });
});
