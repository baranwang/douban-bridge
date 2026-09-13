/// <reference path="../worker-configuration.d.ts" />

import type {} from "hono";

declare module "hono" {
  interface Env {
    Bindings: CloudflareBindings;
  }
}

declare global {
  interface CacheStorage {
    default: Cache;
  }
}
