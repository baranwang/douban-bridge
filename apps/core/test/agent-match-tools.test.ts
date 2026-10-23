import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { fetchMatchImage } from "../src/libs/agent-match/images";
import { createAgentMatchTools } from "../src/libs/agent-match/tools";
import { api } from "../src/libs/api";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { withTestContext } from "./context";

function exaMcpResponse(text: string, json = false) {
  const body = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } };
  if (json) return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

test("search_tmdb registers closed-set candidate ids", async () => {
  await withTestContext(async () => {
    try {
      mock.method(TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry);
      const search = tools.find((t) => t.name === "search_tmdb")!;
      const out = await search.execute({ type: "movie", query: "Inception", year: "2010" });
      assert.equal(registry.has("tmdb:movie:27205"), true);
      assert.equal(out.results[0].candidateId, "tmdb:movie:27205");
    } finally {
      mock.restoreAll();
    }
  });
});

test("find_tmdb_by_imdb ignores tv episode results", async () => {
  await withTestContext(async () => {
    try {
      mock.method(TmdbAPI.prototype, "findById", async () => ({
        movie_results: [],
        tv_results: [],
        tv_episode_results: [{ id: 999, title: "Pilot" }],
      }));
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry, { doubanType: "tv" });
      const find = tools.find((t) => t.name === "find_tmdb_by_imdb")!;
      const out = await find.execute({ imdbId: "tt-ep" });
      assert.equal(registry.list().length, 0);
      assert.equal(out.results.length, 0);
    } finally {
      mock.restoreAll();
    }
  });
});

test("search_trakt registers parent show from episode hits", async () => {
  await withTestContext(async () => {
    try {
      mock.method(api.traktAPI, "search", async () => [
        {
          type: "episode" as const,
          show: { title: "Only Show", year: 2020, ids: { trakt: 9, tmdb: 99, imdb: "tt-show" } },
        },
      ]);
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry, { doubanType: "tv" });
      const search = tools.find((t) => t.name === "search_trakt")!;
      const out = await search.execute({ type: "episode", query: "Only Show" });
      assert.equal(out.results[0].candidateId, "tmdb:tv:99");
      assert.equal(registry.has("tmdb:tv:99"), true);
    } finally {
      mock.restoreAll();
    }
  });
});

