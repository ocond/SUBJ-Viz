import type { SimplexViewProps } from "./simplex";
import { Tetrahedron } from "./Tetrahedron";
import { Triangle } from "./Triangle";

/** Triangle for binomial and tetrahedron for trinomial opinions; nothing for larger domains. */
export function SimplexView(props: SimplexViewProps) {
  if (props.labels.length === 2) return <Triangle {...props} />;
  if (props.labels.length === 3) return <Tetrahedron {...props} />;
  return null;
}

export const hasSimplex = (dim: number) => dim === 2 || dim === 3;
