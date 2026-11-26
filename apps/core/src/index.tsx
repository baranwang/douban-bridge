import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { internalStremio } from "./routes/internal-stremio";

export class StremioEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  fetch(request: Request) {
    return internalStremio.fetch(request, this.env, this.ctx);
  }
}

export default {
  fetch: app.fetch,
  // shortcut: 线上 Worker 仍挂着 douban-agent-match 的 consumer，预览版本上传要求保留 queue 入口；生产 deploy 摘掉 consumer 后删除。
  queue: (batch: MessageBatch) => batch.ackAll(),
};
