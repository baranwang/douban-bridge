import assert from "node:assert/strict";
import { test } from "node:test";
import { assertScheduledSafe } from "./scheduled-safe.mjs";

test("allows a 0-row fixture", () => {
  assert.doesNotThrow(() => assertScheduledSafe(0));
});

test("refuses leftover rows without running cron", () => {
  assert.throws(() => assertScheduledSafe(1), /skipped: 1 unmapped/);
  assert.throws(() => assertScheduledSafe(5), /skipped: 5 unmapped/);
});

test("refuses full-history cron above the cap", () => {
  assert.throws(() => assertScheduledSafe(6), /full-history/);
  assert.throws(() => assertScheduledSafe(100), /cap 5/);
});
