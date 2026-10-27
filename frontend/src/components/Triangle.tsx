import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { INK, MUTED } from "../lib/colors";
import {
  fromCartesian2,
  projectToSimplex,
  toCartesian2,
  TRIANGLE,
  TRIANGLE_HEIGHT,
  triangleGrid,
  type Vec2,
} from "../lib/geometry";
import { useElementWidth } from "../lib/hooks";
import { format, fromMasses, moveBoundary, setUncertainty } from "../lib/opinion";
import type { Opinion } from "../lib/types";
import { Label, plainLabel, SvgLabel } from "./Label";
import type { SimplexPoint, SimplexViewProps } from "./simplex";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

const MARGIN = { x: 44, top: 30, bottom: 58 };
const MAX_SIDE = 440;
const GRID = triangleGrid();
const KEY_STEP = 0.01;

type DragTarget = "point" | "baseRate";

const round = (v: number) => Math.round(v * 1000) / 1000;

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function pointRows(point: SimplexPoint, labels: string[]) {
  const { opinion } = point;
  const rows = [
    ...opinion.belief.map((b, i) => ({ label: `b(${labels[i]})`, value: format(b) })),
    { label: "u", value: format(opinion.uncertainty) },
    ...opinion.baseRate.slice(0, opinion.baseRate.length === 2 ? 1 : undefined).map((a, i) => ({
      label: `a(${labels[i]})`,
      value: format(a),
    })),
  ];
  if (point.projection) {
    const shown = point.projection.length === 2 ? point.projection.slice(0, 1) : point.projection;
    rows.push(...shown.map((p, i) => ({ label: `P(${labels[i]})`, value: format(p) })));
  }
  return rows;
}

function Marker({ point, at }: { point: SimplexPoint; at: Vec2 }) {
  const [x, y] = at;
  if (point.role === "result") {
    const r = 7.5;
    return (
      <path
        d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
        fill={INK}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    );
  }
  if (point.role === "derived") {
    return <circle cx={x} cy={y} r={5} fill="var(--surface)" stroke={point.color} strokeWidth={2} />;
  }
  return <circle cx={x} cy={y} r={6} fill={point.color} stroke="var(--surface)" strokeWidth={2} />;
}

