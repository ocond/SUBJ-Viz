import type { Opinion } from "../lib/types";

/** Belief masses followed by the uncertainty mass (barycentric simplex coordinates). */
export type Mass = number[];

export type PointRole = "input" | "result" | "derived";

export interface SimplexPoint {
  id: string;
  label: string;
  opinion: Opinion;
  color: string;
  role: PointRole;
  /** Projected probabilities computed by SUBJ; enables the projector line */
  projection?: number[];
  draggable?: boolean;
  baseRateDraggable?: boolean;
  showBaseRate?: boolean;
  showProjection?: boolean;
  /** Extra line for the tooltip */
  note?: string;
}

export interface Overlay {
  kind: "polygon" | "segment";
  points: Mass[];
  color?: string;
  opacity?: number;
  width?: number;
}

export interface SimplexViewProps {
  labels: string[];
  /** Colored keys next to the vertex labels, e.g. to match antecedent states with conditionals */
  vertexColors?: string[];
  points: SimplexPoint[];
  overlays?: Overlay[];
  onChange?: (id: string, opinion: Opinion) => void;
  ariaLabel: string;
}
