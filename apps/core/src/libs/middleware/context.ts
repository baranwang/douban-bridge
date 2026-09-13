import { AsyncLocalStorage } from "node:async_hooks";
import type { Env } from "hono";
import { createMiddleware } from "hono/factory";

export const asyncLocalStorage = new AsyncLocalStorage<{
  env: CloudflareBindings;
  ctx: ExecutionContext;
}>();

export const contextStorage = createMiddleware<Env>(async (c, next) => {
  await asyncLocalStorage.run(
    {
      env: c.env,
      ctx: c.executionCtx as ExecutionContext,
    },
    next,
  );
});

export const tryGetContext = () => {
  return asyncLocalStorage.getStore();
};

export const getContext = () => {
  const context = tryGetContext();
  if (!context) {
    throw new Error("Context is not available");
  }
  return context;
};
