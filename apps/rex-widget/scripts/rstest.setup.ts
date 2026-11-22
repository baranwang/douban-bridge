import { WidgetAdaptor } from "@rexnow/libs/widget-adaptor";
import { rs } from "@rstest/core";

rs.stubGlobal("Widget", WidgetAdaptor);

const widgetGlobals = [
  "WidgetMetadata",
  "loadDefaultCatalog",
  "loadGenreCatalog",
  "loadYearlyCatalog",
  "loadSelectedCatalog",
  "loadMovieRecommendCatalog",
  "loadTvRecommendCatalog",
  "loadSearch",
  "loadSubCollections",
  "loadSelectedCollections",
  "loadTvRecommendSubGenres",
];

for (const name of widgetGlobals) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}
