import { ADDON } from "@douban-bridge/contracts/addon";
import { reactRenderer } from "@hono/react-renderer";
import { zValidator } from "@hono/zod-validator";
import { type Env, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { Github, Heart } from "lucide-react";
import { Link, Script, ViteClient } from "vite-ssr-components/react";
import { Configure, type ConfigureProps } from "@/components/configure";
import { DEFAULT_COLLECTION_IDS } from "@/libs/collections";
import { configSchema, decodeConfig, encodeConfig, getConfig, isUserId, saveUserConfig } from "@/libs/config";
import { toPublicUser } from "@/libs/public-user";

export const configureRoute = new Hono<Env>().post("/", zValidator("json", configSchema), async (c) => {
  const config = c.req.valid("json");
  const user = c.get("user");
  const { origin } = new URL(c.req.url);

  let manifestUrl: string;

  if (user?.hasStarred) {
    // 已登录且已 Star 用户：保存到数据库
    await saveUserConfig(c, user.id, config);
    manifestUrl = `${origin}/${user.id}/manifest.json`;
  } else {
    // 未登录或未 Star 用户：编码配置到 URL，只保留豆瓣提供商
    const filteredConfig = {
      ...config,
      imageProviders: config.imageProviders.filter((p) => p.provider === "douban"),
    };
    const encodedConfig = encodeConfig(filteredConfig);
    manifestUrl = `${origin}/${encodedConfig}/manifest.json`;
  }

  return c.json({ success: true, manifestUrl });
});

export type ConfigureRoute = typeof configureRoute;

configureRoute.get(
  "*",
  reactRenderer(({ c, children }) => {
    const userAgent = c.req.header("User-Agent");
    const isSafari = userAgent?.includes("Safari") && !userAgent?.includes("Chrome");
    return (
      <html lang="zh" className={isSafari ? "safari" : ""}>
        <head>
          <ViteClient />
          <Link rel="stylesheet" href="/src/style.css" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
          />
          <link rel="icon" href="/icon.png" />
        </head>
        <body>{children}</body>
      </html>
    );
  }),
);

// GET 显示配置页面
configureRoute.get("/", async (c) => {
  const user = c.get("user");
  const configId = c.req.param("config");
  const { origin } = new URL(c.req.url);

  let manifestUrl: string;
  let configSource: string | undefined;

  // 确定配置来源和 manifest URL
  if (user?.hasStarred) {
    // 已登录且已 Star 用户
    configSource = user.id;
    manifestUrl = `${origin}/${user.id}/manifest.json`;
  } else if (configId && isUserId(configId)) {
    // URL 中是 userId
    configSource = configId;
    manifestUrl = `${origin}/${configId}/manifest.json`;
  } else {
    // 传统配置模式
    const defaultConfig = getCookie(c, "config") ?? configId;
    const rawConfig = decodeConfig(defaultConfig ?? "");
    const encodedConfig = encodeConfig(rawConfig);
    manifestUrl = `${origin}/${encodedConfig}/manifest.json`;
  }

  // 使用统一的 getConfig 获取配置
  const rawConfig = await getConfig(c.env, configSource);

  const config = {
    ...rawConfig,
    catalogIds: rawConfig.catalogIds || DEFAULT_COLLECTION_IDS,
  };

  const configureProps: ConfigureProps = {
    config,
    manifestUrl,
    user: user ? toPublicUser(user) : undefined,
  };

  return c.render(
    <>
      <Script src="/src/client/configure.tsx" />
      <div className="flex h-dvh flex-col">
        <header className="page-container shrink-0 px-4 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-balance font-bold text-xl tracking-tight">{ADDON.description}</h1>
              <p className="text-muted-foreground text-sm">选择要显示的目录，生成你的专属配置</p>
            </div>
            {!!user && <div id="user-menu" />}
          </div>
          {!user?.hasStarred && <div id="star-banner" />}
        </header>

        <script
          id="__INITIAL_DATA__"
          type="application/json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: initialize data
          dangerouslySetInnerHTML={{ __html: JSON.stringify(configureProps).replace(/</g, "\\u003c") }}
        />
        <div id="configure" className="flex min-h-0 flex-1 flex-col">
          <Configure {...configureProps} />
        </div>

        <footer className="shrink-0 px-4 py-2">
          <div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
            <a
              href="https://github.com/baranwang/stremio-addon-douban"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Github className="size-3" />
              <span>GitHub</span>
            </a>
            <a
              href="https://afdian.com/a/baran"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Heart className="size-3" />
              <span>捐赠</span>
            </a>
          </div>

          <div className="h-safe-b" />
        </footer>
      </div>
    </>,
  );
});
