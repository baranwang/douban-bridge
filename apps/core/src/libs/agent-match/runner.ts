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

const LOG_MAX_CHARS = 2000;

function compact(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length <= LOG_MAX_CHARS ? text : `${text.slice(0, LOG_MAX_CHARS)}…`;
}

export function withAgentMatchStreamOptions<T extends { sessionId?: string; headers?: Record<string, unknown> }>(
  options: T,
  fallbackSessionId: string,
  baseHeaders: Record<string, unknown>,
): T & { sessionId: string; headers: Record<string, unknown> } {
  const sessionId = options.sessionId ?? fallbackSessionId;
  return {
    ...options,
    sessionId,
    headers: {
      ...baseHeaders,
      session_id: sessionId,
      "cf-aig-metadata": JSON.stringify({
        "session.id": sessionId,
        "langfuse.session.id": sessionId,
      }),
    },
  };
}

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODELS_CACHE_TTL_SECONDS = 6 * 60 * 60;

type OpenRouterModel = { id?: string; pricing?: Record<string, string> };

export function customCostHeaderFromOpenRouterPricing(
  pricing: Record<string, string> | undefined,
): string | undefined {
  if (!pricing) return undefined;
  const perTokenIn = Number(pricing.prompt);
  const perTokenOut = Number(pricing.completion);
  if (!Number.isFinite(perTokenIn) || !Number.isFinite(perTokenOut) || perTokenIn < 0 || perTokenOut < 0) {
    return undefined;
  }
  const cost: Record<string, number> = { per_token_in: perTokenIn, per_token_out: perTokenOut };
  const cacheRead = Number(pricing.input_cache_read);
  if (Number.isFinite(cacheRead) && cacheRead >= 0) cost.per_cache_read_token = cacheRead;
  const cacheWrite = Number(pricing.input_cache_write);
  if (Number.isFinite(cacheWrite) && cacheWrite >= 0) cost.per_cache_write_token = cacheWrite;
  return JSON.stringify(cost);
}

export function openRouterModelBySlug(models: OpenRouterModel[], modelId: string): OpenRouterModel | undefined {
  return models.find((item) => item.id?.split("/")[1] === modelId);
}

async function openRouterCustomCostHeader(modelId: string): Promise<string | undefined> {
  const cacheKey = new Request("https://cache.internal/openrouter/models");
  const cached = await caches.default.match(cacheKey);
  let models: OpenRouterModel[] | undefined = cached ? await cached.json() : undefined;
  if (!models) {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL);
      if (!response.ok) return undefined;
      const body = (await response.json()) as { data?: OpenRouterModel[] };
      models = body.data ?? [];
    } catch {
      return undefined;
    }
    getContext().ctx.waitUntil(
      caches.default.put(
        cacheKey,
        new Response(JSON.stringify(models), {
          headers: { "Cache-Control": `public, max-age=${OPENROUTER_MODELS_CACHE_TTL_SECONDS}` },
        }),
      ),
    );
  }
  return customCostHeaderFromOpenRouterPricing(openRouterModelBySlug(models, modelId)?.pricing);
}

export function assistantMessageText(message: { role?: string; content?: unknown }): string | undefined {
  if (message.role !== "assistant") return undefined;
  const content = message.content;
  if (typeof content === "string") return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((part) =>
      part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string"
        ? [(part as { text: string }).text]
        : [],
    )
    .join("\n")
    .trim();
  return text || undefined;
}

type PiLogEvent = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  message?: {
    role?: string;
    content?: unknown;
    stopReason?: string;
    rawStopReason?: string;
    errorMessage?: string;
  };
  toolResults?: Array<{ toolName?: string; isError?: boolean; content?: unknown }>;
};

function toolCallParts(content: unknown): Array<{ id?: unknown; name?: unknown; arguments?: unknown }> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) =>
    part && typeof part === "object" && (part as { type?: string }).type === "toolCall"
      ? [part as { id?: unknown; name?: unknown; arguments?: unknown }]
      : [],
  );
}

