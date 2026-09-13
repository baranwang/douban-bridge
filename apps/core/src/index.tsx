import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app";
import { scheduled } from "./cron";
import { internalApi } from "./routes/internal-api";

export class ApiEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  fetch(request: Request) {
    return internalApi.fetch(request, this.env, this.ctx);
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
