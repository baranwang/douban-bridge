import { and, eq } from "drizzle-orm";
import { doubanMapping } from "@/db";
import { api } from "@/libs/api";
import { getContext } from "@/libs/middleware";
import { CandidateRegistry } from "./candidates";
import { AGENT_MATCH_SYSTEM_PROMPT, DEFAULT_AGENT_MATCH_MODEL } from "./prompt";
import { createAgentMatchTools, type AgentTool } from "./tools";
import { verifyConcludeMatch } from "./verifier";
import { applyAgentVerdict } from "./writer";

export type AgentMatchJob = {
  doubanId: number;
  mappingRevision: number;
  agentToken: string;
  agentInputHash: string;
};

export const agentMatchRuntime = {
  async runPiSession(input: {
  system: string;
  user: string;
  tools: AgentTool[];
}): Promise<void> {
  const [{ Agent }, { createModels }, { Type }] = await Promise.all([
    import("@earendil-works/pi-agent-core"),
    import("@earendil-works/pi-ai"),
    import("typebox"),
  ]);
  const env = getContext().env;
  const models = createModels();
  const modelId = env.AGENT_MATCH_MODEL || DEFAULT_AGENT_MATCH_MODEL;
  const model = models.getModel("openrouter", modelId) ?? models.getModel("openai", modelId);
  if (!model) {
    throw new Error(`Unknown agent match model: ${modelId}`);
  }
  const agent = new Agent({
    streamFn: models.streamSimple,
    getApiKey: (provider: string) => {
      if (provider === "openrouter") return env.OPENROUTER_API_KEY;
      return undefined;
    },
    initialState: {
      systemPrompt: input.system,
      model,
      thinkingLevel: "off",
      tools: input.tools.map((tool) => {
        const schemaProperties = (tool.parameters.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>;
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
  },
};

export async function runPiSession(input: {
  system: string;
  user: string;
  tools: AgentTool[];
}): Promise<void> {
  return agentMatchRuntime.runPiSession(input);
}

export async function runAgentMatchJob(job: AgentMatchJob): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const claimed = await api.db
    .update(doubanMapping)
    .set({ agentState: "running" })
    .where(
      and(
        eq(doubanMapping.doubanId, job.doubanId),
        eq(doubanMapping.agentToken, job.agentToken),
        eq(doubanMapping.mappingRevision, job.mappingRevision),
      ),
    )
    .returning({
      doubanId: doubanMapping.doubanId,
      imdbId: doubanMapping.imdbId,
    });
  if (claimed.length === 0) return "stale";

  const detail = await api.doubanAPI.getSubjectDetail(job.doubanId);
  const registry = new CandidateRegistry();
  const tools = createAgentMatchTools(registry, { doubanType: detail.type, doubanId: job.doubanId });
  let concluded = false;
  let lastStatus: "written" | "suggested" | "no_match" | "stale" = "no_match";

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
      concluded = true;
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
          imdbId: claimed[0].imdbId,
        },
      });
      lastStatus = await applyAgentVerdict({
        doubanId: job.doubanId,
        expectedRevision: job.mappingRevision,
        agentToken: job.agentToken,
        verdict,
        confidence,
        reason,
      });
      return { status: lastStatus, code: verdict.code };
    },
  };

  await agentMatchRuntime.runPiSession({
    system: AGENT_MATCH_SYSTEM_PROMPT,
    user: `请匹配豆瓣条目 ${job.doubanId}。标题：${detail.title}。年份：${detail.year ?? "未知"}。类型：${detail.type}。`,
    tools: [...tools, concludeTool],
  });

  if (!concluded) {
    lastStatus = await applyAgentVerdict({
      doubanId: job.doubanId,
      expectedRevision: job.mappingRevision,
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
          imdbId: claimed[0].imdbId,
        },
      }),
      confidence: 0,
      reason: "agent_no_conclusion",
    });
  }
  return lastStatus;
}
