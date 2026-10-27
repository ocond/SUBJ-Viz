import type { Opinion } from "./types";

const EPS = 1e-12;

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

export function subscript(n: number): string {
  return String(n)
    .split("")
    .map((digit) => SUBSCRIPTS[Number(digit)])
    .join("");
}

/** Labels x₁ … xₖ of the states of a domain. */
export function stateLabels(variable: string, dim: number): string[] {
  return Array.from({ length: dim }, (_, i) => `${variable}${subscript(i + 1)}`);
}

export function uniformBaseRate(dim: number): number[] {
  return Array.from({ length: dim }, () => 1 / dim);
}

export function vacuous(dim: number, baseRate = uniformBaseRate(dim)): Opinion {
  return { belief: Array(dim).fill(0), uncertainty: 1, baseRate: [...baseRate] };
}

export function binomial(b: number, d: number, u: number, a = 0.5): Opinion {
  return { belief: [b, d], uncertainty: u, baseRate: [a, 1 - a] };
}

/** Belief masses followed by the uncertainty mass. */
export function masses(opinion: Opinion): number[] {
  return [...opinion.belief, opinion.uncertainty];
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/** Opinion from belief and uncertainty masses; removes rounding errors so they sum to exactly 1. */
export function fromMasses(values: number[], baseRate: number[]): Opinion {
  const clipped = values.map((v) => Math.max(0, v));
  const total = sum(clipped) || 1;
  const belief = clipped.slice(0, -1).map((v) => v / total);
  return { belief, uncertainty: Math.max(0, 1 - sum(belief)), baseRate };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Sets b(x_i); the uncertainty absorbs the change, then the other beliefs shrink proportionally. */
export function setBelief(opinion: Opinion, i: number, value: number): Opinion {
  const v = clamp01(value);
  const others = sum(opinion.belief) - opinion.belief[i];
  let belief = opinion.belief.map((b, j) => (j === i ? v : b));
  if (others + v > 1) {
    const scale = others > EPS ? (1 - v) / others : 0;
    belief = belief.map((b, j) => (j === i ? v : b * scale));
  }
  return fromMasses([...belief, Math.max(0, 1 - sum(belief))], opinion.baseRate);
}

/** Sets u and rescales the beliefs proportionally (along the base rate if there is no belief). */
export function setUncertainty(opinion: Opinion, value: number): Opinion {
  const u = clamp01(value);
  const total = sum(opinion.belief);
  const shares = total > EPS ? opinion.belief.map((b) => b / total) : opinion.baseRate;
  return fromMasses([...shares.map((s) => s * (1 - u)), u], opinion.baseRate);
}

/** Sets a(x_i) and rescales the other base rates proportionally. */
export function setBaseRate(opinion: Opinion, i: number, value: number): Opinion {
  return { ...opinion, baseRate: setShare(opinion.baseRate, i, value) };
}

/** Sets element i of a distribution and rescales the others so the sum stays 1. */
export function setShare(values: number[], i: number, value: number): number[] {
  const v = clamp01(value);
  const others = sum(values) - values[i];
  const result = values.map((x, j) => {
    if (j === i) return v;
    if (others > EPS) return (x / others) * (1 - v);
    return (1 - v) / (values.length - 1);
  });
  const total = sum(result);
  return result.map((x) => x / total);
}

/**
 * Moves the boundary between elements i and i + 1 of a stacked distribution to `position`
 * (the cumulative share up to and including element i). Only these two elements change.
 */
export function moveBoundary(values: number[], i: number, position: number): number[] {
  const before = sum(values.slice(0, i));
  const pair = values[i] + values[i + 1];
  const left = Math.min(pair, Math.max(0, position - before));
  return values.map((x, j) => (j === i ? left : j === i + 1 ? pair - left : x));
}

export function withMasses(opinion: Opinion, values: number[]): Opinion {
  return fromMasses(values, opinion.baseRate);
}

export function format(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return rounded.toFixed(digits);
}

/** A default, non-trivial opinion of the given dimension. */
export function sampleOpinion(dim: number, seed = 0): Opinion {
  const weights = Array.from({ length: dim }, (_, i) => 1 + ((i + seed) % dim) * 1.5);
  const total = sum(weights);
  const u = 0.3;
  return fromMasses([...weights.map((w) => (w / total) * (1 - u)), u], uniformBaseRate(dim));
}

/** A conditional opinion favouring state `focus` of a consequent domain of dimension `dim`. */
export function focusedOpinion(dim: number, focus: number, strength = 0.6, u = 0.25): Opinion {
  const rest = (1 - u - strength) / (dim - 1);
  const belief = Array.from({ length: dim }, (_, j) => (j === focus % dim ? strength : rest));
  return fromMasses([...belief, u], uniformBaseRate(dim));
}
