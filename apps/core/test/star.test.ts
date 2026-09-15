import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { describe } from "node:test";
import { eq } from "drizzle-orm";
import { getDrizzle, users } from "../src/db";
import { ensureFreshStarStatus, STAR_RECHECK_INTERVAL_MS } from "../src/libs/star";
import { withTestContext } from "./context";

async function insertUser(env: CloudflareBindings, overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = randomUUID();
  await getDrizzle(env)
    .insert(users)
    .values({
      id,
      githubId: Math.floor(Math.random() * 1e9),
      githubLogin: `user-${id.slice(0, 8)}`,
      githubAvatarUrl: "https://example.com/a.png",
      githubAccessToken: "ghp_TEST_TOKEN",
      hasStarred: true,
      starCheckedAt: new Date(),
      ...overrides,
    });
  return id;
}

const readStar = async (env: CloudflareBindings, id: string) =>
  (await getDrizzle(env).query.users.findFirst({ where: eq(users.id, id) }))?.hasStarred;

describe("star status recheck", { concurrency: false }, () => {
  test("unstarring is picked up once the TTL lapses, and persisted", async () => {
    await withTestContext(async (env) => {
      const now = Date.now();
      const id = await insertUser(env, { starCheckedAt: new Date(now - STAR_RECHECK_INTERVAL_MS - 1) });
      const user = await getDrizzle(env).query.users.findFirst({ where: eq(users.id, id) });
      assert.ok(user);

      const fresh = await ensureFreshStarStatus(env, user, { now, checkStar: async () => false });
      assert.equal(fresh.hasStarred, false);
      assert.equal(await readStar(env, id), false);
    });
  });

  test("within the TTL no call is made", async () => {
    await withTestContext(async (env) => {
      const now = Date.now();
      const id = await insertUser(env, { starCheckedAt: new Date(now - 1000) });
      const user = await getDrizzle(env).query.users.findFirst({ where: eq(users.id, id) });
      assert.ok(user);

      let called = false;
      const fresh = await ensureFreshStarStatus(env, user, {
        now,
        checkStar: async () => {
          called = true;
          return false;
        },
      });
      assert.equal(called, false);
      assert.equal(fresh.hasStarred, true);
    });
  });

  test("a GitHub failure keeps the old value instead of revoking access", async () => {
    await withTestContext(async (env) => {
      const now = Date.now();
      const id = await insertUser(env, { starCheckedAt: new Date(now - STAR_RECHECK_INTERVAL_MS - 1) });
      const user = await getDrizzle(env).query.users.findFirst({ where: eq(users.id, id) });
      assert.ok(user);

      const fresh = await ensureFreshStarStatus(env, user, {
        now,
        checkStar: async () => {
          throw new Error("rate limited");
        },
      });
      assert.equal(fresh.hasStarred, true);
      assert.equal(await readStar(env, id), true);
    });
  });
});
