import { imageProvidersSchema } from "@douban-bridge/contracts/image-providers";
import { zValidator } from "@hono/zod-validator";
import { type Env, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Script } from "vite-ssr-components/react";
import { z } from "zod/v4";
import { Rex, type RexProps } from "@/components/rex";
import { getConfig, saveUserConfig } from "@/libs/config";
import { toPublicUser } from "@/libs/public-user";
import { requireWebSession } from "@/libs/require-web-session";
import { webRenderer } from "@/routes/web-renderer";

const rexImageProvidersBodySchema = z.strictObject({
  imageProviders: imageProvidersSchema.min(1),
});

export const rexRoute = new Hono<Env>();

rexRoute.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});

rexRoute.onError((error, c) => {
  c.header("Cache-Control", "private, no-store");
  if (error instanceof HTTPException) {
    const response = error.getResponse();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return c.body(null, 500);
});

rexRoute.get("*", webRenderer);

rexRoute.get("/", async (c) => {
  const user = c.get("user");
  const isStarred = user?.hasStarred === true;
  const rexProps: RexProps = {
    user: user ? toPublicUser(user) : undefined,
    imageProviders: isStarred ? (await getConfig(c.env, user.id)).imageProviders : [],
  };

  return c.render(
    <>
      <Script src="/src/client/rex.tsx" />
      <script
        id="__INITIAL_DATA__"
        type="application/json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: initialize data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(rexProps).replace(/</g, "\\u003c") }}
      />
      <div id="rex">
        <Rex {...rexProps} />
      </div>
    </>,
  );
});

rexRoute.post("/image-providers", zValidator("json", rexImageProvidersBodySchema), async (c) => {
  const user = requireWebSession(c, { requireStar: true });
  const { imageProviders } = c.req.valid("json");
  const current = await getConfig(c.env, user.id);
  await saveUserConfig(c, user.id, { ...current, imageProviders });
  return c.json({ success: true, imageProviders });
});
