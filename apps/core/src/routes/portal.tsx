import { type Env, Hono } from "hono";
import { Script } from "vite-ssr-components/react";
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
  const publicUser = user ? toPublicUser(user) : undefined;
  const configureUrl = new URL("/configure", c.req.url).toString();
  c.header("Cache-Control", "private, no-store");

  return c.render(
    <>
      {!!publicUser && (
        <>
          <Script src="/src/client/portal.tsx" />
          <script
            id="__USER__"
            type="application/json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: initialize data
            dangerouslySetInnerHTML={{ __html: JSON.stringify(publicUser).replace(/</g, "\\u003c") }}
          />
        </>
      )}
      <Portal user={publicUser} stremioConfigureUrl={toStremioWebUrl(c.env, configureUrl)} />
    </>,
  );
});
