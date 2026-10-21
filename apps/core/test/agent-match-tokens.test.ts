import assert from "node:assert/strict";
import test from "node:test";
import {
  addPiMessageUsage,
  buildPiSubmission,
  reportPiUsage,
  tokensDay,
  usageCostMicro,
} from "../src/libs/agent-match/tokens-report";
import { withTestContext } from "./context";

test("tokens day follows the pinned Asia/Singapore bucket", () => {
  assert.equal(tokensDay(new Date("2026-10-20T17:59:00Z")), "2026-10-21");
  assert.equal(tokensDay(new Date("2026-10-20T15:59:00Z")), "2026-10-20");
});

test("usage cost uses OpenRouter per-token prices and ignores reasoning", () => {
  assert.equal(
    usageCostMicro(
      { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 },
      { prompt: "0.000002", completion: "0.000006", input_cache_read: "0.0000005", input_cache_write: "0.0000025" },
    ),
    5_350,
  );
  assert.equal(
    usageCostMicro({ input: 10, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0.25 }, { prompt: "1" }),
    250_000,
  );
});

test("pi submission totals stay consistent and stay on the pi client", () => {
  const bucket = new Map();
  addPiMessageUsage(
    bucket,
    {
      role: "assistant",
      model: "alias",
      responseModel: "gpt-5.6-luna",
      usage: { input: 10, output: 4, cacheRead: 6, cacheWrite: 0 },
    },
    "fallback",
    { prompt: "0.000002", completion: "0.000006", input_cache_read: "0.000001" },
  );
  addPiMessageUsage(
    bucket,
    { role: "assistant", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    "fallback",
  );
  const [entry] = [...bucket.values()];
  const payload = buildPiSubmission(
    [
      {
        day: "2026-10-21",
        model: entry.model,
        input: entry.input,
        output: entry.output,
        cache_read: entry.cacheRead,
        cache_write: entry.cacheWrite,
        messages: entry.messages,
        cost_micro: entry.costMicro,
      },
    ],
    new Date("2026-10-21T02:00:00Z"),
  );
  assert.equal(entry.model, "gpt-5.6-luna");
  assert.ok(payload);
  assert.equal(payload.device.id, "dev_fa2a1fde99124fc79ca53f1c1a232e61");
  assert.equal(payload.device.name, "Douban Bridge");
  assert.deepEqual(payload.summary.clients, ["pi"]);
  assert.equal(payload.contributions[0].clients[0].client, "pi");
  assert.equal(payload.contributions[0].clients[0].tokens.reasoning, 0);
  assert.equal(payload.contributions[0].totals.tokens, 20);
  assert.equal(payload.summary.totalTokens, 20);
  assert.equal(payload.summary.activeDays, 1);
});

test("reported usage accumulates and submits the full pi snapshot", async () => {
  await withTestContext(async () => {
    const bodies: Array<{ contributions: Array<{ date: string; totals: { tokens: number } }> }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    };
    await reportPiUsage(
      [{ model: "gpt-5.6-luna", input: 10, output: 2, cacheRead: 3, cacheWrite: 0, messages: 1, costMicro: 26 }],
      { now: new Date("2026-10-20T03:00:00Z"), fetch: fetchImpl, token: "secret" },
    );
    await reportPiUsage(
      [{ model: "gpt-5.6-luna", input: 5, output: 1, cacheRead: 0, cacheWrite: 1, messages: 1, costMicro: 10 }],
      { now: new Date("2026-10-21T03:00:00Z"), fetch: fetchImpl, token: "secret" },
    );
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].contributions.find((day) => day.date === "2026-10-20")?.totals.tokens, 15);
    assert.equal(bodies[1].contributions.find((day) => day.date === "2026-10-21")?.totals.tokens, 7);
    await reportPiUsage(
      [{ model: "gpt-5.6-luna", input: 1, output: 1, cacheRead: 0, cacheWrite: 0, messages: 1, costMicro: 1 }],
      { now: new Date("2026-10-21T04:00:00Z"), fetch: fetchImpl },
    );
    assert.equal(bodies.length, 2);
  });
});
