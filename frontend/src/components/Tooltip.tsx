import type { ReactNode } from "react";
import { Label } from "./Label";

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Tooltip positioned relative to the nearest positioned ancestor. */
export function Tooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  return (
    <div className="tooltip" style={{ left: state.x, top: state.y }} role="status">
      {state.content}
    </div>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Tooltip body: values lead, labels follow; series are keyed by a short line. */
export function TooltipRows({ title, rows }: { title?: ReactNode; rows: TooltipRow[] }) {
  return (
    <>
      {title && <div className="tooltip-title">{title}</div>}
      {rows.map((row) => (
        <div className="tooltip-row" key={row.label}>
          {row.color && <span className="line-key" style={{ background: row.color }} />}
          <strong>{row.value}</strong>
          <span>
            <Label text={row.label} />
          </span>
        </div>
      ))}
    </>
  );
}
