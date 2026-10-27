/**
 * Coordinates of the opinion simplices.
 *
 * Binomial opinions live in an equilateral triangle with the belief vertex x₁ at the bottom
 * right, the disbelief vertex x₂ at the bottom left and the uncertainty vertex at the top.
 * Trinomial opinions live in a regular tetrahedron with x₁, x₂, x₃ on the base and the
 * uncertainty vertex at the top. Opinion masses (b₁, …, bₖ, u) are barycentric coordinates.
 *
 * The standard simplex in Rⁿ is a regular simplex with edge √2, so mapping it to the regular
 * triangle / tetrahedron with edge 1 is a similarity. Euclidean projections onto the simplex
 * can therefore be computed in barycentric coordinates.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const TRIANGLE_HEIGHT = Math.sqrt(3) / 2;

/** Triangle vertices (y up): x₁ (belief), x₂ (disbelief), uncertainty. */
export const TRIANGLE: Vec2[] = [
  [1, 0],
  [0, 0],
  [0.5, TRIANGLE_HEIGHT],
];

export const TETRA_HEIGHT = Math.sqrt(2 / 3);

/** Tetrahedron vertices (y up): x₁, x₂, x₃ on the base, uncertainty at the apex. */
export const TETRAHEDRON: Vec3[] = [
  [-0.5, 0, Math.sqrt(3) / 6],
  [0.5, 0, Math.sqrt(3) / 6],
  [0, 0, -Math.sqrt(3) / 3],
  [0, TETRA_HEIGHT, 0],
];

export function toCartesian2(m: number[]): Vec2 {
  return [
    m[0] * TRIANGLE[0][0] + m[1] * TRIANGLE[1][0] + m[2] * TRIANGLE[2][0],
    m[0] * TRIANGLE[0][1] + m[1] * TRIANGLE[1][1] + m[2] * TRIANGLE[2][1],
  ];
}

/** Unconstrained barycentric coordinates (b₁, b₂, u) of a point of the triangle's plane. */
export function fromCartesian2([x, y]: Vec2): number[] {
  const u = y / TRIANGLE_HEIGHT;
  const b1 = x - 0.5 * u;
  return [b1, 1 - b1 - u, u];
}

export function toCartesian3(m: number[]): Vec3 {
  const p: Vec3 = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    for (let c = 0; c < 3; c++) p[c] += m[i] * TETRAHEDRON[i][c];
  }
  return p;
}

/** Unconstrained barycentric coordinates of (x, z) w.r.t. the base triangle of the tetrahedron. */
export function baseBarycentric(x: number, z: number): number[] {
  const [a, b, c] = TETRAHEDRON;
  const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
  const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
  return [l1, l2, 1 - l1 - l2];
}

/**
 * Masses of the point (x, z) at the height of uncertainty u: the beliefs are the barycentric
 * coordinates within the cross-section of the tetrahedron at that height, projected onto it.
 */
export function massesAtUncertainty(x: number, z: number, u: number): number[] {
  const free = 1 - u;
  if (free < 1e-9) return [0, 0, 0, 1];
  // The cross-section is the base triangle scaled by (1 - u) towards the apex
  const lambda = baseBarycentric(x / free, z / free);
  return [...projectToSimplex(lambda).map((l) => l * free), u];
}

/**
 * Euclidean projection of v onto the simplex { w ≥ 0, Σw = total } (Duchi et al., 2008).
 */
export function projectToSimplex(v: number[], total = 1): number[] {
  const sorted = [...v].sort((a, b) => b - a);
  let cumulative = 0;
  let theta = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i];
    const t = (cumulative - total) / (i + 1);
    if (sorted[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

/** Linear map of antecedent masses onto the deduction sub-simplex (vertex masses and apex). */
export function mapToSubSimplex(antecedent: number[], vertices: number[][], apex: number[]): number[] {
  const k = vertices.length;
  return apex.map((_, j) => {
    let value = antecedent[k] * apex[j];
    for (let i = 0; i < k; i++) value += antecedent[i] * vertices[i][j];
    return value;
  });
}

/** Grid segments of a 2-simplex in mass coordinates: lines where one coordinate is constant. */
export function triangleGrid(steps = [0.25, 0.5, 0.75]): [number[], number[]][] {
  const segments: [number[], number[]][] = [];
  for (let c = 0; c < 3; c++) {
    const [p, q] = [0, 1, 2].filter((i) => i !== c);
    for (const s of steps) {
      const from = [0, 0, 0];
      const to = [0, 0, 0];
      from[c] = s;
      to[c] = s;
      from[p] = 1 - s;
      to[q] = 1 - s;
      segments.push([from, to]);
    }
  }
  return segments;
}