test("get_tmdb_credits returns trimmed names for a registered candidate", async () => {
  await withTestContext(async () => {
    try {
      mock.method(TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(TmdbAPI.prototype, "getCredits", async () => ({
        directors: ["甲", "乙", "丙", "丁"],
        actors: ["A", "B", "C", "D", "E", "F"],
      }));
      const registry = new CandidateRegistry();
      const tools = createAgentMatchTools(registry);
      const search = tools.find((tool) => tool.name === "search_tmdb");
      const credits = tools.find((tool) => tool.name === "get_tmdb_credits");
      assert.ok(search);
      assert.ok(credits);
      await search.execute({ type: "movie", query: "Inception" });
      assert.deepEqual(await credits.execute({ candidateId: "missing" }), { error: "unknown_candidate" });
      assert.deepEqual(await credits.execute({ candidateId: "tmdb:movie:27205" }), {
        candidateId: "tmdb:movie:27205",
        directors: ["甲", "乙", "丙"],
        actors: ["A", "B", "C", "D", "E"],
      });
    } finally {
      mock.restoreAll();
    }
  });
});

test("TmdbAPI getCredits keeps directors and billing-order actors", async () => {
  await withTestContext(async (env) => {
    env.TMDB_API_KEY = "eyJhbGciOiJIUzI1NiJ9.e30.sig";
    const previousCaches = globalThis.caches;
    globalThis.caches = {
      default: { match: async () => undefined, put: async () => {} },
    } as unknown as CacheStorage;
    const api = new TmdbAPI();
    const seen: Array<{ url?: string; language?: string }> = [];
    api.axios.defaults.adapter = async (config) => {
      const params = config.params as { language?: string } | undefined;
      seen.push({ url: config.url, language: params?.language });
      const tv = String(config.url).includes("aggregate_credits");
      const data = tv
        ? {
            cast: [{ name: " 演员A " }, { name: "演员A" }, { name: "演员B" }, { name: " " }],
            crew: [
              { name: "客串导演", jobs: [{ job: "Director", episode_count: 1 }] },
              {
                name: "导演",
                jobs: [
                  { job: "Director", episode_count: 12 },
                  { job: "Writer", episode_count: 1 },
                ],
              },
              { name: "制片", jobs: [{ job: "Producer", episode_count: 12 }] },
            ],
          }
        : {
            cast: [{ name: "Actor" }, { name: "" }, { name: "Actor" }],
            crew: [
              { name: "Director", job: "Director" },
              { name: "Writer", job: "Writer" },
            ],
          };
      return { data, status: 200, statusText: "OK", headers: {}, config };
    };
    assert.deepEqual(await api.getCredits("movie", 1), { directors: ["Director"], actors: ["Actor"] });
    assert.deepEqual(await api.getCredits("tv", 2), {
      directors: ["导演", "客串导演"],
      actors: ["演员A", "演员B"],
    });
    assert.deepEqual(
      seen.map((item) => ({
        path: item.url?.replace(/^https:\/\/api\.themoviedb\.org\/3/, ""),
        language: item.language,
      })),
      [
        { path: "/movie/1/credits", language: "zh-CN" },
        { path: "/tv/2/aggregate_credits", language: "zh-CN" },
      ],
    );
    globalThis.caches = previousCaches;
  });
});

test("get_douban_subject attaches an allowlisted cover image", async () => {
  await withTestContext(async () => {
    try {
      const cover = "https://img1.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg";
      mock.method(api.doubanAPI, "getSubjectDetail", async () => ({
        id: 41,
        type: "movie",
        title: "封面",
        pic: { normal: cover },
      }));
      mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response(Uint8Array.from([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
      );
      const tool = createAgentMatchTools(new CandidateRegistry(), { doubanId: 41 }).find(
        (item) => item.name === "get_douban_subject",
      );
      assert.ok(tool);
      const out = await tool.execute({ doubanId: 41 });
      assert.equal(out.cover, cover);
      assert.deepEqual(out.images, [{ data: Buffer.from([1, 2, 3]).toString("base64"), mimeType: "image/jpeg" }]);
    } finally {
      mock.restoreAll();
    }
  });
});

test("get_tmdb_poster fetches the registered candidate poster", async () => {
  await withTestContext(async () => {
    try {
      const poster = "https://image.tmdb.org/t/p/w342/abc.jpg";
      mock.method(TmdbAPI.prototype, "search", async () => ({
        results: [{ id: 27205, title: "Inception", original_title: "Inception" }],
        total_results: 1,
      }));
      mock.method(TmdbAPI.prototype, "getPoster", async () => poster);
      mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        assert.equal(String(input), poster);
        return new Response(Uint8Array.from([4]), { headers: { "content-type": "image/jpeg" } });
      });
      const tools = createAgentMatchTools(new CandidateRegistry());
      const search = tools.find((tool) => tool.name === "search_tmdb");
      const posters = tools.find((tool) => tool.name === "get_tmdb_poster");
      assert.ok(search);
      assert.ok(posters);
      await search.execute({ type: "movie", query: "Inception" });
      assert.deepEqual(await posters.execute({ candidateId: "missing" }), { error: "unknown_candidate" });
      assert.deepEqual(await posters.execute({ candidateId: "tmdb:movie:27205" }), {
        candidateId: "tmdb:movie:27205",
        poster,
        images: [{ data: Buffer.from([4]).toString("base64"), mimeType: "image/jpeg" }],
      });
    } finally {
      mock.restoreAll();
    }
  });
});

test("fetchMatchImage keeps small allowlisted images and drops the rest", async () => {
  await withTestContext(async () => {
    try {
      assert.equal(await fetchMatchImage("https://example.com/a.jpg"), null);
      mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        if (String(input).endsWith("big.jpg")) {
          return new Response(new Uint8Array(512 * 1024 + 1), { headers: { "content-type": "image/png" } });
        }
        return new Response(Uint8Array.from([9]), { headers: { "content-type": "image/webp; charset=binary" } });
      });
      assert.equal(await fetchMatchImage("https://image.tmdb.org/t/p/w342/big.jpg"), null);
      assert.deepEqual(await fetchMatchImage("https://image.tmdb.org/t/p/w342/ok.webp"), {
        data: Buffer.from([9]).toString("base64"),
        mimeType: "image/webp",
      });
    } finally {
      mock.restoreAll();
    }
  });
});

