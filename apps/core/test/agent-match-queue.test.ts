import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { eq } from "drizzle-orm";
import { scheduled } from "../src/cron";
import { doubanMapping } from "../src/db";
import { AGENT_MATCH_HOURLY_LIMIT } from "../src/libs/agent-match/constants";
import { handleAgentMatchBatch } from "../src/libs/agent-match/queue";
import * as runner from "../src/libs/agent-match/runner";
import { api } from "../src/libs/api";
import { withTestContext } from "./context";

test("customCostHeaderFromOpenRouterPricing maps OpenRouter prices", () => {
  const cost = JSON.parse(
    runner.customCostHeaderFromOpenRouterPricing({
      prompt: "0.000002",
      completion: "0.000006",
      input_cache_read: "0.0000005",
      input_cache_write: "0.0000025",
    }) ?? "{}",
  );
  assert.equal(cost.per_token_in, 0.000002);
  assert.equal(cost.per_token_out, 0.000006);
  assert.equal(cost.per_cache_read_token, 5e-7);
  assert.equal(cost.per_cache_write_token, 0.0000025);
  assert.equal(runner.openRouterModelBySlug([{ id: "x-ai/grok-4.6" }], "grok-4.6")?.id, "x-ai/grok-4.6");
  assert.equal(runner.customCostHeaderFromOpenRouterPricing({ prompt: "nope", completion: "0" }), undefined);
});

test("withAgentMatchStreamOptions forwards sessionId for aio-proxy Responses", () => {
  const options = runner.withAgentMatchStreamOptions(
    { temperature: 0, headers: { Authorization: null } },
    "douban-match:37134256",
    { "cf-aig-authorization": "Bearer cloudflare-gateway-binding" },
  );
  assert.equal(options.sessionId, "douban-match:37134256");
  assert.equal(options.headers.session_id, "douban-match:37134256");
  assert.equal(options.headers["cf-aig-authorization"], "Bearer cloudflare-gateway-binding");
});

test("assistantMessageText keeps only assistant text", () => {
  assert.equal(runner.assistantMessageText({ role: "user", content: "hi" }), undefined);
  assert.equal(runner.assistantMessageText({ role: "assistant", content: "  ok  " }), "ok");
  assert.equal(
    runner.assistantMessageText({
      role: "assistant",
      content: [{ type: "text", text: "hello" }, { type: "toolCall" }, { type: "text", text: "world" }],
    }),
    "hello\nworld",
  );
});

test("logPiAgentEvent records validation failures that never reach wrapTool", () => {
  const logs: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    runner.logPiAgentEvent(33459999, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "conclude_match",
      args: { type: "show", query: "Magnolia Awards" },
    });
    runner.logPiAgentEvent(33459999, {
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "conclude_match",
      isError: true,
      result: { content: [{ type: "text", text: 'Validation failed for tool "conclude_match"' }] },
    });
    runner.logPiAgentEvent(33459999, {
      type: "turn_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "conclude_match",
            arguments: { type: "show", query: "Magnolia Awards" },
          },
        ],
      },
      toolResults: [
        {
          toolName: "conclude_match",
          isError: true,
          content: [{ type: "text", text: 'Validation failed for tool "conclude_match"' }],
        },
      ],
    });
    const events = logs
      .filter((args) => args[0] === "agent-match" && typeof args[1] === "object" && args[1] !== null)
      .map((args) => args[1] as { event: string; tool?: string; isError?: boolean; toolCalls?: Array<{ name?: string }> });
    assert.equal(events[0]?.event, "pi_tool_start");
    assert.equal(events[0]?.tool, "conclude_match");
    assert.equal(events[1]?.event, "pi_tool_end");
    assert.equal(events[1]?.isError, true);
    assert.equal(events[2]?.event, "turn_end");
    assert.equal(events[2]?.toolCalls?.[0]?.name, "conclude_match");
  } finally {
    console.info = originalInfo;
  }
});

type AgentJob = {
  doubanId: number;
  agentToken: string;
};

