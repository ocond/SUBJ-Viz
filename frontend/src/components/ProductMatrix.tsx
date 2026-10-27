import * as d3 from "d3";
import { useState, type PointerEvent } from "react";
import { format } from "../lib/opinion";
import type { OpinionAnalysis } from "../lib/types";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

const RAMP_LIGHT = ["#f3f8fe", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const RAMP_DARK = ["#1e1f22", "#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

export interface ProductMatrixProps {
  result: OpinionAnalysis;
  x: OpinionAnalysis;
  y: OpinionAnalysis;
  labelsX: string[];
  labelsY: string[];
  scheme: "light" | "dark";
}

/** Belief masses of the product opinion over X × Y, with the marginal projections as headers. */
export function ProductMatrix({ result, x, y, labelsX, labelsY, scheme }: ProductMatrixProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const k = labelsX.length;
  const l = labelsY.length;
  const ramp = scheme === "dark" ? RAMP_DARK : RAMP_LIGHT;
  const maxBelief = Math.max(...result.belief, 1e-9);
  const color = d3.scaleSequential(d3.piecewise(d3.interpolateLab, ramp)).domain([0, maxBelief]);

  const show = (event: PointerEvent, i: number, j: number) => {
    const index = i * l + j;
    const container = (event.currentTarget as HTMLElement).closest(".product-matrix")!.getBoundingClientRect();
    setTooltip({
      x: event.clientX - container.left + 14,
      y: event.clientY - container.top + 14,
      content: (
        <TooltipRows
          title={`(${labelsX[i]}, ${labelsY[j]})`}
          rows={[
            { label: "b", value: format(result.belief[index]) },
            { label: "b(x)·b(y), lower bound", value: format(x.belief[i] * y.belief[j]) },
            { label: "a", value: format(result.baseRate[index]) },
            { label: "P = P(x)·P(y)", value: format(result.projection[index]) },
          ]}
        />
      ),
    });
  };

  return (
    <div className="product-matrix">
      <table className="matrix" aria-label="Belief masses of the product opinion over X × Y">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">X \ Y</span>
            </th>
            {labelsY.map((label, j) => (
              <th scope="col" key={label}>
                {label}
                <span className="matrix-marginal">P {format(y.projection[j])}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labelsX.map((labelX, i) => (
            <tr key={labelX}>
              <th scope="row">
                {labelX}
                <span className="matrix-marginal">P {format(x.projection[i])}</span>
              </th>
              {labelsY.map((labelY, j) => {
                const index = i * l + j;
                const fill = color(result.belief[index]);
                const dark = d3.lab(fill).l < 60;
                return (
                  <td
                    key={labelY}
                    style={{ background: fill, color: dark ? "#ffffff" : "#0b0b0b" }}
                    onPointerMove={(e) => show(e, i, j)}
                    onPointerLeave={() => setTooltip(null)}
                    tabIndex={0}
                    aria-label={`b(${labelX}, ${labelY}) ${format(result.belief[index])}, P ${format(result.projection[index])}`}
                  >
                    <strong>{format(result.belief[index])}</strong>
                    <span>P {format(result.projection[index])}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">
        Cells: belief mass b(xᵢ, yⱼ) (color, darker = more belief) and projected probability. {k}×{l} = {k * l} states.
      </p>
      <Tooltip state={tooltip} />
    </div>
  );
}
