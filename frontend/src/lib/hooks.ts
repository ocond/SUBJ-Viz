import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Width of an element, updated on resize. */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(120, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width] as const;
}

export type ThemeChoice = "system" | "light" | "dark";

function readStoredTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem("subjviz-theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage may be unavailable (private mode, blocked site data)
  }
  return "system";
}

/** Theme choice applied as data-theme on <html>, plus the effective scheme for canvas views. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    try {
      window.localStorage.setItem("subjviz-theme", choice);
    } catch {
      // Ignore unavailable storage
    }
  }, [choice]);

  const scheme: "light" | "dark" = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  return { choice, setChoice, scheme };
}