/** Opinion triangle of a binomial domain with draggable opinions and base rates. */
export function Triangle({ labels, vertexColors, points, overlays = [], onChange, ariaLabel }: SimplexViewProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; target: DragTarget } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const side = Math.max(140, Math.min(MAX_SIDE, width - 2 * MARGIN.x));
  const height = MARGIN.top + side * TRIANGLE_HEIGHT + MARGIN.bottom;
  const ox = (width - side) / 2;
  const baseY = MARGIN.top + TRIANGLE_HEIGHT * side;

  const toPx = ([x, y]: Vec2): Vec2 => [ox + x * side, MARGIN.top + (TRIANGLE_HEIGHT - y) * side];
  const fromPx = (px: number, py: number): Vec2 => [(px - ox) / side, TRIANGLE_HEIGHT - (py - MARGIN.top) / side];
  const massPx = (m: number[]) => toPx(toCartesian2(m));
  // Position of P(x₁) = p on the base, from x₂ (left) to x₁ (right)
  const baseX = (p: number) => ox + p * side;
  const apex = toPx(TRIANGLE[2]);

  const pointer = (event: PointerEvent): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const showTooltip = (event: PointerEvent, point: SimplexPoint, target: DragTarget) => {
    const [x, y] = pointer(event);
    const rows =
      target === "baseRate"
        ? [{ label: `a(${labels[0]})`, value: format(point.opinion.baseRate[0]) }]
        : pointRows(point, labels);
    setTooltip({
      x: x + 14,
      y: y + 14,
      content: (
        <TooltipRows
          title={
            <>
              <Label text={point.label} />
              {point.note && ` · ${point.note}`}
            </>
          }
          rows={rows}
        />
      ),
    });
  };

  const apply = (point: SimplexPoint, opinion: Opinion) => onChange?.(point.id, opinion);

  const moveTo = (event: PointerEvent, point: SimplexPoint, target: DragTarget) => {
    const [px, py] = pointer(event);
    if (target === "point") {
      const m = projectToSimplex(fromCartesian2(fromPx(px, py))).map(round);
      apply(point, fromMasses(m, point.opinion.baseRate));
    } else {
      const a = round(clamp01((px - ox) / side));
      apply(point, { ...point.opinion, baseRate: [a, 1 - a] });
    }
  };

  const handlers = (point: SimplexPoint, target: DragTarget) => ({
    onPointerDown: (event: PointerEvent<SVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ id: point.id, target });
      moveTo(event, point, target);
      showTooltip(event, point, target);
    },
    onPointerMove: (event: PointerEvent<SVGElement>) => {
      if (drag?.id === point.id && drag.target === target) moveTo(event, point, target);
      showTooltip(event, point, target);
    },
    onPointerUp: (event: PointerEvent<SVGElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDrag(null);
    },
    onPointerLeave: () => {
      if (!drag) setTooltip(null);
    },
  });

  const onPointKey = (event: KeyboardEvent, point: SimplexPoint) => {
    const { opinion } = point;
    const [b1, b2] = opinion.belief;
    let next: Opinion | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Shift belief between x₁ and x₂ at constant uncertainty
      const delta = event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP;
      next = fromMasses(moveBoundary([b1, b2, opinion.uncertainty], 0, b1 + delta), opinion.baseRate);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const delta = event.key === "ArrowUp" ? KEY_STEP : -KEY_STEP;
      next = setUncertainty(opinion, round(opinion.uncertainty + delta));
    }
    if (next) {
      event.preventDefault();
      apply(point, next);
    }
  };

  const onBaseRateKey = (event: KeyboardEvent, point: SimplexPoint) => {
    const delta = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[
      event.key
    ];
    if (delta === undefined) return;
    event.preventDefault();
    const a = round(clamp01(point.opinion.baseRate[0] + delta));
    apply(point, { ...point.opinion, baseRate: [a, 1 - a] });
  };

  const corners = TRIANGLE.map(toPx);
  const ordered = [...points].sort(
    (p, q) => ["derived", "input", "result"].indexOf(p.role) - ["derived", "input", "result"].indexOf(q.role),
  );

  return (
    <div className="simplex" ref={containerRef}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="group"
        aria-label={ariaLabel}
        className={drag ? "dragging" : undefined}
      >
        <polygon points={corners.map((c) => c.join(",")).join(" ")} className="simplex-face" />
        {GRID.map(([from, to], i) => {
          const [x1, y1] = massPx(from);
          const [x2, y2] = massPx(to);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="simplex-grid" />;
        })}
        <polygon points={corners.map((c) => c.join(",")).join(" ")} className="simplex-edge" />

        {overlays.map((overlay, i) => {
          const pts = overlay.points.map(massPx);
          const color = overlay.color ?? MUTED;
          if (overlay.kind === "polygon") {
            return (
              <polygon
                key={i}
                points={pts.map((p) => p.join(",")).join(" ")}
                fill={color}
                fillOpacity={overlay.opacity ?? 0.08}
                stroke={color}
                strokeOpacity={0.6}
                strokeWidth={overlay.width ?? 1}
                strokeLinejoin="round"
              />
            );
          }
          return (
            <line
              key={i}
              x1={pts[0][0]}
              y1={pts[0][1]}
              x2={pts[1][0]}
              y2={pts[1][1]}
              stroke={color}
              strokeOpacity={overlay.opacity ?? 0.5}
              strokeWidth={overlay.width ?? 1}
            />
          );
        })}

        {points
          .filter((p) => p.showProjection && p.projection)
          .map((p) => {
            const at = massPx([...p.opinion.belief, p.opinion.uncertainty]);
            const a = baseX(p.opinion.baseRate[0]);
            const proj = baseX(p.projection![0]);
            return (
              <g key={`proj-${p.id}`} pointerEvents="none">
                <line x1={apex[0]} y1={apex[1]} x2={a} y2={baseY} stroke={p.color} strokeOpacity={0.35} />
                <line
                  x1={at[0]}
                  y1={at[1]}
                  x2={proj}
                  y2={baseY}
                  stroke={p.color}
                  strokeOpacity={0.8}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <circle cx={proj} cy={baseY} r={4} fill="var(--surface)" stroke={p.color} strokeWidth={2} />
              </g>
            );
          })}

        {points
          .filter((p) => p.showBaseRate)
          .map((p) => {
            const x = baseX(p.opinion.baseRate[0]);
            return (
              <path
                key={`a-${p.id}`}
                d={`M${x} ${baseY + 3}L${x + 6} ${baseY + 13}L${x - 6} ${baseY + 13}Z`}
                fill={p.role === "result" ? INK : p.color}
                pointerEvents="none"
              />
            );
          })}

        {ordered.map((p) => (
          <Marker key={`m-${p.id}`} point={p} at={massPx([...p.opinion.belief, p.opinion.uncertainty])} />
        ))}
        {ordered.map((p) => {
          const [x, y] = massPx([...p.opinion.belief, p.opinion.uncertainty]);
          return (
            <SvgLabel key={`l-${p.id}`} text={p.label} x={x + 10} y={y - 9} className="point-label" />
          );
        })}

        {vertexColors && (
          <>
            <circle cx={corners[0][0] + 13} cy={corners[0][1]} r={4} fill={vertexColors[0]} />
            <circle cx={corners[1][0] - 13} cy={corners[1][1]} r={4} fill={vertexColors[1]} />
          </>
        )}
        <text
          x={corners[0][0] + (vertexColors ? 21 : 8)}
          y={corners[0][1] + 4}
          className="vertex-label"
          textAnchor="start"
        >
          {labels[0]}
        </text>
        <text
          x={corners[1][0] - (vertexColors ? 21 : 8)}
          y={corners[1][1] + 4}
          className="vertex-label"
          textAnchor="end"
        >
          {labels[1]}
        </text>
        <text x={apex[0]} y={apex[1] - 10} className="vertex-label" textAnchor="middle">
          u
        </text>
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={baseX(t)} y={baseY + 30} className="tick-label" textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={ox + side / 2} y={baseY + 48} className="axis-caption" textAnchor="middle">
          P({labels[0]}) and a({labels[0]}) along the base
        </text>

        {points
          .filter((p) => p.baseRateDraggable && p.showBaseRate)
          .map((p) => (
            <rect
              key={`ah-${p.id}`}
              x={baseX(p.opinion.baseRate[0]) - 11}
              y={baseY}
              width={22}
              height={20}
              className="hit-area"
              tabIndex={0}
              role="slider"
              aria-label={`Base rate of ${plainLabel(p.label)}`}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={p.opinion.baseRate[0]}
              onKeyDown={(e) => onBaseRateKey(e, p)}
              {...handlers(p, "baseRate")}
            />
          ))}
        {points.map((p) => {
          const [x, y] = massPx([...p.opinion.belief, p.opinion.uncertainty]);
          const interactive = p.draggable && onChange;
          return (
            <circle
              key={`h-${p.id}`}
              cx={x}
              cy={y}
              r={14}
              className={interactive ? "hit-area draggable" : "hit-area"}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "slider" : undefined}
              aria-label={
                interactive ? `${plainLabel(p.label)}: arrows move belief, up and down change uncertainty` : undefined
              }
              aria-valuetext={
                interactive
                  ? `b ${format(p.opinion.belief[0])}, d ${format(p.opinion.belief[1])}, u ${format(p.opinion.uncertainty)}`
                  : undefined
              }
              onKeyDown={interactive ? (e) => onPointKey(e, p) : undefined}
              {...(interactive
                ? handlers(p, "point")
                : {
                    onPointerMove: (e: PointerEvent) => showTooltip(e, p, "point"),
                    onPointerLeave: () => setTooltip(null),
                  })}
            />
          );
        })}
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}