test("TmdbAPI getPoster uses the zh-CN w342 poster", async () => {
  await withTestContext(async (env) => {
    env.TMDB_API_KEY = "eyJhbGciOiJIUzI1NiJ9.e30.sig";
    const previousCaches = globalThis.caches;
    globalThis.caches = { default: { match: async () => undefined, put: async () => {} } } as unknown as CacheStorage;
    try {
      const api = new TmdbAPI();
      api.axios.defaults.adapter = async (config) => {
        assert.equal(config.params?.language, "zh-CN");
        assert.equal(config.url, "/movie/1");
        return { data: { poster_path: "/abc.jpg" }, status: 200, statusText: "OK", headers: {}, config };
      };
      assert.equal(await api.getPoster("movie", 1), "https://image.tmdb.org/t/p/w342/abc.jpg");
      api.axios.defaults.adapter = async (config) => ({
        data: { poster_path: null },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
      assert.equal(await api.getPoster("tv", 2), null);
    } finally {
      globalThis.caches = previousCaches;
    }
  });
});

test("exa_search returns trimmed titles and urls", async () => {
  await withTestContext(async () => {
    try {
      let url = "";
      mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.method, "tools/call");
        assert.equal(body.params.name, "web_search_exa");
        return exaMcpResponse(
          "Title: Inception\nURL: https://example.com/inception\nPublished: 2010-01-01\n---\nTitle: N/A\nURL: https://example.com/other\nPublished: N/A\n",
        );
      });
      const tools = createAgentMatchTools(new CandidateRegistry());
      const search = tools.find((t) => t.name === "exa_search");
      assert.ok(search);
      const out = await search.execute({ query: "盗梦空间 2010" });
      assert.equal(url, "https://mcp.exa.ai/mcp");
      assert.equal(out.results[0].url, "https://example.com/inception");
      assert.equal(out.results[0].publishedDate, "2010-01-01");
      assert.equal(out.results[1].title, null);
      assert.equal(out.results[1].publishedDate, null);
    } finally {
      mock.restoreAll();
    }
  });
});

test("exa_get_contents trims page text", async () => {
  await withTestContext(async () => {
    try {
      mock.method(globalThis, "fetch", async () =>
        exaMcpResponse(`# Inception\nURL: https://example.com/inception\n\n${"x".repeat(2000)}`, true),
      );
      const tools = createAgentMatchTools(new CandidateRegistry());
      const getContents = tools.find((t) => t.name === "exa_get_contents");
      assert.ok(getContents);
      const out = await getContents.execute({ urls: "https://example.com/inception" });
      assert.equal(out.results[0].text.length, 1500);
    } finally {
      mock.restoreAll();
    }
  });
});

test("get_douban_subject ignores a hallucinated doubanId when a job id is pinned", async () => {
  await withTestContext(async () => {
    try {
      mock.method(api.doubanAPI, "getSubjectDetail", async (id: number) => {
        if (id !== 41) throw new Error(`unexpected douban id ${id}`);
        return {
          id: 41,
          type: "tv",
          title: "Pinned",
          original_title: "Pinned",
          aka: ["别名"],
          year: "2010",
          episodes_count: 24,
        };
      });
      const tools = createAgentMatchTools(new CandidateRegistry(), { doubanType: "tv", doubanId: 41 });
      const getSubject = tools.find((t) => t.name === "get_douban_subject")!;
      const out = await getSubject.execute({ doubanId: 999 });
      assert.equal(out.doubanId, 41);
      assert.deepEqual(out.aka, ["别名"]);
      assert.equal(out.episodes_count, 24);
      assert.equal("tmdbId" in out, false);
      assert.equal("traktId" in out, false);
    } finally {
      mock.restoreAll();
    }
  });
});

