import { describe, expect, it } from "vitest";
import { fromMasses, masses, moveBoundary, setBelief, setShare, setUncertainty, stateLabels, vacuous } from "./opinion";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const close = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));

const opinion = { belief: [0.3, 0.2, 0.1], uncertainty: 0.4, baseRate: [0.2, 0.3, 0.5] };

describe("linked editing", () => {
  it("lets the uncertainty absorb belief changes", () => {
    const o = setBelief(opinion, 0, 0.5);
    close(masses(o), [0.5, 0.2, 0.1, 0.2]);
  });

  it("shrinks the other beliefs once the uncertainty is used up", () => {
    const o = setBelief(opinion, 0, 0.9);
    expect(o.uncertainty).toBeCloseTo(0, 10);
    close(o.belief, [0.9, (0.2 / 0.3) * 0.1, (0.1 / 0.3) * 0.1]);
  });

  it("rescales the beliefs proportionally when setting the uncertainty", () => {
    const o = setUncertainty(opinion, 0.7);
    close(o.belief, [0.15, 0.1, 0.05]);
    expect(sum(masses(o))).toBeCloseTo(1, 12);
  });

  it("leaves a vacuous opinion along the base rate", () => {
    const o = setUncertainty(vacuous(3, [0.2, 0.3, 0.5]), 0.5);
    close(o.belief, [0.1, 0.15, 0.25]);
  });

  it("keeps distributions normalized", () => {
    const shares = setShare([0.2, 0.3, 0.5], 2, 0.8);
    close(shares, [0.08, 0.12, 0.8]);
    close(setShare([1, 0, 0], 0, 0.4), [0.4, 0.3, 0.3]);
  });

  it("moves a boundary between two neighbouring segments only", () => {
    close(moveBoundary([0.3, 0.2, 0.1, 0.4], 1, 0.45), [0.3, 0.15, 0.15, 0.4]);
    close(moveBoundary([0.3, 0.2, 0.1, 0.4], 1, 0.9), [0.3, 0.3, 0, 0.4]);
  });

  it("removes rounding errors", () => {
    const o = fromMasses([0.3333, 0.3333, 0.3333], [0.5, 0.5]);
    expect(sum(masses(o))).toBe(1);
  });
});

describe("labels", () => {
  it("uses subscript digits", () => {
    expect(stateLabels("x", 3)).toEqual(["x₁", "x₂", "x₃"]);
    expect(stateLabels("y", 12)[11]).toBe("y₁₂");
  });
});
