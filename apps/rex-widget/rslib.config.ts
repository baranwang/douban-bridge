import { pluginRexWidget } from "@rexnow/rslib-plugin";
import { defineConfig } from "@rslib/core";
import pkg from "./package.json";

export default defineConfig({
  source: {
    define: {
      "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
      "import.meta.rstest": false,
    },
  },
  lib: [
    {
      format: "esm",
      syntax: "es6",
      bundle: true,
      autoExtension: false,
      dts: false,
      source: {
        entry: {
          "douban-bridge": "./src/index.ts",
        },
      },
    },
  ],
  output: {
    target: "web",
    autoExternal: false,
    minify: {
      jsOptions: {
        minimizerOptions: {
          mangle: true,
          minify: false,
          compress: true,
          format: {
            comments: false,
          },
        },
      },
    },
  },
  tools: {
    rspack: {
      optimization: {
        moduleIds: "deterministic",
      },
    },
  },
  plugins: [pluginRexWidget()],
});
