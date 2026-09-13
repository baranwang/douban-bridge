import pkg from "../../../package.json" with { type: "json" };
export const ADDON = {
  id: pkg.name,
  version: pkg.version,
  name: pkg.displayName,
  description: pkg.description,
};
