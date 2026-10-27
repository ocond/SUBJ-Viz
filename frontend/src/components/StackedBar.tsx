import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useElementWidth } from "../lib/hooks";
import { format } from "../lib/opinion";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

export interface StackedBarProps {
  values: number[];
  colors: string[];
  /** Ink of the labels inside the segments (white unless given) */
  labelColors?: string[];
  labels: string[];
  /** Name of the quantity per segment, e.g. "b" gives "b(x₁)" in the tooltip */
  quantity: (index: number) => string;
  /** Called with the new cumulative position of the boundary after segment i */
  onBoundaryMove?: (index: number, position: number) => void;
  height?: number;
  ariaLabel: string;
}

const MIN_LABEL_WIDTH = 30;
const KEY_STEP = 0.01;

/** Horizontal stacked bar of a distribution; the boundaries between segments are draggable. */
export function StackedBar({
  values,
  colors,
  labelColors,
  labels,
  quantity,
  onBoundaryMove,
  height = 24,
  ariaLabel,
}: StackedBarProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const starts: number[] = [];
  values.reduce((cumulative, v, i) => {
    starts[i] = cumulative;
    return cumulative + v;
  }, 0);

  const position = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const showTooltip = (event: PointerEvent, index: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left + 12,
      y: height + 6,
      content: <TooltipRows rows={[{ label: quantity(index), value: format(values[index]) }]} />,
    });
  };

  const onKey = (event: KeyboardEvent, index: number) => {
    const delta = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[
      event.key
    ];
    if (delta === undefined || !onBoundaryMove) return;
    event.preventDefault();
    onBoundaryMove(index, starts[index] + values[index] + delta);
  };

  return (
    <div className="stacked-bar" ref={ref}>
      <svg ref={svgRef} width={width} height={height} role="group" aria-label={ariaLabel}>
        {values.map((v, i) => {
          const x = starts[i] * width;
          const w = v * width;
          return (
            <g key={i}>
              <rect
                x={x + 1}
                y={0}
                width={Math.max(0, w - 2)}
                height={height}
                rx={3}
                fill={colors[i]}
                onPointerMove={(e) => dragging === null && showTooltip(e, i)}
                onPointerLeave={() => dragging === null && setTooltip(null)}
              />
              {w >= MIN_LABEL_WIDTH && (
                <text x={x + w / 2} y={height / 2 + 4} textAnchor="middle" className="segment-label" fill={labelColors?.[i] ?? "#ffffff"} pointerEvents="none">
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
        {onBoundaryMove &&
          values.slice(0, -1).map((v, i) => {
            const x = (starts[i] + v) * width;
            return (
              <g key={`b-${i}`}>
                <line x1={x} x2={x} y1={-2} y2={height + 2} className="boundary" pointerEvents="none" />
                <rect
                  x={x - 7}
                  y={0}
                  width={14}
                  height={height}
                  className="boundary-handle"
                  tabIndex={0}
                  role="slider"
                  aria-label={`Boundary between ${labels[i]} and ${labels[i + 1]}`}
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={Number((starts[i] + v).toFixed(3))}
                  onKeyDown={(e) => onKey(e, i)}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(i);
                  }}
                  onPointerMove={(e) => {
                    if (dragging !== i) return;
                    onBoundaryMove(i, Math.round(position(e) * 1000) / 1000);
                    showTooltip(e, i);
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    setDragging(null);
                    setTooltip(null);
                  }}
                />
              </g>
            );
          })}
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}
