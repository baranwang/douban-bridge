import { match } from "path-to-regexp";

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

function isConfigConfigure(pathname: string): boolean {
  return Boolean(match("/:config/configure")(pathname));
}

export function isWebCompatibilityRoute(method: string, pathname: string): boolean {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") {
    if (pathname === "/" || pathname === "/configure" || pathname === "/icon.png" || pathname === "/stremio-logo.png")
      return true;
    if (isConfigConfigure(pathname) || isSafeAsset(pathname) || match("/image-proxy/:userId")(pathname)) return true;
  }
  if (verb === "POST" && (pathname === "/configure" || isConfigConfigure(pathname))) return true;
  if (verb === "GET") {
    if (
      pathname === "/auth/github" ||
      pathname === "/auth/github/callback" ||
      pathname === "/auth/me" ||
      pathname === "/auth/check-star"
    ) {
      return true;
    }
  }
  if (verb === "POST" && pathname === "/auth/logout") return true;
  return false;
}
