import { BarEditor } from "../components/BarEditor";
import { ProductMatrix } from "../components/ProductMatrix";
import type { SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Card, ErrorBanner, Explanation, Op, StatTile, Stepper, useRemembered } from "../components/ui";
import { useApi } from "../lib/api";
import { seriesColor } from "../lib/colors";
import { binomial, format, sampleOpinion, stateLabels } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { MultiplicationResponse, Opinion, OpinionAnalysis } from "../lib/types";

const X_COLOR = seriesColor(0);
const Y_COLOR = seriesColor(1);

const DEFAULT = {
  dims: { x: 2, y: 2 },
  x: binomial(0.6, 0.2, 0.2, 0.5),
  y: binomial(0.3, 0.3, 0.4, 0.4),
};

function OperandCard({
  name,
  opinion,
  analysis,
  labels,
  color,
  onChange,
}: {
  name: "X" | "Y";
  opinion: Opinion;
  analysis?: OpinionAnalysis;
  labels: string[];
  color: string;
  onChange: (o: Opinion) => void;
}) {
  const points: SimplexPoint[] = [
    {
      id: name,
      label: `ω_${name}`,
      opinion,
      color,
      role: "input",
      projection: analysis?.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
      showProjection: true,
    },
  ];
  return (
    <Card
      title={
        <>
          Opinion <Op sub={name} />
        </>
      }
    >
      {hasSimplex(labels.length) && (
        <SimplexView labels={labels} points={points} onChange={(_, o) => onChange(o)} ariaLabel={`Opinion simplex of ${name}`} />
      )}
      <BarEditor
        opinion={opinion}
        onChange={onChange}
        labels={labels}
        color={color}
        projection={analysis?.projection}
        expanded={!hasSimplex(labels.length)}
        name={`the opinion about ${name}`}
      />
    </Card>
  );
}

export function MultiplicationTab() {
  const scheme = useScheme();
  const [state, setState] = useRemembered("multiplication", () => DEFAULT);
  const { dims, x, y } = state;
  const labelsX = stateLabels("x", dims.x);
  const labelsY = stateLabels("y", dims.y);

  const { data, error } = useApi<MultiplicationResponse>("/api/multiplication", { x, y });
  const current = data && data.shape[0] === dims.x && data.shape[1] === dims.y ? data : null;

  const setDims = (next: { x: number; y: number }) =>
    setState({
      dims: next,
      x: next.x === 2 ? DEFAULT.x : sampleOpinion(next.x),
      y: next.y === 2 ? DEFAULT.y : sampleOpinion(next.y, 1),
    });

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Stepper label="States |X|" value={dims.x} min={2} max={4} onChange={(v) => setDims({ ...dims, x: v })} />
        <Stepper label="States |Y|" value={dims.y} min={2} max={4} onChange={(v) => setDims({ ...dims, y: v })} />
      </div>
      <ErrorBanner error={error} />
      <div className="grid three">
        <OperandCard
          name="X"
          opinion={x}
          analysis={current?.x}
          labels={labelsX}
          color={X_COLOR}
          onChange={(o) => setState((s) => ({ ...s, x: o }))}
        />
        <OperandCard
          name="Y"
          opinion={y}
          analysis={current?.y}
          labels={labelsY}
          color={Y_COLOR}
          onChange={(o) => setState((s) => ({ ...s, y: o }))}
        />
        <Card
          title={
            <>
              Product <Op sub="X×Y" /> = <Op sub="X" /> · <Op sub="Y" />
            </>
          }
          subtitle="Normal multiplication, computed by SUBJ."
        >
          {current ? (
            <>
              <div className="stat-row">
                <StatTile label="Uncertainty u(X×Y)" value={format(current.result.uncertainty)} />
                <StatTile label="Belief mass Σb" value={format(1 - current.result.uncertainty)} />
              </div>
              <ProductMatrix
                result={current.result}
                x={current.x}
                y={current.y}
                labelsX={labelsX}
                labelsY={labelsY}
                scheme={scheme}
              />
            </>
          ) : (
            <p className="muted">Waiting for SUBJ…</p>
          )}
        </Card>
      </div>
      <Explanation>
        <p>
          Normal multiplication combines opinions about independent variables X and Y into an opinion over the
          Cartesian product X × Y. Projected probabilities multiply, P(xᵢ, yⱼ) = P(xᵢ)·P(yⱼ), and the base rates
          multiply likewise. The uncertainty is the largest value for which every belief mass b(xᵢ, yⱼ) = P(xᵢ, yⱼ) −
          a(xᵢ, yⱼ)·u stays at least b(xᵢ)·b(yⱼ).
        </p>
      </Explanation>
    </div>
  );
}
