import assert from "node:assert/strict";
import test from "node:test";
import { CandidateRegistry } from "../src/libs/agent-match/candidates";
import { AGENT_REASON_MAX_CHARS } from "../src/libs/agent-match/constants";
import { truncateReason, verifyConcludeMatch } from "../src/libs/agent-match/verifier";

const douban = { type: "movie" as const, title: "盗梦空间", originalTitle: "Inception", year: "2010", imdbId: null };

test("high confidence closed-set pick auto-writes without imdb anchor", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception", year: "2010" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.95,
    reason: "原名与年份一致",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "auto");
  assert.equal(verdict.candidate?.tmdbId, 27205);
});

test("imdb conflict downgrades auto-write to suggest", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 1, title: "Foo", imdbId: "tt-other" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.99,
    reason: "猜的",
    registry,
    douban: { ...douban, imdbId: "tt-real" },
  });
  assert.equal(verdict.tier, "suggest");
});

test("unknown candidateId cannot write", () => {
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: "tmdb:movie:1",
    confidence: 0.99,
    reason: "编造",
    registry: new CandidateRegistry(),
    douban,
  });
  assert.equal(verdict.tier, "none");
});

test("medium confidence becomes suggest", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.7,
    reason: "比较像",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "suggest");
});

test("type mismatch cannot write", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "tv", tmdbId: 1396, title: "Breaking Bad" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.99,
    reason: "同名",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "none");
});

test("truncateReason caps length", () => {
  const reason = truncateReason("x".repeat(500));
  assert.equal(reason.length, AGENT_REASON_MAX_CHARS);
});

test("wrong title cannot auto-write even at high confidence", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({
    type: "movie",
    tmdbId: 1,
    title: "Unrelated Film",
    originalTitle: "Unrelated Film",
    year: "2010",
  });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.99,
    reason: "瞎猜",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "suggest");
  assert.equal(verdict.code, "title_mismatch");
});

test("missing year can still auto-write when titles match", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception", originalTitle: "Inception" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.95,
    reason: "原名一致",
    registry,
    douban: { ...douban, year: null },
  });
  assert.equal(verdict.tier, "auto");
});

test("percentage confidence cannot auto-write", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({
    type: "movie",
    tmdbId: 27205,
    title: "Inception",
    originalTitle: "Inception",
    year: "2010",
  });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 95,
    reason: "百分数",
    registry,
    douban,
  });
  assert.equal(verdict.tier, "none");
  assert.equal(verdict.code, "invalid_confidence");
});

test("row imdb without candidate imdb cannot auto-write", () => {
  const registry = new CandidateRegistry();
  const candidate = registry.register({ type: "movie", tmdbId: 27205, title: "Inception", year: "2010" });
  const verdict = verifyConcludeMatch({
    decision: "match",
    candidateId: candidate.candidateId,
    confidence: 0.95,
    reason: "没查外部 ID",
    registry,
    douban: { ...douban, imdbId: "tt1375666" },
  });
  assert.equal(verdict.tier, "suggest");
  assert.equal(verdict.code, "missing_imdb");
});
