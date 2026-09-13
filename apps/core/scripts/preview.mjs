import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pointer = resolve(".wrangler/deploy/config.json");
const { configPath } = JSON.parse(readFileSync(pointer, "utf8"));
const config = resolve(dirname(pointer), configPath);
const child = spawn(
  "wrangler",
  [
    "dev",
    "--config",
    config,
    "--port",
    "8787",
    "--persist-to",
    "../../.wrangler/bridge-smoke",
    "--var",
    "STREMIO_ORIGIN:http://localhost:8788",
    "--var",
    "DASH_ORIGIN:http://localhost:8787",
    "--local-upstream",
    "localhost:8787",
  ],
  { stdio: "inherit" },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
