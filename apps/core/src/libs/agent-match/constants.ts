export const AGENT_AUTO_WRITE_MIN_CONFIDENCE = 0.9;
export const AGENT_SUGGEST_MIN_CONFIDENCE = 0.6;
export const AGENT_REASON_MAX_CHARS = 400;
export const AGENT_MATCH_CRON_BATCH = 50;
export const AGENT_LEASE_MS = 10 * 60 * 1000;
/** Model calls per session. Healthy sessions use 3–13 (24h prod sample); loops hit hundreds. */
export const AGENT_MATCH_MAX_TURNS = 20;
/** Must equal 1 + queue consumer `max_retries` in wrangler.jsonc. */
export const AGENT_MATCH_MAX_ATTEMPTS = 4;
