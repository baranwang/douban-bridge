import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { doubanMapping } from "../src/db";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("new mapping rows get agent columns with defaults", async () => {
  await withTestContext(async () => {
    await api.db.insert(doubanMapping).values({ doubanId: 42, imdbId: "tt1" });
    const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 42) });
    assert.equal(row?.mappingRevision, 0);
    assert.equal(row?.agentAttempts, 0);
    assert.equal(row?.matchSource, null);
    assert.equal(row?.agentState, null);
    assert.equal(row?.agentResult, null);
  });
});
