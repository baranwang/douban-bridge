/// <reference path="../worker-configuration.d.ts" />

import type {} from "hono";

declare module "hono" {
  interface Env {
    Bindings: CloudflareBindings;
  }
}

declare global {
  interface CloudflareBindings {
    TOKENS_API_TOKEN?: string;
  }

  interface CacheStorage {
    default: Cache;
  }
}
