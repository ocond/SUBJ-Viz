import type { SVGProps } from "react";

/**
 * Labels use the notation base^sup_sub, e.g. "ω^A_B", "ω_Y‖X" or "ω_Y|x₁":
 * everything after "_" is the subscript, the part between "^" and "_" the superscript.
 */
export function parseLabel(text: string): { base: string; sup?: string; sub?: string } {
  const match = /^([^^_]*)(?:\^([^_]*))?(?:_(.*))?$/.exec(text);
  if (!match) return { base: text };
  return { base: match[1], sup: match[2] || undefined, sub: match[3] || undefined };
}

export function plainLabel(text: string): string {
  const { base, sup, sub } = parseLabel(text);
  return `${base}${sup ?? ""}${sub ?? ""}`;
}

export function Label({ text }: { text: string }) {
  const { base, sup, sub } = parseLabel(text);
  return (
    <span className="label">
      {base}
      {sup && <sup>{sup}</sup>}
      {sub && <sub>{sub}</sub>}
    </span>
  );
}

export function SvgLabel({ text, ...props }: { text: string } & SVGProps<SVGTextElement>) {
  const { base, sup, sub } = parseLabel(text);
  return (
    <text {...props}>
      {base}
      {sup && (
        <tspan dy="-0.45em" fontSize="75%">
          {sup}
        </tspan>
      )}
      {sub && (
        <tspan dy={sup ? "0.9em" : "0.35em"} fontSize="75%">
          {sub}
        </tspan>
      )}
    </text>
  );
}

/** DOM element for CSS2D labels in the 3D view. */
export function labelElement(text: string): DocumentFragment {
  const { base, sup, sub } = parseLabel(text);
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(base));
  if (sup) {
    const element = document.createElement("sup");
    element.textContent = sup;
    fragment.append(element);
  }
  if (sub) {
    const element = document.createElement("sub");
    element.textContent = sub;
    fragment.append(element);
  }
  return fragment;
}
