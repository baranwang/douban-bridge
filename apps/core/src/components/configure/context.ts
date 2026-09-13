import { createContext } from "react";

interface ConfigureContextValue {
  isStarredUser: boolean;
}

export const ConfigureContext = createContext<ConfigureContextValue>({
  isStarredUser: false,
});
