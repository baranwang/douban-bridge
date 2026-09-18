import { asyncLocalStorage } from "@/libs/middleware";
import { type AgentMatchJob, runAgentMatchJob } from "./runner";

export async function handleAgentMatchBatch(
  batch: MessageBatch<AgentMatchJob>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> {
  return asyncLocalStorage.run({ env, ctx }, async () => {
    for (const message of batch.messages) {
      try {
        await runAgentMatchJob(message.body);
        message.ack();
      } catch (error) {
        console.warn("agent match job failed", error);
        message.retry();
      }
    }
  });
}
