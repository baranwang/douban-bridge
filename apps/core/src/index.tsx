import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { scheduled } from "./cron";
import { handleAgentMatchBatch } from "./libs/agent-match/queue";
import { internalStremio } from "./routes/internal-stremio";

export class StremioEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  fetch(request: Request) {
    return internalStremio.fetch(request, this.env, this.ctx);
  }
}

export default {
  fetch: app.fetch,
  scheduled,
  queue: handleAgentMatchBatch,
};
