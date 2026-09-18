import { and, eq } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { getContext } from "@/libs/middleware";
import { parseAgent, serializeAgent } from "./blob";
import { CandidateRegistry } from "./candidates";
import { AGENT_LEASE_MS } from "./constants";
import { AGENT_MATCH_SYSTEM_PROMPT } from "./prompt";
import { type AgentTool, createAgentMatchTools } from "./tools";
import type { AgentMatchJob } from "./types";
import { verifyConcludeMatch } from "./verifier";
import { agentMatchWriter } from "./writer";

export type { AgentMatchJob } from "./types";

export const agentMatchRuntime = {
  async runPiSession(input: { system: string; user: string; tools: AgentTool[]; sessionId: string }): Promise<void> {
    const [{ Agent }, { createModels, createProvider }, { openAICompletionsApi }, { Type }] = await Promise.all([
      import("@earendil-works/pi-agent-core"),
      import("@earendil-works/pi-ai"),
      import("@earendil-works/pi-ai/api/openai-completions.lazy"),
      import("typebox"),
    ]);
    const env = getContext().env;
    const baseUrl = env.AGENT_MATCH_BASE_URL?.replace(/\/+$/, "");
    const apiKey = (env as CloudflareBindings & { AGENT_MATCH_API_KEY?: string }).AGENT_MATCH_API_KEY;
    const modelId = env.AGENT_MATCH_MODEL;
    if (!baseUrl || !apiKey || !modelId) {
      throw new Error("AGENT_MATCH_BASE_URL, AGENT_MATCH_API_KEY, and AGENT_MATCH_MODEL are required");
    }
    const models = createModels();
    models.setProvider(
      createProvider({
        id: "agent-match",
        name: "Agent match",
        baseUrl,
        auth: {
          apiKey: {
            name: "Agent match API key",
            resolve: async () => ({ auth: { apiKey } }),
          },
        },
        models: [
          {
            id: modelId,
            name: modelId,
            api: "openai-completions",
            provider: "agent-match",
            baseUrl,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
            compat: { sendSessionAffinityHeaders: true },
          },
        ],
        api: openAICompletionsApi(),
      }),
    );
    const model = models.getModel("agent-match", modelId);
    if (!model) {
      throw new Error(`Unknown agent match model: ${modelId}`);
    }
    const agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      sessionId: input.sessionId,
      initialState: {
        systemPrompt: input.system,
        model,
        thinkingLevel: "off",
        tools: input.tools.map((tool) => {
          const schemaProperties = (tool.parameters.properties ?? {}) as Record<
            string,
            { type?: string; enum?: string[] }
          >;
          const required = new Set((tool.parameters.required as string[] | undefined) ?? []);
          const objectProperties: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(schemaProperties)) {
            let property = value.enum ? Type.String({ enum: value.enum }) : Type.String();
            if (value.type === "number") property = Type.Number();
            objectProperties[key] = required.has(key) ? property : Type.Optional(property);
          }
          return {
            name: tool.name,
            label: tool.name,
            description: tool.description,
            parameters: Type.Object(objectProperties),
            async execute(_toolCallId: string, params: Record<string, unknown>) {
              const details = await tool.execute(params);
              return {
                content: [{ type: "text" as const, text: JSON.stringify(details) }],
                details,
                terminate: tool.name === "conclude_match",
              };
            },
          };
        }),
      },
    });
    await agent.prompt(input.user);
    await agent.waitForIdle();
    if (agent.state.errorMessage) {
      throw new Error(agent.state.errorMessage);
    }
  },
};

export async function runPiSession(input: {
  system: string;
  user: string;
  tools: AgentTool[];
  sessionId: string;
}): Promise<void> {
  return agentMatchRuntime.runPiSession(input);
}

export async function runAgentMatchJob(job: AgentMatchJob): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, job.doubanId) });
  if (!row) return "stale";
  const blob = parseAgent(row.agent);
  const now = Date.now();
  if (
    blob?.token !== job.agentToken ||
    row.calibrated === true ||
    blob.status === "suggested" ||
    blob.status === "no_match"
  ) {
    return "stale";
  }

  const extended = await api.db
    .update(doubanMapping)
    .set({ agent: serializeAgent({ ...blob, token: job.agentToken, leaseUntil: now + AGENT_LEASE_MS }) })
    .where(and(eq(doubanMapping.doubanId, job.doubanId), eq(doubanMapping.agent, row.agent)))
    .returning({ doubanId: doubanMapping.doubanId });
  if (extended.length === 0) return "stale";

  const detail = await api.doubanAPI.getSubjectDetail(job.doubanId);
  const registry = new CandidateRegistry();
  const tools = createAgentMatchTools(registry, { doubanType: detail.type, doubanId: job.doubanId });
  let persisted = false;
  let operationalError: Error | undefined;
  let lastStatus: "written" | "suggested" | "no_match" | "stale" = "stale";

  const currentImdbId = async () =>
    (await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, job.doubanId) }))?.imdbId ?? null;

  const concludeTool: AgentTool = {
    name: "conclude_match",
    description: "Submit the final match decision for the current Douban subject.",
    parameters: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["match", "none"] },
        candidateId: { type: "string" },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["decision", "confidence", "reason"],
    },
    async execute(args) {
      try {
        const decision = args.decision === "match" ? "match" : "none";
        const confidence = Number(args.confidence);
        const reason = String(args.reason ?? "");
        const verdict = verifyConcludeMatch({
          decision,
          candidateId: args.candidateId ? String(args.candidateId) : undefined,
          confidence,
          reason,
          registry,
          douban: {
            type: detail.type,
            title: detail.title,
            originalTitle: detail.original_title,
            year: detail.year,
            imdbId: await currentImdbId(),
          },
        });
        lastStatus = await agentMatchWriter.applyAgentVerdict({
          doubanId: job.doubanId,
          agentToken: job.agentToken,
          verdict,
          confidence,
          reason,
        });
        persisted = true;
        return { status: lastStatus, code: verdict.code };
      } catch (error) {
        operationalError = error instanceof Error ? error : new Error(String(error));
        throw operationalError;
      }
    },
  };

  await agentMatchRuntime.runPiSession({
    system: AGENT_MATCH_SYSTEM_PROMPT,
    user: `请匹配豆瓣条目 ${job.doubanId}。标题：${detail.title}。年份：${detail.year ?? "未知"}。类型：${detail.type}。`,
    tools: [...tools, concludeTool],
    sessionId: `douban-match:${job.doubanId}`,
  });
  if (operationalError) throw operationalError;

  if (!persisted) {
    lastStatus = await agentMatchWriter.applyAgentVerdict({
      doubanId: job.doubanId,
      agentToken: job.agentToken,
      verdict: verifyConcludeMatch({
        decision: "none",
        confidence: 0,
        reason: "agent_no_conclusion",
        registry,
        douban: {
          type: detail.type,
          title: detail.title,
          originalTitle: detail.original_title,
          year: detail.year,
          imdbId: await currentImdbId(),
        },
      }),
      confidence: 0,
      reason: "agent_no_conclusion",
    });
  }
  return lastStatus;
}
