import assert from "node:assert/strict";
import test from "node:test";
import { TmdbAPI } from "../src/libs/api/tmdb";
import { withTestContext } from "./context";

const JWT = "eyJhbGciOiJIUzI1NiJ9.e30.sig";
const V3 = "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d";

async function lastAuth(apiKey?: string, envKey = JWT) {
  return withTestContext(async (env) => {
    env.TMDB_API_KEY = envKey;
    const api = new TmdbAPI(apiKey);
    let auth = "";
    api.axios.defaults.adapter = async (config) => {
      const headers = config.headers;
      auth = String(headers?.get?.("Authorization") ?? headers?.Authorization ?? "");
      throw new Error("stop");
    };
    await api.search("movie", { query: "x" }).catch(() => {});
    return auth;
  });
}

test("TmdbAPI ignores a v3 API Key and uses the Worker secret", async () => {
  assert.equal(await lastAuth(V3), `Bearer ${JWT}`);
});

test("TmdbAPI keeps a v4 JWT from the user config", async () => {
  const userJwt = "eyJhbGciOiJIUzI1NiJ9.e30.user";
  assert.equal(await lastAuth(userJwt), `Bearer ${userJwt}`);
});
