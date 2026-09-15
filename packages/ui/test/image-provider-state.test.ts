import assert from "node:assert/strict";
import test from "node:test";
import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { reorderImageProviders, toggleImageProvider } from "../src/image-provider-sortable/image-provider-state";

const douban = { provider: "douban", extra: {} } satisfies ImageProvider;
const tmdb = { provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } } satisfies ImageProvider;

test("reorders enabled providers by display order", () => {
  assert.deepEqual(reorderImageProviders([douban, tmdb], ["tmdb", "fanart", "douban"]), [tmdb, douban]);
});

test("keeps one provider enabled and appends a newly enabled provider", () => {
  assert.deepEqual(toggleImageProvider([douban], douban, false), [douban]);
  assert.deepEqual(toggleImageProvider([douban], tmdb, true), [douban, tmdb]);
  assert.deepEqual(toggleImageProvider([douban, tmdb], tmdb, false), [douban]);
});