function mockQueue(env: CloudflareBindings, sent: AgentJob[]) {
  env.AGENT_MATCH_QUEUE = {
    send: async (body: AgentJob) => {
      sent.push(body);
      return { metadata: { metrics: { retries: 0 } } };
    },
  } as Queue<AgentJob>;
}

function executionContext(pending: Promise<unknown>[]) {
  return {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    passThroughOnException() {},
  } as ExecutionContext;
}

test("cron claims unmatched leftovers and sends at most the hourly limit", async () => {
  await withTestContext(async (env) => {
    try {
      const sent: AgentJob[] = [];
      mockQueue(env, sent);
      await api.db.insert(doubanMapping).values([{ doubanId: 31 }, { doubanId: 32 }, { doubanId: 33 }]);
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "movie",
        title: "重名电影",
        original_title: "Same",
        year: "2010",
      }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "movie" as const, movie: { title: "A", year: 2011, ids: { trakt: 1, tmdb: 1, imdb: "tt1" } } },
        { type: "movie" as const, movie: { title: "B", year: 2012, ids: { trakt: 2, tmdb: 2, imdb: "tt2" } } },
      ]);
      const pending: Promise<unknown>[] = [];
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, executionContext(pending));
      await Promise.all(pending);
      assert.ok(sent.length > 0);
      assert.ok(sent.length <= AGENT_MATCH_HOURLY_LIMIT);
      assert.ok(sent.length <= 3);
    } finally {
      mock.restoreAll();
    }
  });
});

test("suggested rows are not enqueued", async () => {
  await withTestContext(async (env) => {
    try {
      const sent: AgentJob[] = [];
      mockQueue(env, sent);
      await api.db
        .insert(doubanMapping)
        .values({ doubanId: 34, agent: JSON.stringify({ status: "suggested", tmdbId: 10 }) });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({ type: "movie", title: "建议片" }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "movie" as const, movie: { ids: { trakt: 1, tmdb: 1 } } },
        { type: "movie" as const, movie: { ids: { trakt: 2, tmdb: 2 } } },
      ]);
      const pending: Promise<unknown>[] = [];
      await scheduled({ scheduledTime: 0, cron: "0 * * * *", noRetry() {} }, env, executionContext(pending));
      await Promise.all(pending);
      assert.equal(sent.length, 0);
    } finally {
      mock.restoreAll();
    }
  });
});

test("queue consumer writes high-confidence matches and acks", async () => {
  await withTestContext(async (env) => {
    const logs: unknown[][] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      await api.db.insert(doubanMapping).values({
        doubanId: 35,
        agent: JSON.stringify({ token: "tok-35", leaseUntil: Date.now() + 60_000 }),
      });
      mock.method((await import("../src/libs/api/tmdb")).TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(
        runner.agentMatchRuntime,
        "runPiSession",
        async (input: {
          tools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }>;
        }) => {
          const search = input.tools.find((tool) => tool.name === "search_tmdb");
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          const searched = (await search?.execute({ type: "movie", query: "Inception", year: "2010" })) as {
            results: Array<{ candidateId: string }>;
          };
          await conclude?.execute({
            decision: "match",
            candidateId: searched.results[0].candidateId,
            confidence: 0.95,
            reason: "原名一致",
          });
        },
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 35,
        type: "movie",
        title: "盗梦空间",
        original_title: "Inception",
        year: "2010",
      }));
      let acked = false;
      let retried = false;
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: { doubanId: 35, agentToken: "tok-35" },
              ack() {
                acked = true;
              },
              retry() {
                retried = true;
              },
            },
          ],
        } as unknown as MessageBatch<AgentJob>,
        env,
        executionContext([]),
      );
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 35) });
      assert.equal(row?.tmdbId, 27205);
      assert.equal(acked, true);
      assert.equal(retried, false);
      const events = logs
        .filter((args) => args[0] === "agent-match" && typeof args[1] === "object" && args[1] !== null)
        .map((args) => args[1] as { doubanId: number; event: string; tool?: string });
      assert.equal(events[0]?.event, "start");
      assert.equal(events[0]?.doubanId, 35);
      assert.ok(events.some((event) => event.event === "tool_start" && event.tool === "search_tmdb"));
      assert.ok(events.some((event) => event.event === "tool_end" && event.tool === "conclude_match"));
      assert.ok(events.some((event) => event.event === "done"));
    } finally {
      console.info = originalInfo;
      mock.restoreAll();
    }
  });
});

