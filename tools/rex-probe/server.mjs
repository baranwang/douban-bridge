import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
const counts = new Map();
createServer(async (req, res) => {
  const origin = `http://${req.headers.host}`;
  const path = new URL(req.url, origin).pathname;
  counts.set(path, (counts.get(path) || 0) + 1);
  console.log(
    JSON.stringify({
      pathname: path,
      count: counts.get(path),
      authenticated: req.headers.authorization === "Bearer probe-a",
    }),
  );
  res.setHeader("Cache-Control", "no-store");
  if (path === "/probe.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(await readFile(new URL("./probe.js", import.meta.url)));
    return;
  }
  if (path === "/poster.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#123456"/><text x="40" y="450" fill="white" font-size="64">CLOUD V2</text></svg>',
    );
    return;
  }
  if (path === "/fail") {
    res.writeHead(503).end();
    return;
  }
  if (path === "/slow") await new Promise((resolve) => setTimeout(resolve, 45000));
  if (!["/item", "/meta/1292052", "/slow"].includes(path)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      id: "1292052",
      type: "detail",
      title: "云端探针标题 V2",
      mediaType: "movie",
      description: path.startsWith("/meta/") ? "cloud-detail-v2" : "cloud-list-v2",
      rating: "8.8",
      posterPath: `${origin}/poster.svg`,
      backdropPath: `${origin}/poster.svg`,
      link: `${origin}/meta/1292052`,
    }),
  );
}).listen(8789, "0.0.0.0", () => {
  for (const entries of Object.values(networkInterfaces()))
    for (const entry of entries || [])
      if (entry.family === "IPv4" && !entry.internal) console.log(`http://${entry.address}:8789/probe.js`);
});
