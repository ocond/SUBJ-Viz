import { createContext, useContext } from "react";

export const SchemeContext = createContext<"light" | "dark">("light");

/** Effective color scheme, needed by views that cannot use CSS variables directly. */
export function useScheme() {
  return useContext(SchemeContext);
}
