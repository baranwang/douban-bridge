import type { Context, Env } from "hono";
import { match, type ParamData, type Path } from "path-to-regexp";

export function matchRoute<P extends ParamData>(path: Path | Path[], pathname: string) {
  const matcher = match<P>(path);
  const matches = matcher(pathname);
  if (matches) {
    return [true, matches.params] as const;
  }
  return [false, null] as const;
}

export const parseExtra = (value: string | undefined) => {
  if (!value) return {};
  return Object.fromEntries(new URLSearchParams(value));
};

const RESOURCES = ["catalog", "meta", "stream", "subtitles"] as const;

const RESOURCE_ROUTES = RESOURCES.flatMap((r) => [
  `/:config/${r}/:type/:id{/:extra}.json`,
  `/${r}/:type/:id{/:extra}.json`,
]);

export const matchResourceRoute = (pathname: string) => {
  const [matched, result] = matchRoute<{
    config?: string;
    type: string;
    id: string;
    extra?: string;
  }>(RESOURCE_ROUTES, pathname);
  if (!matched) return [false, null] as const;

  return [
    true,
    {
      ...result,
      extra: parseExtra(result.extra),
    },
  ] as const;
};

export const getExtraFactory = (c: Context<Env>, extra: Record<string, string>) => {
  return (key: string) => {
    return extra[key] ?? c.req.query(key);
  };
};
