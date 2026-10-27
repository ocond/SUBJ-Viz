/**
 * Colors by role. Categorical slots carry identity (antecedent states, sources) in a fixed
 * order; results are drawn in primary ink, derived opinions in muted ink.
 */

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export function seriesColor(index: number): string {
  // More than 8 identities never get a generated hue; they reuse the muted ink (labels carry them)
  return index < SERIES.length ? SERIES[index] : "var(--text-muted)";
}

export const INK = "var(--text-primary)";
export const INK_SECONDARY = "var(--text-secondary)";
export const MUTED = "var(--text-muted)";
export const UNCERTAINTY = "var(--uncertainty)";

/** Ink for labels inside a fill of the given series color (near-black on yellow, else white). */
export function labelInk(color: string): string {
  if (color === SERIES[3]) return "#0b0b0b";
  if (color === INK || color === INK_SECONDARY) return "var(--surface)";
  if (color.startsWith("var(--series-")) return "#ffffff";
  return INK;
}

/** Resolves a CSS color (including var(--x)) to a concrete color string. */
export function resolveColor(color: string, element: Element = document.documentElement): string {
  const match = /^var\((--[^)]+)\)$/.exec(color.trim());
  if (!match) return color;
  return getComputedStyle(element).getPropertyValue(match[1]).trim() || "#888888";
}
