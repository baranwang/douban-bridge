import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_MATCH_MAX_TURNS } from "../src/libs/agent-match/constants";
import { agentMatchRuntime } from "../src/libs/agent-match/runner";
import type { AgentTool } from "../src/libs/agent-match/tools";
import { withTestContext } from "./context";

/** OpenAI Responses SSE for one assistant turn that calls `name` with `args`. */
function toolCallStream(turn: number, name: string, args: Record<string, unknown>): Response {
  const item = {
    type: "function_call",
    id: `fc_${turn}`,
    call_id: `call_${turn}`,
    name,
    arguments: JSON.stringify(args),
    status: "completed",
  };
  const response = { id: `resp_${turn}`, object: "response", model: "loop-model", status: "completed", output: [item] };
  const events = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
    { type: "response.function_call_arguments.done", output_index: 0, item_id: item.id, arguments: item.arguments },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: { ...response, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
    },
  ];
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function runWithModel(
  env: CloudflareBindings,
  pick: (turn: number) => { name: string; args: Record<string, unknown> },
  tools: AgentTool[],
) {
  let calls = 0;
  // workers-types' `Ai` omits the runtime `fetch` passthrough that createAiBindingFetch uses.
  const ai = {
    fetch: async () => {
      calls += 1;
      const { name, args } = pick(calls);
      return toolCallStream(calls, name, args);
    },
  } as unknown as Ai;
  env.AI = ai;
  env.AGENT_MATCH_GATEWAY_ID = "gateway";
  env.AGENT_MATCH_GATEWAY_PROVIDER = "test";
  await env.KV.put("AGENT_MATCH_MODEL", "loop-model");
  // Node has no Workers `caches`; serve an empty OpenRouter model list so pricing lookup stays offline.
  const cacheStorage = {
    default: { match: async () => Response.json([]), put: async () => {} },
  } as unknown as CacheStorage;
  const hadCaches = "caches" in globalThis;
  const previous = globalThis.caches;
  globalThis.caches = cacheStorage;
  try {
    const result = await agentMatchRuntime.runPiSession({
      system: "s",
      user: "u",
      tools,
      sessionId: "douban-match:1",
      doubanId: 1,
    });
    return { result, calls };
  } finally {
    if (hadCaches) globalThis.caches = previous;
    else Reflect.deleteProperty(globalThis, "caches");
  }
}

const lookup = (execute: AgentTool["execute"]): AgentTool => ({
  name: "lookup",
  description: "lookup",
  parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
  execute,
});

test("a model that never concludes stops at AGENT_MATCH_MAX_TURNS", async () => {
  await withTestContext(async (env) => {
    const { result, calls } = await runWithModel(env, () => ({ name: "lookup", args: { q: "x" } }), [
      lookup(async () => ({ ok: true })),
    ]);
    assert.equal(calls, AGENT_MATCH_MAX_TURNS);
    assert.deepEqual(result, { turnLimitReached: true });
  });
});

test("conclude_match runs after an earlier tool threw and ends the session", async () => {
  await withTestContext(async (env) => {
    const concluded: Record<string, unknown>[] = [];
    const conclude: AgentTool = {
      name: "conclude_match",
      description: "conclude",
      parameters: { type: "object", properties: { decision: { type: "string" } }, required: ["decision"] },
      execute: async (args) => {
        concluded.push(args);
        return { status: "no_match" };
      },
    };
    const { result, calls } = await runWithModel(
      env,
      (turn) =>
        turn === 1 ? { name: "lookup", args: { q: "x" } } : { name: "conclude_match", args: { decision: "none" } },
      [
        lookup(async () => {
          throw new Error("Request failed with status code 404");
        }),
        conclude,
      ],
    );
    assert.deepEqual(concluded, [{ decision: "none" }]);
    assert.equal(calls, 2);
    assert.deepEqual(result, { turnLimitReached: false });
  });
});
