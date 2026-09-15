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
    </head>
    <body>{children}</body>
  </html>
));
