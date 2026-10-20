import { asyncLocalStorage } from "@/libs/middleware";
import { AGENT_MATCH_MAX_ATTEMPTS } from "./constants";
import { type AgentMatchJob, runAgentMatchJob } from "./runner";
import { agentMatchWriter } from "./writer";

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
        const reason = error instanceof Error ? error.message : String(error);
        const final = message.attempts >= AGENT_MATCH_MAX_ATTEMPTS;
        console.warn("agent-match", {
          doubanId: message.body.doubanId,
          event: "failed",
          attempt: message.attempts,
          final,
          error: reason,
        });
        if (!final) {
          message.retry();
          continue;
        }
        try {
          await agentMatchWriter.markAgentFailed({ ...message.body, error: reason });
          message.ack();
        } catch (markError) {
          console.warn("agent-match", {
            doubanId: message.body.doubanId,
            event: "mark_failed_error",
            error: markError instanceof Error ? markError.message : String(markError),
          });
          message.retry();
        }
      }
    }
  });
}
