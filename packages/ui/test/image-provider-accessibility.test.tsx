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
