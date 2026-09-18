import assert from "node:assert/strict";
import test from "node:test";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { renderToStaticMarkup } from "react-dom/server";
import { PROVIDER_CONFIGS } from "../src/image-provider-sortable/provider-configs";
import { SortableProviderItem } from "../src/image-provider-sortable/sortable-provider-item";

test("image provider settings button has an accessible name", () => {
  const config = PROVIDER_CONFIGS.find(({ id }) => id === "tmdb");
  assert.ok(config);

  const html = renderToStaticMarkup(
    <DndContext>
      <SortableContext items={[config.id]}>
        <SortableProviderItem
          provider={{ provider: "tmdb", extra: { imageLanguages: ["zh", "en"] } }}
          config={config}
          isEnabled
          onToggle={() => {}}
          onExtraChange={() => {}}
        />
      </SortableContext>
    </DndContext>,
  );

  assert.match(html, /aria-label="配置 TMDB"/);
});

test("TMDB settings warn when a v3 API Key is pasted instead of a JWT", () => {
  const config = PROVIDER_CONFIGS.find(({ id }) => id === "tmdb");
  assert.ok(config);
  assert.ok(config.renderConfig);

  const html = renderToStaticMarkup(
    config.renderConfig({
      extra: { apiKey: "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d" },
      onChange: () => {},
    }),
  );

  assert.match(html, /需要 API 读访问令牌/);
  assert.doesNotMatch(
    renderToStaticMarkup(
      config.renderConfig({
        extra: { apiKey: "eyJhbGciOiJIUzI1NiJ9.e30.sig" },
        onChange: () => {},
      }),
    ),
    /需要 API 读访问令牌/,
  );
});
