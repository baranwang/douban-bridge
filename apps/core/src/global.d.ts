/// <reference path="../worker-configuration.d.ts" />

import type {} from "hono";

declare module "hono" {
  interface Env {
    Bindings: CloudflareBindings;
  }
}

declare global {
  interface CloudflareBindings {
    MEDIAREF_API_KEY?: string;
  }

  interface CacheStorage {
    default: Cache;
  }
}
