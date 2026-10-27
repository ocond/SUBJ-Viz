/** A multinomial opinion. Binomial opinions use belief = [b, d] and baseRate = [a, 1 - a]. */
export interface Opinion {
  belief: number[];
  uncertainty: number;
  baseRate: number[];
}

export type PdfKind = "beta" | "dirichlet3" | "marginals" | "dogmatic";

/** Sampled Dirichlet PDF, see backend/subjviz/models.py for the meaning of the fields. */
export interface Pdf {
  kind: PdfKind;
  x?: number[];
  density?: (number | null)[];
  marginals?: (number | null)[][];
  resolution?: number;
  /** (i, j, down, density) per cell of the triangulated probability simplex */
  cells?: [number, number, number, number | null][];
  point?: number[];
}

/** An opinion together with the quantities SUBJ derives from it. */
export interface OpinionAnalysis extends Opinion {
  projection: number[];
  variance: number[];
  uncertaintyMaximum: number;
  priorWeight: number;
  strength?: number[];
  valid: boolean;
  pdf?: Pdf;
}

export interface PdfOptions {
  pdf?: boolean;
  pdfResolution?: number;
}

export interface OpinionsResponse {
  opinions: OpinionAnalysis[];
}

export interface DeductionResponse {
  antecedent: OpinionAnalysis;
  conditionals: OpinionAnalysis[];
  result: OpinionAnalysis;
  apex: OpinionAnalysis;
  vertices: OpinionAnalysis[];
  marginalBaseRate: number[];
}

export type FusionMethod = "cumulative" | "averaging";

export interface FusionResponse {
  opinions: OpinionAnalysis[];
  result: OpinionAnalysis;
}

export interface UnfusionResponse {
  fused: OpinionAnalysis;
  opinion: OpinionAnalysis;
  result?: OpinionAnalysis;
  refused?: OpinionAnalysis;
  message?: string;
}

export interface TrustDiscountingResponse {
  trust: OpinionAnalysis;
  opinion: OpinionAnalysis;
  trustProbability: number;
  result: OpinionAnalysis;
}

export interface MultiplicationResponse {
  x: OpinionAnalysis;
  y: OpinionAnalysis;
  result: OpinionAnalysis;
  shape: [number, number];
}

export interface InfoResponse {
  subjvizVersion: string;
  pysubjVersion: string;
  patches: string[];
}