export function logPiAgentEvent(doubanId: number, event: PiLogEvent): void {
  if (event.type === "tool_execution_start") {
    logAgentMatch(doubanId, "pi_tool_start", {
      tool: event.toolName,
      toolCallId: event.toolCallId,
      args: compact(event.args),
    });
    return;
  }
  if (event.type === "tool_execution_end") {
    logAgentMatch(doubanId, "pi_tool_end", {
      tool: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError ?? false,
      result: compact(event.result),
    });
    return;
  }
  if (event.type !== "turn_end") return;
  logAgentMatch(doubanId, "turn_end", {
    stopReason: event.message?.stopReason ?? null,
    rawStopReason: event.message?.rawStopReason ?? null,
    errorMessage: event.message?.errorMessage ?? null,
    toolCalls: toolCallParts(event.message?.content).map((part) => ({
      id: part.id,
      name: part.name,
      args: compact(part.arguments),
    })),
    toolResults: (event.toolResults ?? []).map((result) => ({
      tool: result.toolName,
      isError: result.isError ?? false,
      content: compact(result.content),
    })),
  });
}

function logAgentMatch(doubanId: number, event: string, extra: Record<string, unknown> = {}): void {
  console.info("agent-match", { doubanId, event, ...extra });
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function seedGetDoubanSubjectMessages(input: {
  doubanId: number;
  model: string;
  subject: Record<string, unknown>;
}) {
  const toolCallId = "get-douban-subject";
  const timestamp = Date.now();
  return [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: `请匹配豆瓣条目 ${input.doubanId}。` }],
      timestamp,
    },
    {
      role: "assistant" as const,
      content: [
        {
          type: "toolCall" as const,
          id: toolCallId,
          name: "get_douban_subject",
          arguments: { doubanId: input.doubanId },
        },
      ],
      api: "openai-responses" as const,
      provider: "agent-match",
      model: input.model,
      usage: EMPTY_USAGE,
      stopReason: "toolUse" as const,
      timestamp,
    },
    {
      role: "toolResult" as const,
      toolCallId,
      toolName: "get_douban_subject",
      content: [{ type: "text" as const, text: JSON.stringify(input.subject) }],
      details: input.subject,
      isError: false,
      timestamp,
    },
  ];
}

