import * as d3 from "d3";
import { BarEditor } from "../components/BarEditor";
import { OpinionTable } from "../components/OpinionTable";
import { PdfPanel } from "../components/PdfPanel";
import type { Mass, Overlay, SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Card, ErrorBanner, Explanation, Op, Stepper, useRemembered } from "../components/ui";
import { useApi } from "../lib/api";
import { INK, MUTED, seriesColor } from "../lib/colors";
import { mapToSubSimplex, toCartesian2, triangleGrid } from "../lib/geometry";
import { binomial, focusedOpinion, format, masses, sampleOpinion, stateLabels } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { DeductionResponse, Opinion } from "../lib/types";

const GRID = triangleGrid();

const DEFAULT = {
  dims: { x: 2, y: 2 },
  antecedent: binomial(0.55, 0.15, 0.3, 0.4),
  conditionals: [binomial(0.8, 0.05, 0.15), binomial(0.15, 0.6, 0.25)],
};

function defaults(x: number, y: number) {
  if (x === 2 && y === 2) return DEFAULT;
  return {
    dims: { x, y },
    antecedent: sampleOpinion(x),
    conditionals: Array.from({ length: x }, (_, i) => focusedOpinion(y, i)),
  };
}

/** Vertices of the sub-simplex in hull order, for drawing it as a polygon in the triangle. */
function hullOrder(points: Mass[]): Mass[] {
  const cartesian = points.map((m) => toCartesian2(m));
  const hull = d3.polygonHull(cartesian);
  return hull ? hull.map((p) => points[cartesian.indexOf(p as [number, number])]) : points;
}

