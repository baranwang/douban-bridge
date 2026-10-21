import { getContext } from "@/libs/middleware";

// shortcut: day buckets follow ~/.config/tokens timezone Asia/Singapore, change with that setting
const TOKENS_DAY_TIME_ZONE = "Asia/Singapore";
const TOKENS_SUBMIT_URL = "https://tokens.ci/api/submit";
// Separate device so this does not replace Pi sessions the laptop CLI already submitted.
const TOKENS_DEVICE_ID = "dev_fa2a1fde99124fc79ca53f1c1a232e61";
const TOKENS_DEVICE_NAME = "Douban Bridge";

const INSERT_USAGE = `INSERT INTO pi_token_usage (day, model, input, output, cache_read, cache_write, messages, cost_micro)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(day, model) DO UPDATE SET
  input = input + excluded.input,
  output = output + excluded.output,
  cache_read = cache_read + excluded.cache_read,
  cache_write = cache_write + excluded.cache_write,
  messages = messages + excluded.messages,
  cost_micro = cost_micro + excluded.cost_micro`;

export type PiUsageBucket = {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  messages: number;
  costMicro: number;
};

type StoredPiUsage = {
  day: string;
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  messages: number;
  cost_micro: number;
};

type TokenBreakdown = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
};

function whole(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER);
}

export function tokensDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKENS_DAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function usageCostMicro(
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; costTotal?: number },
  pricing?: Record<string, string>,
): number {
  if (usage.costTotal != null && Number.isFinite(usage.costTotal) && usage.costTotal > 0) {
    return whole(Math.round(usage.costTotal * 1_000_000));
  }
  const rate = (key: string) => {
    const value = Number(pricing?.[key]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const usd =
    usage.input * rate("prompt") +
    usage.output * rate("completion") +
    usage.cacheRead * rate("input_cache_read") +
    usage.cacheWrite * rate("input_cache_write");
  return whole(Math.round(usd * 1_000_000));
}

export function addPiMessageUsage(
  bucket: Map<string, PiUsageBucket>,
  message: unknown,
  fallbackModel: string,
  pricing?: Record<string, string>,
): void {
  if (!message || typeof message !== "object") return;
  const record = message as {
    role?: string;
    model?: string;
    responseModel?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost?: { total?: number };
    };
  };
  if (record.role && record.role !== "assistant") return;
  const usage = record.usage;
  if (!usage) return;
  const input = whole(usage.input);
  const output = whole(usage.output);
  const cacheRead = whole(usage.cacheRead);
  const cacheWrite = whole(usage.cacheWrite);
  if (input + output + cacheRead + cacheWrite === 0) return;
  const model = (record.responseModel || record.model || fallbackModel).trim() || "unknown";
  const current = bucket.get(model) ?? {
    model,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    messages: 0,
    costMicro: 0,
  };
  current.input += input;
  current.output += output;
  current.cacheRead += cacheRead;
  current.cacheWrite += cacheWrite;
  current.messages += 1;
  current.costMicro += usageCostMicro({ input, output, cacheRead, cacheWrite, costTotal: usage.cost?.total }, pricing);
  bucket.set(model, current);
}

function breakdown(input: number, output: number, cacheRead: number, cacheWrite: number): TokenBreakdown {
  return { input, output, cacheRead, cacheWrite, reasoning: 0 };
}

function tokenTotal(tokens: TokenBreakdown): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

export function buildPiSubmission(rows: StoredPiUsage[], now = new Date()) {
  const days = new Map<
    string,
    {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      messages: number;
      costMicro: number;
      clients: Array<{ model: string; tokens: TokenBreakdown; cost: number; messages: number }>;
    }
  >();
  for (const row of rows) {
    const tokens = breakdown(whole(row.input), whole(row.output), whole(row.cache_read), whole(row.cache_write));
    if (tokenTotal(tokens) === 0) continue;
    const cost = Number((whole(row.cost_micro) / 1_000_000).toFixed(6));
    const day = days.get(row.day) ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      messages: 0,
      costMicro: 0,
      clients: [],
    };
    day.input += tokens.input;
    day.output += tokens.output;
    day.cacheRead += tokens.cacheRead;
    day.cacheWrite += tokens.cacheWrite;
    day.messages += whole(row.messages);
    day.costMicro += whole(row.cost_micro);
    day.clients.push({ model: row.model || "unknown", tokens, cost, messages: whole(row.messages) });
    days.set(row.day, day);
  }
  const dates = [...days.keys()].sort();
  if (dates.length === 0) return undefined;

  const contributions = dates.map((date) => {
    const day = days.get(date);
    if (!day) throw new Error(`missing tokens day ${date}`);
    const tokens = breakdown(day.input, day.output, day.cacheRead, day.cacheWrite);
    const cost = Number((day.costMicro / 1_000_000).toFixed(6));
    return {
      date,
      totals: { tokens: tokenTotal(tokens), cost, messages: day.messages },
      intensity: tokenTotal(tokens) > 0 ? 1 : 0,
      tokenBreakdown: tokens,
      clients: day.clients.map((client) => ({
        client: "pi" as const,
        modelId: client.model,
        tokens: client.tokens,
        cost: client.cost,
        messages: client.messages,
      })),
    };
  });

  const totalTokens = contributions.reduce((sum, day) => sum + day.totals.tokens, 0);
  const totalCost = Number(contributions.reduce((sum, day) => sum + day.totals.cost, 0).toFixed(6));
  const activeDays = contributions.filter((day) => day.totals.tokens > 0).length;
  const models = [...new Set(contributions.flatMap((day) => day.clients.map((client) => client.modelId)))].sort();
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))].map((year) => {
    const yearDays = contributions.filter((day) => day.date.startsWith(year));
    return {
      year,
      totalTokens: yearDays.reduce((sum, day) => sum + day.totals.tokens, 0),
      totalCost: Number(yearDays.reduce((sum, day) => sum + day.totals.cost, 0).toFixed(6)),
      range: { start: yearDays[0].date, end: yearDays[yearDays.length - 1].date },
    };
  });

  return {
    meta: {
      generatedAt: now.toISOString(),
      version: "douban-bridge",
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
    },
    device: { id: TOKENS_DEVICE_ID, name: TOKENS_DEVICE_NAME },
    summary: {
      totalTokens,
      totalCost,
      totalDays: contributions.length,
      activeDays,
      averagePerDay: activeDays === 0 ? 0 : totalTokens / activeDays,
      maxCostInSingleDay: Math.max(...contributions.map((day) => day.totals.cost)),
      clients: ["pi"],
      models,
    },
    years,
    contributions,
  };
}

