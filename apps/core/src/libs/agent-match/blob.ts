import type { AgentBlob } from "./types";

export function parseAgent(raw?: string | null): AgentBlob | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AgentBlob;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function serializeAgent(blob: AgentBlob | null): string | null {
  if (!blob) return null;
  return JSON.stringify(blob);
}

export function isBusy(blob: AgentBlob | null, now = Date.now()): boolean {
  return Boolean(blob?.token && blob.leaseUntil != null && blob.leaseUntil > now);
}

export function isEvaluated(blob: AgentBlob | null, now = Date.now()): boolean {
  if (!blob) return false;
  if (isBusy(blob, now)) return true;
  return blob.status === "suggested" || blob.status === "no_match";
}
