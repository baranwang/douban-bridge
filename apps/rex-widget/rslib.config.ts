import { pluginRexWidget } from "@rexnow/rslib-plugin";
import { defineConfig } from "@rslib/core";

export default defineConfig({
  plugins: [pluginRexWidget()],
  source: {
    entry: {
      "douban-bridge": "./src/index.ts",
    },
  },
  lib: [
    {
      format: "esm",
      syntax: ["node 18"],
      bundle: true,
      autoExtension: false,
      dts: false,
      output: {
        target: "web",
        filename: {
          js: "douban-bridge.js",
        },
        autoExternal: false,
      },
    },
  ],
});
