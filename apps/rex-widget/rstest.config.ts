import { defineConfig } from "@rstest/core";
import pkg from "./package.json";

export default defineConfig({
  testEnvironment: "node",
  setupFiles: ["./scripts/rstest.setup.ts"],
  source: {
    define: {
      "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  },
});
