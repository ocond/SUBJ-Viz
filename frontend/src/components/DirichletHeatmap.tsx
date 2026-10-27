import * as d3 from "d3";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { INK } from "../lib/colors";
import { useElementWidth } from "../lib/hooks";
import { format } from "../lib/opinion";
import type { Pdf } from "../lib/types";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

// Sequential blue ramp (steps 100…700); near-zero recedes towards the surface in both modes
const RAMP_LIGHT = ["#f3f8fe", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const RAMP_DARK = ["#1e1f22", "#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];

const H = Math.sqrt(3) / 2;
const MARGIN = { x: 26, top: 22, bottom: 30 };

/** Probability simplex corners: p₁ bottom left, p₂ bottom right, p₃ top. */
function toXY(p: number[]): [number, number] {
  return [p[1] + 0.5 * p[2], p[2] * H];
}

function cellCorners(n: number, i: number, j: number, down: number): number[][] {
  if (!down) {
    const k = n - 1 - i - j;
    return [
      [i, j, k + 1],
      [i + 1, j, k],
      [i, j + 1, k],
    ].map((c) => c.map((v) => v / n));
  }
  const k = n - 2 - i - j;
  return [
    [i + 1, j + 1, k],
    [i, j + 1, k + 1],
    [i + 1, j, k + 1],
  ].map((c) => c.map((v) => v / n));
}

export interface DirichletHeatmapProps {
  pdf: Pdf;
  labels: string[];
  projection?: number[];
  scheme: "light" | "dark";
  ariaLabel: string;
}

/** Density of a trinomial opinion's Dirichlet PDF over the probability simplex. */
export function DirichletHeatmap({ pdf, labels, projection, scheme, ariaLabel }: DirichletHeatmapProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const side = Math.max(120, Math.min(320, width - 2 * MARGIN.x));
  const height = MARGIN.top + side * H + MARGIN.bottom + 26;
  const ox = (width - side) / 2;
  const px = ([x, y]: [number, number]): [number, number] => [ox + x * side, MARGIN.top + (H - y) * side];

  const n = pdf.resolution ?? 1;
  const cells = pdf.cells ?? [];

  const { color, max } = useMemo(() => {
    const densities = cells.map((c) => c[3]).filter((d): d is number => d !== null).sort(d3.ascending);
    // Clip at the 98th percentile so diverging corners do not wash out the interior
    const top = d3.quantileSorted(densities, 0.98) ?? 1;
    const ramp = scheme === "dark" ? RAMP_DARK : RAMP_LIGHT;
    const scale = d3.scaleSequential(d3.piecewise(d3.interpolateLab, ramp)).domain([0, top || 1]).clamp(true);
    return { color: scale, max: top || 1 };
  }, [cells, scheme]);

  const onMove = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left - ox) / side;
    const y = H - (event.clientY - rect.top - MARGIN.top) / side;
    const p3 = y / H;
    const p2 = x - 0.5 * p3;
    const p1 = 1 - p2 - p3;
    if (Math.min(p1, p2, p3) < 0) {
      setTooltip(null);
      return;
    }
    // Locate the cell containing the pointer
    const i = Math.min(n - 1, Math.floor(p1 * n));
    const j = Math.min(n - 1 - i, Math.floor(p2 * n));
    const down = p1 * n - i + (p2 * n - j) > 1 ? 1 : 0;
    const cell = cells.find((c) => c[0] === i && c[1] === j && c[2] === down);
    setTooltip({
      x: event.clientX - rect.left + 14,
      y: event.clientY - rect.top + 14,
      content: (
        <TooltipRows
          rows={[
            { label: "density", value: format(cell?.[3] ?? null, 3) },
            ...[p1, p2, p3].map((p, k) => ({ label: `p(${labels[k]})`, value: format(p, 3) })),
          ]}
        />
      ),
    });
  };

  const corners = [px(toXY([1, 0, 0])), px(toXY([0, 1, 0])), px(toXY([0, 0, 1]))];
  const gradientId = `dirichlet-legend-${scheme}`;
  const legendWidth = Math.min(180, side);
  const legendX = (width - legendWidth) / 2;
  const legendY = MARGIN.top + side * H + MARGIN.bottom;

  return (
    <div className="chart" ref={ref}>
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId}>
            {d3.range(0, 1.0001, 0.125).map((t) => (
              <stop key={t} offset={`${t * 100}%`} stopColor={color(t * max)} />
            ))}
          </linearGradient>
        </defs>
        <g onPointerMove={onMove} onPointerLeave={() => setTooltip(null)}>
          {cells.map(([i, j, down, density]) => {
            const fill = density === null ? color(max) : color(density);
            const points = cellCorners(n, i, j, down)
              .map((c) => px(toXY(c)).join(","))
              .join(" ");
            return <polygon key={`${i}-${j}-${down}`} points={points} fill={fill} stroke={fill} strokeWidth={0.6} />;
          })}
        </g>
        <polygon points={corners.map((c) => c.join(",")).join(" ")} className="simplex-edge" pointerEvents="none" />
        {projection && (
          <g pointerEvents="none">
            <circle
              cx={px(toXY(projection))[0]}
              cy={px(toXY(projection))[1]}
              r={5}
              fill={INK}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}
        <text x={corners[0][0] - 6} y={corners[0][1] + 14} textAnchor="end" className="vertex-label">
          {labels[0]}
        </text>
        <text x={corners[1][0] + 6} y={corners[1][1] + 14} textAnchor="start" className="vertex-label">
          {labels[1]}
        </text>
        <text x={corners[2][0]} y={corners[2][1] - 8} textAnchor="middle" className="vertex-label">
          {labels[2]}
        </text>
        <rect x={legendX} y={legendY} width={legendWidth} height={8} rx={2} fill={`url(#${gradientId})`} />
        <text x={legendX} y={legendY + 22} className="tick-label" textAnchor="start">
          0
        </text>
        <text x={legendX + legendWidth} y={legendY + 22} className="tick-label" textAnchor="end">
          ≥ {d3.format(".3~s")(max)}
        </text>
        <text x={legendX + legendWidth / 2} y={legendY + 22} className="tick-label" textAnchor="middle">
          density
        </text>
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}
