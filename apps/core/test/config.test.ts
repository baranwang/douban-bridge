import assert from "node:assert/strict";
import test from "node:test";
import { ADDON } from "@douban-bridge/contracts/addon";
import { configSchema, decodeConfig, encodeConfig } from "../src/libs/config";

test("encoded configs round-trip and addon identity remains stable", () => {
  const config = configSchema.parse({ catalogIds: ["movie_top250"] });
  assert.deepEqual(decodeConfig(encodeConfig(config)), config);
  assert.equal(ADDON.id, "stremio-addon-douban");
  assert.equal(ADDON.name, "Douban");
});