test("cron awaits deterministic persist before enqueueing", async () => {
  await withTestContext(async (env) => {
    try {
      const sent: AgentJob[] = [];
      mockQueue(env, sent);
      await api.db.insert(doubanMapping).values({ doubanId: 36 });
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        type: "movie",
        title: "独一电影",
        original_title: "Only Movie",
        year: "2011",
      }));
      mock.method(api.traktAPI, "search", async () => [
        { type: "movie" as const, movie: { ids: { trakt: 8, tmdb: 88, imdb: "tt88" } } },
      ]);
      let releasePersist!: () => void;
      const persistGate = new Promise<void>((resolve) => {
        releasePersist = resolve;
      });
      const originalPersist = api.persistIdMapping.bind(api);
      mock.method(api, "persistIdMapping", async (...args: Parameters<typeof api.persistIdMapping>) => {
        await persistGate;
        return originalPersist(...args);
      });
      const pending: Promise<unknown>[] = [];
      const cronPromise = scheduled(
        { scheduledTime: 0, cron: "0 * * * *", noRetry() {} },
        env,
        executionContext(pending),
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(sent.length, 0);
      releasePersist();
      await cronPromise;
      await Promise.all(pending);
      assert.equal(sent.length, 0);
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 36) });
      assert.equal(row?.tmdbId, 88);
    } finally {
      mock.restoreAll();
    }
  });
});

test("queue retries when persist throws after conclude_match starts", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({
        doubanId: 37,
        agent: JSON.stringify({ token: "tok-37", leaseUntil: Date.now() + 60_000 }),
      });
      mock.method((await import("../src/libs/api/tmdb")).TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(
        runner.agentMatchRuntime,
        "runPiSession",
        async (input: {
          tools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }>;
        }) => {
          const search = input.tools.find((tool) => tool.name === "search_tmdb");
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          const searched = (await search?.execute({ type: "movie", query: "Inception", year: "2010" })) as {
            results: Array<{ candidateId: string }>;
          };
          const writer = await import("../src/libs/agent-match/writer");
          mock.method(writer.agentMatchWriter, "applyAgentVerdict", async () => {
            throw new Error("d1 down");
          });
          await conclude?.execute({
            decision: "match",
            candidateId: searched.results[0].candidateId,
            confidence: 0.95,
            reason: "原名一致",
          });
        },
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 37,
        type: "movie",
        title: "盗梦空间",
        original_title: "Inception",
        year: "2010",
      }));
      let acked = false;
      let retried = false;
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: { doubanId: 37, agentToken: "tok-37" },
              ack() {
                acked = true;
              },
              retry() {
                retried = true;
              },
            },
          ],
        } as unknown as MessageBatch<AgentJob>,
        env,
        executionContext([]),
      );
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 37) });
      assert.equal(row?.tmdbId ?? null, null);
      assert.equal(acked, false);
      assert.equal(retried, true);
    } finally {
      mock.restoreAll();
    }
  });
});

test("queue consumer renews an expired lease before running", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({
        doubanId: 38,
        agent: JSON.stringify({ token: "tok-38", leaseUntil: Date.now() - 1 }),
      });
      mock.method((await import("../src/libs/api/tmdb")).TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(
        runner.agentMatchRuntime,
        "runPiSession",
        async (input: {
          tools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }>;
        }) => {
          const search = input.tools.find((tool) => tool.name === "search_tmdb");
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          const searched = (await search?.execute({ type: "movie", query: "Inception", year: "2010" })) as {
            results: Array<{ candidateId: string }>;
          };
          await conclude?.execute({
            decision: "match",
            candidateId: searched.results[0].candidateId,
            confidence: 0.95,
            reason: "原名一致",
          });
        },
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 38,
        type: "movie",
        title: "盗梦空间",
        original_title: "Inception",
        year: "2010",
      }));
      let acked = false;
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: { doubanId: 38, agentToken: "tok-38" },
              ack() {
                acked = true;
              },
              retry() {},
            },
          ],
        } as unknown as MessageBatch<AgentJob>,
        env,
        executionContext([]),
      );
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 38) });
      assert.equal(row?.tmdbId, 27205);
      assert.equal(acked, true);
    } finally {
      mock.restoreAll();
    }
  });
});

