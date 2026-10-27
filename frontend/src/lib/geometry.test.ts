import { describe, expect, it } from "vitest";
import {
  baseBarycentric,
  fromCartesian2,
  mapToSubSimplex,
  massesAtUncertainty,
  projectToSimplex,
  toCartesian2,
  toCartesian3,
  triangleGrid,
} from "./geometry";

const close = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));

describe("projectToSimplex", () => {
  it("keeps points inside the simplex", () => {
    close(projectToSimplex([0.2, 0.3, 0.5]), [0.2, 0.3, 0.5]);
  });

  it("projects outside points onto the closest face, edge or vertex", () => {
    close(projectToSimplex([1.2, -0.1, -0.1]), [1, 0, 0]);
    close(projectToSimplex([0.7, 0.7, -0.4]), [0.5, 0.5, 0]);
    close(projectToSimplex([0.5, 0.5, 0.5]), [1 / 3, 1 / 3, 1 / 3]);
  });

  it("respects the target sum", () => {
    const p = projectToSimplex([0.9, 0.4, -0.2], 0.6);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(0.6, 10);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
  });
});

describe("triangle coordinates", () => {
  it("round-trips masses through cartesian coordinates", () => {
    const masses = [0.5, 0.2, 0.3];
    close(fromCartesian2(toCartesian2(masses)), masses);
  });

  it("places the vertices like Jøsang's opinion triangle", () => {
    close(toCartesian2([1, 0, 0]), [1, 0]); // belief x₁ bottom right
    close(toCartesian2([0, 1, 0]), [0, 0]); // disbelief x₂ bottom left
    close(toCartesian2([0, 0, 1]), [0.5, Math.sqrt(3) / 2]); // uncertainty on top
  });

  it("builds grid lines along which one coordinate is constant", () => {
    for (const [from, to] of triangleGrid([0.25])) {
      const constant = from.findIndex((v, i) => v === to[i] && v === 0.25);
      expect(constant).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("tetrahedron coordinates", () => {
  it("recovers the masses of a point at its uncertainty", () => {
    const masses = [0.2, 0.3, 0.1, 0.4];
    const [x, , z] = toCartesian3(masses);
    close(massesAtUncertainty(x, z, 0.4), masses);
  });

  it("clamps points outside the cross-section onto it", () => {
    const m = massesAtUncertainty(5, 5, 0.3);
    expect(m[3]).toBe(0.3);
    expect(m.slice(0, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(0.7, 10);
    expect(Math.min(...m)).toBeGreaterThanOrEqual(0);
  });

  it("computes barycentric coordinates in the base", () => {
    const [x, , z] = toCartesian3([0, 1, 0, 0]);
    close(baseBarycentric(x, z), [0, 1, 0]);
  });
});

describe("mapToSubSimplex", () => {
  const vertices = [
    [0.8, 0.05, 0.15],
    [0.15, 0.6, 0.25],
  ];
  const apex = [0.15, 0.14, 0.71];

  it("maps dogmatic antecedents onto the vertices and the vacuous one onto the apex", () => {
    close(mapToSubSimplex([1, 0, 0], vertices, apex), vertices[0]);
    close(mapToSubSimplex([0, 1, 0], vertices, apex), vertices[1]);
    close(mapToSubSimplex([0, 0, 1], vertices, apex), apex);
  });

  it("is linear", () => {
    const m = mapToSubSimplex([0.5, 0.2, 0.3], vertices, apex);
    close(m, [0, 1, 2].map((j) => 0.5 * vertices[0][j] + 0.2 * vertices[1][j] + 0.3 * apex[j]));
  });
});
