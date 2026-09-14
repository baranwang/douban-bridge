import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pluginRexWidget } from "@rexnow/rslib-plugin";
import { defineConfig, type Rsbuild } from "@rslib/core";

const BUNDLE = "douban-bridge.js";

/** @rexnow/rslib-plugin 3.0.0 reads top-level stats.assets; Rslib 1.0 puts them on children. */
function pluginRexWidgetScript(): Rsbuild.RsbuildPlugin {
  return {
    name: "rex-widget-script",
    setup(api) {
      api.onAfterBuild(async () => {
        const file = join(api.context.distPath, BUNDLE);
        const code = await readFile(file, "utf8");
        await writeFile(file, code.replace(/^export \{[^;]+\};\s*$/gm, ""));
      });
    },
  };
}

export default defineConfig({
  plugins: [pluginRexWidget(), pluginRexWidgetScript()],
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
          js: BUNDLE,
        },
        autoExternal: false,
      },
    },
  ],
});
