import { BarEditor } from "../components/BarEditor";
import { OpinionTable } from "../components/OpinionTable";
import { PdfPanel } from "../components/PdfPanel";
import type { SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Card, ErrorBanner, Explanation, Op, Segmented, Stepper, useRemembered } from "../components/ui";
import { useApi } from "../lib/api";
import { INK, seriesColor } from "../lib/colors";
import { binomial, focusedOpinion, stateLabels } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { FusionMethod, FusionResponse, Opinion } from "../lib/types";

const SOURCE_NAMES = ["A", "B", "C", "D", "E"];

const DEFAULT = {
  method: "cumulative" as FusionMethod,
  dim: 2,
  opinions: [binomial(0.5, 0.1, 0.4, 0.5), binomial(0.2, 0.3, 0.5, 0.5)],
};

function sources(dim: number, count: number): Opinion[] {
  if (dim === 2 && count === 2) return DEFAULT.opinions;
  return Array.from({ length: count }, (_, i) => focusedOpinion(dim, i, 0.45, 0.35 + 0.1 * (i % 3)));
}

export function FusionTab() {
  const scheme = useScheme();
  const [state, setState] = useRemembered("fusion", () => DEFAULT);
  const { method, dim, opinions } = state;
  const labels = stateLabels("x", dim);
  const names = SOURCE_NAMES.slice(0, opinions.length);
  const operator = method === "cumulative" ? "⊕" : "⊕̲";
  const resultLabel = `ω^${names.join(operator)}_X`;

  const { data, error } = useApi<FusionResponse>("/api/fusion", { method, opinions, pdf: true });
  const current = data && data.opinions.length === opinions.length && data.result.belief.length === dim ? data : null;

  const setSource = (i: number, o: Opinion) =>
    setState((s) => ({ ...s, opinions: s.opinions.map((x, j) => (j === i ? o : x)) }));

  const points: SimplexPoint[] = opinions.map((o, i) => ({
    id: `s${i}`,
    label: `ω^${names[i]}_X`,
    opinion: o,
    color: seriesColor(i),
    role: "input",
    projection: current?.opinions[i].projection,
    draggable: true,
    baseRateDraggable: true,
    showBaseRate: true,
  }));
  if (current) {
    points.push({
      id: "result",
      label: resultLabel,
      opinion: current.result,
      color: INK,
      role: "result",
      projection: current.result.projection,
      showBaseRate: true,
      showProjection: true,
    });
  }

  const entries = [
    ...opinions.map((_, i) => ({
      label: `ω^${names[i]}_X`,
      color: seriesColor(i),
      shape: "dot" as const,
      analysis: current?.opinions[i],
    })),
    { label: resultLabel, color: INK, shape: "diamond" as const, analysis: current?.result, emphasis: true },
  ];

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Segmented
          label="Operator"
          value={method}
          onChange={(m) => setState((s) => ({ ...s, method: m }))}
          options={[
            { value: "cumulative", label: "Cumulative (CBF)" },
            { value: "averaging", label: "Averaging (ABF)" },
          ]}
        />
        <Stepper
          label="States |X|"
          value={dim}
          min={2}
          max={6}
          onChange={(d) => setState((s) => ({ ...s, dim: d, opinions: sources(d, s.opinions.length) }))}
        />
        <Stepper
          label="Sources"
          value={opinions.length}
          min={2}
          max={5}
          onChange={(n) => setState((s) => ({ ...s, opinions: sources(s.dim, n) }))}
        />
      </div>
      <ErrorBanner error={error} />
      <div className="grid two">
        <Card
          title={
            <>
              Sources and fused opinion <Op sub="X" sup={names.join(operator)} />
            </>
          }
          subtitle={
            hasSimplex(dim)
              ? "Drag the source opinions and their base rate markers."
              : "Edit the sources below; the fused opinion is shown as bars."
          }
        >
          {hasSimplex(dim) ? (
            <SimplexView
              labels={labels}
              points={points}
              onChange={(id, o) => id.startsWith("s") && setSource(Number(id.slice(1)), o)}
              ariaLabel="Opinion simplex with source and fused opinions"
            />
          ) : (
            current && (
              <BarEditor
                opinion={current.result}
                labels={labels}
                color={INK}
                projection={current.result.projection}
                expanded
                name="the fused opinion"
              />
            )
          )}
        </Card>
        <Card title="Probability density" subtitle="Fusion of independent evidence sharpens the PDF.">
          <PdfPanel entries={dim > 3 ? entries.slice(-1) : entries} labels={labels} scheme={scheme} />
        </Card>
      </div>
      <div className="grid two">
        <Card title="Source opinions">
          <div className="editor-list">
            {opinions.map((o, i) => (
              <div key={i} className="editor-item">
                <h4 className="editor-title">
                  <span className="dot" style={{ background: seriesColor(i) }} />
                  <Op sub="X" sup={names[i]} />
                </h4>
                <BarEditor
                  opinion={o}
                  onChange={(next) => setSource(i, next)}
                  labels={labels}
                  color={seriesColor(i)}
                  projection={current?.opinions[i].projection}
                  name={`source ${names[i]}`}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Values" subtitle="All values computed by SUBJ.">
          <OpinionTable caption="Source and fused opinions" labels={labels} entries={entries} />
        </Card>
      </div>
      <Explanation>
        <p>
          In evidence terms (rᵢ = W·bᵢ / u), <strong>cumulative fusion</strong> adds the evidence of independent
          sources, so the fused opinion is more certain than every source. <strong>Averaging fusion</strong> averages
          the evidence of dependent sources. A dogmatic source (u = 0) dominates both operators; fusing only vacuous
          opinions yields the vacuous opinion with the average base rate.
        </p>
      </Explanation>
    </div>
  );
}