export const agentMatchRuntime = {
  async runPiSession(input: {
    system: string;
    user: string | ReturnType<typeof seedGetDoubanSubjectMessages>;
    tools: AgentTool[];
    sessionId: string;
    doubanId?: number;
  }): Promise<void> {
    const [{ Agent }, { Type, createModels, createProvider }, { openAIResponsesApi }, { CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL, createAiBindingFetch }] =
      await Promise.all([
        import("@earendil-works/pi-agent-core"),
        import("@earendil-works/pi-ai"),
        import("@earendil-works/pi-ai/api/openai-responses.lazy"),
        import("@earendil-works/pi-ai/api/cloudflare-ai-binding"),
      ]);
    const env = getContext().env;
    const modelId = env.AGENT_MATCH_MODEL;
    const gatewayId = env.AGENT_MATCH_GATEWAY_ID;
    const providerSlug = env.AGENT_MATCH_GATEWAY_PROVIDER;
    if (!modelId || !gatewayId || !providerSlug) {
      throw new Error("AGENT_MATCH_MODEL, AGENT_MATCH_GATEWAY_ID, and AGENT_MATCH_GATEWAY_PROVIDER are required");
    }
    const baseUrl = `https://workers-binding.ai/ai-gateway/gateways/${gatewayId}/custom-${providerSlug}`;
    const aiFetch = createAiBindingFetch(env.AI);
    const customCost = await openRouterCustomCostHeader(modelId);
    const streamHeaders = {
      "cf-aig-authorization": `Bearer ${CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL}`,
      Authorization: null,
      "x-api-key": null,
      ...(customCost ? { "cf-aig-custom-cost": customCost } : {}),
    };
    const models = createModels();
    models.setProvider(
      createProvider({
        id: "agent-match",
        name: "Agent match",
        baseUrl,
        auth: {
          apiKey: {
            name: "Agent match gateway binding",
            resolve: async () => ({
              auth: {
                headers: {
                  "cf-aig-authorization": `Bearer ${CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL}`,
                  Authorization: null,
                  "x-api-key": null,
                },
              },
              source: "gateway binding",
            }),
          },
        },
        models: [
          {
            id: modelId,
            name: modelId,
            api: "openai-responses",
            provider: "agent-match",
            baseUrl,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
          },
        ],
        api: openAIResponsesApi(),
      }),
    );
    const model = models.getModel("agent-match", modelId);
    if (!model) {
      throw new Error(`Unknown agent match model: ${modelId}`);
    }
    const doubanId = input.doubanId ?? Number(input.sessionId.split(":").at(-1));
    logAgentMatch(doubanId, "prompt", { sessionId: input.sessionId, user: compact(input.user) });
    const agent = new Agent({
      streamFn: (model, context, options) =>
        models.streamSimple(
          model,
          context,
          withAgentMatchStreamOptions({ ...options, fetch: aiFetch }, input.sessionId, streamHeaders),
        ),
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
    agent.subscribe((event) => {
      logPiAgentEvent(doubanId, event);
      if (event.type === "message_end") {
        const text = assistantMessageText(event.message);
        if (text) logAgentMatch(doubanId, "assistant", { text: compact(text) });
        return;
      }
      if (event.type === "agent_end") {
        logAgentMatch(doubanId, "session_end", {
          messages: event.messages.length,
          error: agent.state.errorMessage ?? null,
        });
      }
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
  user: string | ReturnType<typeof seedGetDoubanSubjectMessages>;
  tools: AgentTool[];
  sessionId: string;
  doubanId?: number;
}): Promise<void> {
  return agentMatchRuntime.runPiSession(input);
}

export async function runAgentMatchJob(job: AgentMatchJob): Promise<"written" | "suggested" | "no_match" | "stale"> {
  const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, job.doubanId) });
  if (!row || row.deletedAt) {
    logAgentMatch(job.doubanId, "stale", { reason: "missing_row" });
    return "stale";
  }
  const blob = parseAgent(row.agent);
  const now = Date.now();
  if (blob?.token !== job.agentToken || row.calibrated === true || blob.status === "no_match") {
    logAgentMatch(job.doubanId, "stale", {
      reason: "claim_mismatch",
      calibrated: row.calibrated === true,
      status: blob?.status ?? null,
    });
    return "stale";
  }

  const extended = await api.db
    .update(doubanMapping)
    .set({ agent: serializeAgent({ ...blob, token: job.agentToken, leaseUntil: now + AGENT_LEASE_MS }) })
    .where(and(eq(doubanMapping.doubanId, job.doubanId), eq(doubanMapping.agent, row.agent)))
    .returning({ doubanId: doubanMapping.doubanId });
  if (extended.length === 0) {
    logAgentMatch(job.doubanId, "stale", { reason: "lease_lost" });
    return "stale";
  }

  const detail = await api.doubanAPI.getSubjectDetail(job.doubanId);
  logAgentMatch(job.doubanId, "start", {
    title: detail.title,
    originalTitle: detail.original_title ?? null,
    year: detail.year ?? null,
    type: detail.type,
  });
  const registry = new CandidateRegistry();
  const tools = createAgentMatchTools(registry, { doubanType: detail.type, doubanId: job.doubanId });
  let persisted = false;
  let operationalError: Error | undefined;
  let lastStatus: "written" | "suggested" | "no_match" | "stale" = "stale";
  const wrapTool = (tool: AgentTool): AgentTool => ({
    ...tool,
    async execute(args) {
      if (operationalError) throw operationalError;
      logAgentMatch(job.doubanId, "tool_start", { tool: tool.name, args: compact(args) });
      try {
        const result = await tool.execute(args);
        logAgentMatch(job.doubanId, "tool_end", { tool: tool.name, result: compact(result) });
        return result;
      } catch (error) {
        operationalError = error instanceof Error ? error : new Error(String(error));
        logAgentMatch(job.doubanId, "tool_error", {
          tool: tool.name,
          error: operationalError.message,
        });
        throw operationalError;
      }
    },
  });

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

  const wrappedTools = [...tools, concludeTool].map(wrapTool);
  const getSubject = wrappedTools.find((tool) => tool.name === "get_douban_subject");
  if (!getSubject) throw new Error("get_douban_subject tool is required");
  const subject = await getSubject.execute({ doubanId: job.doubanId });
  await agentMatchRuntime.runPiSession({
    system: AGENT_MATCH_SYSTEM_PROMPT,
    user: seedGetDoubanSubjectMessages({
      doubanId: job.doubanId,
      model: getContext().env.AGENT_MATCH_MODEL ?? "grok-4.6",
      subject,
    }),
    tools: wrappedTools,
    sessionId: `douban-match:${job.doubanId}`,
    doubanId: job.doubanId,
  });
  if (operationalError) throw operationalError;

  if (!persisted) {
    logAgentMatch(job.doubanId, "no_conclusion");
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
  logAgentMatch(job.doubanId, "done", { status: lastStatus });
  return lastStatus;
}
