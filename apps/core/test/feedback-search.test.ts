import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { sign } from "hono/jwt";
import { app } from "../src/app";
import { users } from "../src/db";
import { api } from "../src/libs/api";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { withTestContext } from "./context";

const ORIGIN = "https://douban-bridge.baran.wang";

async function session(env: CloudflareBindings) {
  await api.db
    .insert(users)
    .values({ id: "search-user", githubId: 123, githubLogin: "search-user", hasStarred: false });
  const token = await sign({ sub: "search-user", exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET, "HS256");
  return `token=${token}`;
}

function searchRequest(cookie: string, query = "source=douban&q=肖申克的救赎") {
  return new Request(`${ORIGIN}/feedback/search?${query}`, { headers: { Cookie: cookie } });
}

function limits(env: CloudflareBindings, success = true): CloudflareBindings {
  return { ...env, USER_RATE_LIMIT: { limit: async () => ({ success }) } };
}

test("feedback renders searchable pickers, hydrated form data, and the link fallback", async () => {
  await withTestContext(async (env, ctx) => {
    const cookie = await session(env);
    const response = await app.fetch(
      new Request(`${ORIGIN}/feedback?douban=1292052`, { headers: { Cookie: cookie } }),
      env,
      ctx,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id="douban-query"/);
    assert.match(html, /id="tmdb-query"/);
    assert.match(html, /TMDB 作品类型/);
    assert.match(html, /搜不到？粘贴链接或 ID/);
    assert.match(html, /__FEEDBACK_FORM__/);
    assert.match(html, /\/src\/client\/feedback\.tsx/);
    assert.match(html, /name="douban"[^>]*value="1292052"/);
  });
});

test("search requires a web session and returns JSON for invalid queries and rate limits", async () => {
  await withTestContext(async (env, ctx) => {
    const cookie = await session(env);
    const anonymous = await app.fetch(searchRequest(""), limits(env), ctx);
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("Content-Type") ?? "", /application\/json/);
    for (const query of [
      "source=other&q=test",
      "source=douban&q=%20",
      `source=douban&q=${"x".repeat(101)}`,
      "source=tmdb&q=test&type=episode",
      "source=douban&q=test&url=https://evil.example",
    ]) {
      const invalid = await app.fetch(searchRequest(cookie, query), limits(env), ctx);
      assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get("Cache-Control"), "private, no-store");
      assert.match(invalid.headers.get("Content-Type") ?? "", /application\/json/);
    }
    const limited = await app.fetch(searchRequest(cookie), limits(env, false), ctx);
    assert.equal(limited.status, 429);
    assert.match(((await limited.json()) as { error: string }).error, /过于频繁/);
  });
});

test("Douban results expose only feedback choices and allowlisted poster URLs without mapping writes", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      const cookie = await session(env);
      mock.method(api.doubanAPI, "search", async (query: string) => {
        assert.equal(query, "肖申克的救赎");
        return [
          {
            id: 1292052,
            type: "movie",
            title: "肖申克的救赎",
            original_title: "The Shawshank Redemption",
            year: "1994",
            card_subtitle: "1994 / 美国 / 弗兰克·德拉邦特",
            cover: "https://img1.doubanio.com/view/photo/a.jpg",
          },
          { id: 95479, type: "tv", title: "剧集", year: "2020", cover: "https://evil.example/a.jpg" },
        ];
      });
      const response = await app.fetch(searchRequest(cookie, "source=douban&q=%20肖申克的救赎%20"), limits(env), ctx);
      assert.equal(response.status, 200);
      const body = (await response.json()) as { items: Array<Record<string, unknown>> };
      assert.equal(body.items[0].value, "1292052");
      assert.equal(body.items[0].originalTitle, "The Shawshank Redemption");
      assert.equal(body.items[0].poster, "/feedback/image?url=https%3A%2F%2Fimg1.doubanio.com%2Fview%2Fphoto%2Fa.jpg");
      assert.equal(body.items[1].type, "tv");
      assert.equal(body.items[1].poster, null);
      assert.deepEqual(await api.db.query.doubanMapping.findMany(), []);
      assert.deepEqual(await api.db.query.mappingFeedback.findMany(), []);
    } finally {
      mock.restoreAll();
    }
  });
});

test("TMDB movie and TV searches keep provider type, localized titles, year and canonical URL", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      const cookie = await session(env);
      for (const type of ["movie", "tv"] as const) {
        const search = mock.method(
          TmdbAPI.prototype,
          "search",
          async (actualType: string, params: Record<string, unknown>) => {
            assert.equal(actualType, type);
            assert.deepEqual(params, { query: "片名", language: "zh-CN" });
            return {
              results: [
                {
                  id: 278,
                  title: "片名",
                  original_title: "Original",
                  release_date: type === "movie" ? "1994-09-23" : undefined,
                  first_air_date: type === "tv" ? "2020-10-03" : undefined,
                  poster_path: "https://image.tmdb.org/t/p/original/a.jpg",
                },
              ],
            };
          },
        );
        const response = await app.fetch(searchRequest(cookie, `source=tmdb&q=片名&type=${type}`), limits(env), ctx);
        assert.equal(response.status, 200);
        const body = (await response.json()) as { items: Array<Record<string, unknown>> };
        assert.equal(body.items[0].type, type);
        assert.equal(body.items[0].value, `https://www.themoviedb.org/${type}/278`);
        assert.equal(body.items[0].year, type === "movie" ? "1994" : "2020");
        search.mock.restore();
      }
    } finally {
      mock.restoreAll();
    }
  });
});

test("empty searches and provider errors remain distinct and errors do not expose provider credentials", async () => {
  await withTestContext(async (env, ctx) => {
    try {
      const cookie = await session(env);
      const empty = mock.method(api.doubanAPI, "search", async () => []);
      const response = await app.fetch(searchRequest(cookie), limits(env), ctx);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [] });
      empty.mock.restore();
      mock.method(api.doubanAPI, "search", async () => {
        throw new Error("tmdb-secret-do-not-leak");
      });
      const failed = await app.fetch(searchRequest(cookie), limits(env), ctx);
      assert.equal(failed.status, 502);
      const text = await failed.text();
      assert.match(text, /搜索服务暂不可用/);
      assert.doesNotMatch(text, /tmdb-secret-do-not-leak/);
    } finally {
      mock.restoreAll();
    }
  });
});

test("feedback posters require login and reject arbitrary hosts before fetching", async () => {
  await withTestContext(async (env, ctx) => {
    const cookie = await session(env);
    const request = (url: string, authenticated = true) =>
      new Request(`${ORIGIN}/feedback/image?url=${encodeURIComponent(url)}`, {
        headers: authenticated ? { Cookie: cookie } : {},
      });
    assert.equal((await app.fetch(request("https://img1.doubanio.com/a.jpg", false), limits(env), ctx)).status, 401);
    for (const url of [
      "https://evil.example/a.jpg",
      "http://127.0.0.1/",
      "https://img1.doubanio.com.evil.example/a.jpg",
    ]) {
      assert.equal((await app.fetch(request(url), limits(env), ctx)).status, 400);
    }
    assert.equal((await app.fetch(request("https://img1.doubanio.com/a.jpg"), limits(env, false), ctx)).status, 429);
  });
});
