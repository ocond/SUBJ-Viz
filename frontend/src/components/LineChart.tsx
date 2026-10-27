import * as d3 from "d3";
import { useId, useRef, useState, type PointerEvent } from "react";
import { useElementWidth } from "../lib/hooks";
import { format } from "../lib/opinion";
import { Legend } from "./Legend";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

export interface LineSeries {
  label: string;
  color: string;
  values: (number | null)[];
  /** Thicker line with a 10% area wash, for the series the view is about */
  emphasis?: boolean;
}

/** Dirac delta of a dogmatic opinion, drawn as an arrow at x */
export interface Spike {
  label: string;
  color: string;
  x: number;
}

export interface LineChartProps {
  x: number[];
  series: LineSeries[];
  spikes?: Spike[];
  xLabel: string;
  yLabel?: string;
  height?: number;
  ariaLabel: string;
}

const MARGIN = { left: 46, right: 14, top: 14, bottom: 38 };
// The y-range ignores the outermost samples, where densities with alpha < 1 diverge
const Y_RANGE_WINDOW: [number, number] = [0.02, 0.98];

// Plain numbers for densities (0.5, not 500m); SI suffixes only from 1,000 up
const tickFormat = (t: number) => (t >= 1000 ? d3.format("~s")(t) : d3.format("~g")(t));

export function LineChart({ x, series, spikes = [], xLabel, yLabel = "density", height = 210, ariaLabel }: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const innerWidth = Math.max(60, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);

  let yMax = 0;
  for (const s of series) {
    s.values.forEach((v, i) => {
      if (v !== null && x[i] >= Y_RANGE_WINDOW[0] && x[i] <= Y_RANGE_WINDOW[1]) yMax = Math.max(yMax, v);
    });
  }
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax > 0 ? yMax * 1.08 : 1])
    .range([innerHeight, 0])
    .nice(4);

  const line = d3
    .line<number | null>()
    .defined((v) => v !== null)
    .x((_, i) => xScale(x[i]))
    .y((v) => yScale(v as number))
    .curve(d3.curveMonotoneX);
  const area = d3
    .area<number | null>()
    .defined((v) => v !== null)
    .x((_, i) => xScale(x[i]))
    .y0(innerHeight)
    .y1((v) => yScale(v as number))
    .curve(d3.curveMonotoneX);

  const onMove = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = event.clientX - rect.left - MARGIN.left;
    const value = xScale.invert(px);
    const index = d3.leastIndex(x, (a, b) => Math.abs(a - value) - Math.abs(b - value)) ?? 0;
    setHover(index);
    setTooltip({
      x: Math.min(event.clientX - rect.left + 14, width - 150),
      y: MARGIN.top + 4,
      content: (
        <TooltipRows
          title={`${xLabel} = ${format(x[index], 3)}`}
          rows={series.map((s) => ({ label: s.label, value: format(s.values[index], 3), color: s.color }))}
        />
      ),
    });
  };

  const items = [
    ...series.map((s) => ({ label: s.label, color: s.color })),
    ...spikes.map((s) => ({ label: `${s.label} (dogmatic)`, color: s.color })),
  ];

  return (
    <div className="chart" ref={ref}>
      <Legend items={items} />
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={innerWidth} height={innerHeight} />
          </clipPath>
          <marker id={`${clipId}-arrow`} viewBox="0 0 10 10" refX={5} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10Z" fill="context-stroke" />
          </marker>
        </defs>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yScale.ticks(4).map((t) => (
            <g key={t}>
              <line x1={0} x2={innerWidth} y1={yScale(t)} y2={yScale(t)} className="gridline" />
              <text x={-8} y={yScale(t) + 4} textAnchor="end" className="tick-label">
                {tickFormat(t)}
              </text>
            </g>
          ))}
          <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} className="baseline" />
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <text key={t} x={xScale(t)} y={innerHeight + 18} textAnchor="middle" className="tick-label">
              {t}
            </text>
          ))}
          <text x={innerWidth / 2} y={innerHeight + 34} textAnchor="middle" className="axis-caption">
            {xLabel}
          </text>
          <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" className="axis-caption">
            {yLabel}
          </text>

          <g clipPath={`url(#${clipId})`}>
            {series
              .filter((s) => s.emphasis)
              .map((s) => (
                <path key={`area-${s.label}`} d={area(s.values) ?? ""} fill={s.color} fillOpacity={0.1} />
              ))}
            {series.map((s) => (
              <path
                key={s.label}
                d={line(s.values) ?? ""}
                fill="none"
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>
          {spikes.map((s) => (
            <line
              key={s.label}
              x1={xScale(s.x)}
              x2={xScale(s.x)}
              y1={innerHeight}
              y2={6}
              stroke={s.color}
              strokeWidth={2}
              markerEnd={`url(#${clipId}-arrow)`}
            />
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={xScale(x[hover])} x2={xScale(x[hover])} y1={0} y2={innerHeight} className="crosshair" />
              {series.map((s) =>
                s.values[hover] !== null && (s.values[hover] as number) <= yScale.domain()[1] ? (
                  <circle
                    key={s.label}
                    cx={xScale(x[hover])}
                    cy={yScale(s.values[hover] as number)}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          )}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => {
              setHover(null);
              setTooltip(null);
            }}
          />
        </g>
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}
