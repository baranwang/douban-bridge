import assert from "node:assert/strict";
import test from "node:test";
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
  constructor() {
    super({
      env: {
        Request: WorkersRequest,
        Response,
        fetch: async () => Response.json({ ok: true }),
      },
    });
  }

  get() {
    return this.request<{ ok: boolean }>({ url: "https://example.com" });
  }
}

test("fetch adapter uses a Workers-compatible cache mode", async () => {
  assert.deepEqual(await new TestAPI().get(), { ok: true });
});