test("queue consumer suggests when a concurrent imdb appears mid-session", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({
        doubanId: 39,
        agent: JSON.stringify({ token: "tok-39", leaseUntil: Date.now() + 60_000 }),
      });
      mock.method((await import("../src/libs/api/tmdb")).TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(
        runner.agentMatchRuntime,
        "runPiSession",
        async (input: {
          tools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }>;
        }) => {
          const search = input.tools.find((tool) => tool.name === "search_tmdb");
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          const searched = (await search?.execute({ type: "movie", query: "Inception", year: "2010" })) as {
            results: Array<{ candidateId: string }>;
          };
          await api.db.update(doubanMapping).set({ imdbId: "tt-new" }).where(eq(doubanMapping.doubanId, 39));
          await conclude?.execute({
            decision: "match",
            candidateId: searched.results[0].candidateId,
            confidence: 0.95,
            reason: "原名一致",
          });
        },
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 39,
        type: "movie",
        title: "盗梦空间",
        original_title: "Inception",
        year: "2010",
      }));
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: { doubanId: 39, agentToken: "tok-39" },
              ack() {},
              retry() {},
            },
          ],
        } as unknown as MessageBatch<AgentJob>,
        env,
        executionContext([]),
      );
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 39) });
      assert.equal(row?.tmdbId ?? null, null);
      assert.equal(row?.imdbId, "tt-new");
      assert.equal(JSON.parse(row?.agent ?? "{}").status, "suggested");
    } finally {
      mock.restoreAll();
    }
  });
});

test("queue retries when a provider tool fails before conclusion", async () => {
  await withTestContext(async (env) => {
    try {
      await api.db.insert(doubanMapping).values({
        doubanId: 40,
        agent: JSON.stringify({ token: "tok-40", leaseUntil: Date.now() + 60_000 }),
      });
      mock.method((await import("../src/libs/api/tmdb")).TmdbAPI.prototype, "search", async () => {
        throw new Error("tmdb down");
      });
      mock.method(
        runner.agentMatchRuntime,
        "runPiSession",
        async (input: {
          tools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }>;
        }) => {
          const search = input.tools.find((tool) => tool.name === "search_tmdb");
          const conclude = input.tools.find((tool) => tool.name === "conclude_match");
          await assert.rejects(
            () => search?.execute({ type: "movie", query: "Inception" }) ?? Promise.resolve(),
            /tmdb down/,
          );
          await conclude?.execute({
            decision: "none",
            confidence: 0,
            reason: "搜不到",
          });
        },
      );
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 40,
        type: "movie",
        title: "盗梦空间",
        original_title: "Inception",
        year: "2010",
      }));
      let acked = false;
      let retried = false;
      await handleAgentMatchBatch(
        {
          messages: [
            {
              body: { doubanId: 40, agentToken: "tok-40" },
              ack() {
                acked = true;
              },
              retry() {
                retried = true;
              },
            },
          ],
        } as unknown as MessageBatch<AgentJob>,
        env,
        executionContext([]),
      );
      const row = await api.db.query.doubanMapping.findFirst({ where: eq(doubanMapping.doubanId, 40) });
      assert.equal(row?.tmdbId ?? null, null);
      assert.equal(JSON.parse(row?.agent ?? "{}").status, undefined);
      assert.equal(acked, false);
      assert.equal(retried, true);
    } finally {
      mock.restoreAll();
    }
  });
});
