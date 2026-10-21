import { reactRenderer } from "@hono/react-renderer";
import { Link, ViteClient } from "vite-ssr-components/react";

export const webRenderer = reactRenderer(({ children }) => (
  <html lang="zh">
    <head>
      <ViteClient />
      <Link rel="stylesheet" href="/src/style.css" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
      />
      <link rel="icon" href="/icon.png" />
      <script defer src="https://u.baran.wang/script.js" data-website-id="c82dc2bf-07ef-42fc-aa80-d84d94a5305a" />
    </head>
    <body>{children}</body>
  </html>
));
