import { readFile, writeFile } from "node:fs/promises";
import { build } from "vite";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
await build({
  configFile: false,
  build: {
    outDir: "dist",
    lib: {
      entry: "src/index.ts",
      name: "DoubanBridge",
      formats: ["iife"],
      fileName: () => "douban-bridge.js",
    },
  },
});
const bundle = await readFile("dist/douban-bridge.js", "utf8");
if (!bundle.includes(version)) throw new Error(`WidgetMetadata version does not match package.json ${version}`);
const manifest = {
  title: "Douban Bridge",
  description: "豆瓣影视列表与详情",
  icon: "https://stremio-addon-douban.baran.wang/icon.png",
  widgets: [
    {
      id: "douban.bridge",
      title: "豆瓣",
      version,
      requiredVersion: "0.0.1",
      author: "Baran",
      description: "豆瓣影视列表与详情",
      url: `https://github.com/baranwang/stremio-addon-douban/releases/download/widget-v${version}/douban-bridge.js`,
    },
  ],
};
await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
