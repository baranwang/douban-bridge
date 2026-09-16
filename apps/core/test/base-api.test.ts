import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { BaseAPI } from "../src/libs/api/base";

class WorkersRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.cache === "default") {
      throw new TypeError("Unsupported cache mode: default");
    }
    super(input, init);
  }
}

class TestAPI extends BaseAPI {
  constructor(fetch: typeof globalThis.fetch = async () => Response.json({ ok: true })) {
    super({
      env: {
        Request: WorkersRequest,
        Response,
        fetch,
      },
    });
  }

  get(url = "https://example.com") {
    return this.request<{ ok: boolean }>({ url });
  }
}

test("fetch adapter uses a Workers-compatible cache mode", async () => {
  assert.deepEqual(await new TestAPI().get(), { ok: true });
});

test("HTTP failures are warnings and logs redact API keys", async () => {
  const logs: unknown[][] = [];
  let warningCount = 0;
  let errorCount = 0;
  try {
    mock.method(console, "info", (...args) => logs.push(args));
    mock.method(console, "warn", (...args) => {
      warningCount += 1;
      logs.push(args);
    });
    mock.method(console, "error", () => {
      errorCount += 1;
    });

    const api = new TestAPI(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    await assert.rejects(api.get("https://example.com/items?apiKey=secret-one&api_key=secret-two&safe=value"));

    const output = JSON.stringify(logs);
    assert.equal(warningCount, 1);
    assert.equal(errorCount, 0);
    assert.doesNotMatch(output, /secret-one|secret-two/);
    assert.match(output, /REDACTED/);
    assert.match(output, /safe=value/);
  } finally {
    mock.restoreAll();
  }
});
