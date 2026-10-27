import { Label } from "./Label";

export interface LegendItem {
  label: string;
  color: string;
  shape?: "line" | "dot" | "diamond" | "ring";
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <LegendKey item={item} />
          <Label text={item.label} />
        </li>
      ))}
    </ul>
  );
}

export function LegendKey({ item }: { item: LegendItem }) {
  const shape = item.shape ?? "line";
  if (shape === "line") return <span className="line-key" style={{ background: item.color }} />;
  return (
    <svg width={14} height={14} aria-hidden className="legend-shape">
      {shape === "dot" && <circle cx={7} cy={7} r={5} fill={item.color} />}
      {shape === "ring" && <circle cx={7} cy={7} r={4.5} fill="none" stroke={item.color} strokeWidth={2} />}
      {shape === "diamond" && <path d="M7 1L13 7L7 13L1 7Z" fill={item.color} />}
    </svg>
  );
}