for (const name of ["exa_search", "exa_get_contents"]) {
  test(`${name} reuses concurrent and repeated calls, including across tool instances`, async () => {
    await withTestContext(async (_env, ctx) => {
      try {
        let calls = 0;
        mock.method(globalThis, "fetch", async () => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          const body =
            name === "exa_search"
              ? "Title: Cached\nURL: https://example.com/cached\nPublished: N/A\n"
              : "# Cached\nURL: https://example.com/cached\n\nEvidence";
          return exaMcpResponse(body);
        });
        const pending: Promise<unknown>[] = [];
        mock.method(ctx, "waitUntil", (promise: Promise<unknown>) => pending.push(promise));
        const args = name === "exa_search" ? { query: "重复查询 2012" } : { urls: "https://example.com/cached" };
        const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(tool);
        const [first, concurrent] = await Promise.all([tool.execute(args), tool.execute(args)]);
        assert.deepEqual(concurrent, first);
        assert.deepEqual(await tool.execute(args), first);
        assert.equal(calls, 1);
        await Promise.all(pending);
        const another = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(another);
        assert.deepEqual(await another.execute(args), first);
        assert.equal(calls, 1);
        await tool.execute(name === "exa_search" ? { query: "另一查询" } : { urls: "https://example.com/other" });
        assert.equal(calls, 2);
        await Promise.all(pending);
        const future = Date.now() + 10 * 60 * 1000 + 1;
        mock.method(Date, "now", () => future);
        const refreshed = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(refreshed);
        assert.deepEqual(await refreshed.execute(args), first);
        assert.equal(calls, 3);
        await Promise.all(pending);
      } finally {
        mock.restoreAll();
      }
    });
  });

  test(`${name} retries failures and refreshes expired results`, async () => {
    await withTestContext(async (env) => {
      try {
        let calls = 0;
        mock.method(globalThis, "fetch", async () => {
          if (++calls === 1) throw new Error("upstream failed");
          return exaMcpResponse("");
        });
        // Keep expiry deterministic without depending on KV's wall clock.
        env.KV = { get: async () => null, put: async () => {} } as KVNamespace;
        let now = Date.now();
        mock.method(Date, "now", () => now);
        const args = name === "exa_search" ? { query: "重试" } : { urls: "https://example.com/retry" };
        const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === name);
        assert.ok(tool);
        await assert.rejects(tool.execute(args), /upstream failed/);
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.equal(calls, 2);
        now += 10 * 60 * 1000 + 1;
        assert.deepEqual(await tool.execute(args), { results: [] });
        assert.equal(calls, 3);
      } finally {
        mock.restoreAll();
      }
    });
  });
}

test("Exa cache failures preserve successful results and per-job reuse", async () => {
  await withTestContext(async (env) => {
    try {
      env.KV = {
        get: async () => {
          throw new Error("KV unavailable");
        },
        put: async () => {
          throw new Error("KV unavailable");
        },
      } as KVNamespace;
      let calls = 0;
      mock.method(globalThis, "fetch", async () => {
        calls++;
        return exaMcpResponse("Title: Available\nURL: https://example.com/available\nPublished: N/A\n");
      });
      const warnings: unknown[][] = [];
      mock.method(console, "warn", (...args) => warnings.push(args));
      const tool = createAgentMatchTools(new CandidateRegistry()).find((tool) => tool.name === "exa_search");
      assert.ok(tool);
      const first = await tool.execute({ query: "查询" });
      assert.equal(first.results[0].title, "Available");
      assert.deepEqual(await tool.execute({ query: " 查询 " }), first);
      assert.equal(calls, 1);
      assert.equal(warnings.length, 1);
    } finally {
      mock.restoreAll();
    }
  });
});
