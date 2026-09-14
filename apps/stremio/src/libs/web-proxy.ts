import { match } from "path-to-regexp";

const POSITIVE_INT = /^[1-9]\d*$/;

function isSafeAsset(pathname: string): boolean {
  if (!match("/assets/*asset")(pathname)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return !decoded.includes("..") && !decoded.includes("\\");
}

function isTidyUpItem(pathname: string): boolean {
  const result = match("/dash/tidy-up/:doubanId")(pathname);
  if (!result) return false;
  return POSITIVE_INT.test(String((result.params as { doubanId: string }).doubanId));
}

function isConfigConfigure(pathname: string): boolean {
  return Boolean(match("/:config/configure")(pathname));
}

export function isWebCompatibilityRoute(method: string, pathname: string): boolean {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") {
    if (pathname === "/" || pathname === "/configure" || pathname === "/icon.png") return true;
    if (isConfigConfigure(pathname) || isSafeAsset(pathname) || match("/image-proxy/:userId")(pathname)) return true;
  }
  if (verb === "POST" && (pathname === "/configure" || isConfigConfigure(pathname))) return true;
  if (verb === "GET") {
    if (
      pathname === "/auth/github" ||
      pathname === "/auth/github/callback" ||
      pathname === "/auth/me" ||
      pathname === "/auth/check-star" ||
      pathname === "/dash/tidy-up" ||
      pathname === "/dash/tidy-up/"
    ) {
      return true;
    }
    if (isTidyUpItem(pathname)) return true;
  }
  if (verb === "POST" && (pathname === "/auth/logout" || isTidyUpItem(pathname))) return true;
  return false;
}
