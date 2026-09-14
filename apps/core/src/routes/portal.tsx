import { type Env, Hono } from "hono";
import { Portal } from "@/components/portal";
import { isStremioWebRequest, toStremioWebUrl } from "@/libs/public-origins";
import { toPublicUser } from "@/libs/public-user";
import { webRenderer } from "@/routes/web-renderer";

export const portalRoute = new Hono<Env>();

portalRoute.get("*", webRenderer);

portalRoute.get("/", (c) => {
  if (isStremioWebRequest(c.env, c.req.url)) {
    const configureUrl = new URL("/configure", c.req.url).toString();
    return c.redirect(toStremioWebUrl(c.env, configureUrl), 307);
  }

  const user = c.get("user");
  const configureUrl = new URL("/configure", c.req.url).toString();
  c.header("Cache-Control", "private, no-store");

  return c.render(
    <Portal user={user ? toPublicUser(user) : undefined} stremioConfigureUrl={toStremioWebUrl(c.env, configureUrl)} />,
  );
});