export function DeductionTab() {
  const scheme = useScheme();
  const [state, setState] = useRemembered("deduction", () => DEFAULT);
  const { dims, antecedent, conditionals } = state;
  const labelsX = stateLabels("x", dims.x);
  const labelsY = stateLabels("y", dims.y);
  const colors = labelsX.map((_, i) => seriesColor(i));

  const { data, error } = useApi<DeductionResponse>("/api/deduction", { antecedent, conditionals, pdf: true });
  const current =
    data && data.vertices.length === dims.x && data.result.belief.length === dims.y ? data : null;

  const setAntecedent = (o: Opinion) => setState((s) => ({ ...s, antecedent: o }));
  const setConditional = (i: number, o: Opinion) =>
    setState((s) => ({
      ...s,
      // The views show the conditionals with the marginal base rate; keep their own base rate
      conditionals: s.conditionals.map((c, j) => (j === i ? { ...c, belief: o.belief, uncertainty: o.uncertainty } : c)),
    }));

  const conditionalLabel = (i: number) => `ω_Y|${labelsX[i]}`;

  const antecedentPoints: SimplexPoint[] = [
    {
      id: "antecedent",
      label: "ω_X",
      opinion: antecedent,
      color: INK,
      role: "input",
      projection: current?.antecedent.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
      showProjection: true,
    },
  ];

  const consequentPoints: SimplexPoint[] = conditionals.map((c, i) => ({
    id: `c${i}`,
    label: conditionalLabel(i),
    opinion: { ...c, baseRate: current?.marginalBaseRate ?? c.baseRate },
    color: colors[i],
    role: "input",
    projection: current?.vertices[i].projection,
    draggable: true,
  }));
  const overlays: Overlay[] = [];

  if (current) {
    consequentPoints.unshift({
      id: "apex",
      label: "ω_Y‖x̂",
      note: "deduced from the vacuous antecedent",
      opinion: current.apex,
      color: MUTED,
      role: "derived",
      projection: current.apex.projection,
    });
    consequentPoints.push({
      id: "result",
      label: "ω_Y‖X",
      opinion: current.result,
      color: INK,
      role: "result",
      projection: current.result.projection,
      showBaseRate: true,
      showProjection: true,
    });

    const vertexMasses = current.vertices.map(masses);
    const apexMasses = masses(current.apex);
    const corners = [...vertexMasses, apexMasses];
    overlays.push({ kind: "polygon", points: dims.y === 2 ? hullOrder(corners) : corners, color: INK, opacity: 0.06 });
    if (dims.x === 2) {
      // The antecedent triangle's grid, mapped onto the sub-simplex
      for (const [from, to] of GRID) {
        overlays.push({
          kind: "segment",
          points: [mapToSubSimplex(from, vertexMasses, apexMasses), mapToSubSimplex(to, vertexMasses, apexMasses)],
          color: MUTED,
          opacity: 0.45,
        });
      }
    }
  }

  const reset = (x = dims.x, y = dims.y) => setState(defaults(x, y));

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Stepper label="Antecedent states |X|" value={dims.x} min={2} max={6} onChange={(x) => reset(x, dims.y)} />
        <Stepper label="Consequent states |Y|" value={dims.y} min={2} max={6} onChange={(y) => reset(dims.x, y)} />
        <button type="button" className="button" onClick={() => reset()}>
          Reset
        </button>
      </div>
      <ErrorBanner error={error} />
      <div className="grid two">
        <Card
          title={
            <>
              Antecedent <Op sub="X" />
            </>
          }
          subtitle={
            hasSimplex(dims.x)
              ? "Drag the antecedent opinion and its base rate. Its position is mapped linearly into the sub-simplex on the right."
              : "Edit the antecedent with the bars or values."
          }
        >
          {hasSimplex(dims.x) && (
            <SimplexView
              labels={labelsX}
              vertexColors={colors}
              points={antecedentPoints}
              onChange={(_, o) => setAntecedent(o)}
              ariaLabel="Antecedent opinion simplex"
            />
          )}
          <BarEditor
            opinion={antecedent}
            onChange={setAntecedent}
            labels={labelsX}
            color={INK}
            projection={current?.antecedent.projection}
            expanded={!hasSimplex(dims.x)}
            name="the antecedent"
          />
        </Card>
        <Card
          title={
            <>
              Conditionals and deduced opinion <Op sub="Y‖X" />
            </>
          }
          subtitle={
            hasSimplex(dims.y)
              ? "Drag the conditionals. They span the shaded sub-simplex whose apex is the deduction from a vacuous antecedent."
              : "Edit the conditionals below; the deduced opinion is shown as bars."
          }
        >
          {hasSimplex(dims.y) ? (
            <SimplexView
              labels={labelsY}
              points={consequentPoints}
              overlays={overlays}
              onChange={(id, o) => id.startsWith("c") && setConditional(Number(id.slice(1)), o)}
              ariaLabel="Consequent opinion simplex with conditionals and deduced opinion"
            />
          ) : (
            current && (
              <BarEditor
                opinion={current.result}
                labels={labelsY}
                color={INK}
                projection={current.result.projection}
                expanded
                name="the deduced opinion"
              />
            )
          )}
          <p className="caption">
            Marginal base rate a(Y) ={" "}
            {current ? `(${current.marginalBaseRate.map((a) => format(a)).join(", ")})` : "…"}, derived by SUBJ from the
            conditionals and a(X); it replaces the base rates of the conditionals.
          </p>
        </Card>
      </div>
      <div className="grid two">
        <Card title="Conditional opinions" subtitle="One conditional per antecedent state, with their color.">
          <div className="editor-list">
            {conditionals.map((c, i) => (
              <div key={i} className="editor-item">
                <h4 className="editor-title">
                  <span className="dot" style={{ background: colors[i] }} />
                  <Op sub={`Y|${labelsX[i]}`} />
                </h4>
                <BarEditor
                  opinion={c}
                  onChange={(o) => setConditional(i, o)}
                  labels={labelsY}
                  color={colors[i]}
                  projection={current?.vertices[i].projection}
                  hideBaseRate
                  name={`the conditional for ${labelsX[i]}`}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Deduction result" subtitle="All values computed by SUBJ.">
          <OpinionTable
            caption="Conditionals with marginal base rate, sub-simplex apex and deduced opinion"
            labels={labelsY}
            entries={[
              ...conditionals.map((_, i) => ({
                label: conditionalLabel(i),
                color: colors[i],
                shape: "dot" as const,
                analysis: current?.vertices[i],
              })),
              { label: "ω_Y‖x̂", color: MUTED, shape: "ring" as const, analysis: current?.apex },
              { label: "ω_Y‖X", color: INK, shape: "diamond" as const, analysis: current?.result },
            ]}
          />
          <h4 className="section-title">Probability density of the deduced opinion</h4>
          <PdfPanel entries={[{ label: "ω_Y‖X", color: INK, analysis: current?.result, emphasis: true }]} labels={labelsY} scheme={scheme} />
        </Card>
      </div>
      <Explanation>
        <p>
          Deduction derives <Op sub="Y‖X" /> from the antecedent <Op sub="X" /> and one conditional{" "}
          <Op sub="Y|xᵢ" /> per state xᵢ. Deducing from a dogmatic antecedent xᵢ yields the conditional itself, from the
          vacuous antecedent the apex <Op sub="Y‖x̂" />. These opinions span a sub-simplex of the consequent simplex,
          and the deduced opinion is the image of the antecedent under the linear map of the antecedent simplex onto
          it: Σᵢ b(xᵢ)·<Op sub="Y|xᵢ" /> + u<sub>X</sub>·<Op sub="Y‖x̂" />. Its projected probability obeys the law
          of total probability, P(y‖X) = Σᵢ P(xᵢ)·P(y|xᵢ).
        </p>
      </Explanation>
    </div>
  );
}