export async function reportPiUsage(
  entries: PiUsageBucket[],
  options?: { now?: Date; fetch?: typeof fetch; token?: string },
): Promise<void> {
  if (entries.length === 0) return;
  const now = options?.now ?? new Date();
  try {
    const db = getContext().env.STREMIO_ADDON_DOUBAN;
    const day = tokensDay(now);
    await db.batch(
      entries.map((entry) =>
        db
          .prepare(INSERT_USAGE)
          .bind(
            day,
            entry.model,
            entry.input,
            entry.output,
            entry.cacheRead,
            entry.cacheWrite,
            entry.messages,
            entry.costMicro,
          ),
      ),
    );
    const token = (options?.token ?? getContext().env.TOKENS_API_TOKEN)?.trim();
    if (!token) return;
    const stored = await db
      .prepare(
        "SELECT day, model, input, output, cache_read, cache_write, messages, cost_micro FROM pi_token_usage ORDER BY day, model",
      )
      .all<StoredPiUsage>();
    const payload = buildPiSubmission(stored.results ?? [], now);
    if (!payload) return;
    const response = await (options?.fetch ?? fetch)(TOKENS_SUBMIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("agent-match", { event: "tokens_report_failed", status: response.status });
    }
  } catch (error) {
    console.warn("agent-match", {
      event: "tokens_report_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
