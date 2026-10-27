import { BarEditor } from "../components/BarEditor";
import { PdfPanel } from "../components/PdfPanel";
import type { SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Card, ErrorBanner, Explanation, Op, StatTile, Stepper, useRemembered } from "../components/ui";
import { MUTED, SERIES } from "../lib/colors";
import { useApi } from "../lib/api";
import { format, fromMasses, sampleOpinion, stateLabels } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { Opinion, OpinionsResponse } from "../lib/types";

const COLOR = SERIES[0];

export function OpinionTab() {
  const scheme = useScheme();
  const [dim, setDim] = useRemembered("opinion.dim", () => 2);
  const [opinion, setOpinion] = useRemembered<Opinion>("opinion.opinion", () => sampleOpinion(2));
  const labels = stateLabels("x", dim);

  const { data, error } = useApi<OpinionsResponse>("/api/opinions", { opinions: [opinion], pdf: true });
  const analysis = data?.opinions[0];
  const current = analysis && analysis.belief.length === dim ? analysis : undefined;

  const changeDim = (d: number) => {
    setDim(d);
    setOpinion(sampleOpinion(d));
  };

  const points: SimplexPoint[] = [
    {
      id: "opinion",
      label: "ω_X",
      opinion,
      color: COLOR,
      role: "input",
      projection: current?.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
      showProjection: true,
    },
  ];
  if (current) {
    // Uncertainty-maximized opinion: same projection, as much uncertainty as the base rate allows
    const uMax = current.uncertaintyMaximum;
    const belief = current.projection.map((p, i) => p - current.baseRate[i] * uMax);
    points.unshift({
      id: "umax",
      label: "ω̈_X",
      note: "uncertainty-maximized",
      opinion: fromMasses([...belief, uMax], current.baseRate),
      color: MUTED,
      role: "derived",
    });
  }

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Stepper label="States |X|" value={dim} min={2} max={8} onChange={changeDim} />
      </div>
      <ErrorBanner error={error} />
      <div className="grid two">
        <Card
          title={
            <>
              Opinion <Op sub="X" />
            </>
          }
          subtitle={
            hasSimplex(dim)
              ? "Drag the opinion or its base rate marker. The dashed projector runs parallel to the director (from the apex to the base rate) onto the projected probability."
              : "Drag the boundaries in the bars or edit the values."
          }
        >
          {hasSimplex(dim) && (
            <SimplexView
              labels={labels}
              points={points}
              onChange={(id, o) => id === "opinion" && setOpinion(o)}
              ariaLabel="Opinion simplex"
            />
          )}
          <BarEditor
            opinion={opinion}
            onChange={setOpinion}
            labels={labels}
            color={COLOR}
            projection={current?.projection}
            expanded={!hasSimplex(dim)}
            name="the opinion"
          />
        </Card>
        <div className="stack">
          <Card title="Derived by SUBJ" subtitle="Projection P = b + a·u, variance of the Dirichlet PDF, prior weight W.">
            <div className="stat-row">
              <StatTile label="Uncertainty maximum" value={format(current?.uncertaintyMaximum)} detail="min P(xᵢ) / a(xᵢ)" />
              <StatTile label="Prior weight W" value={format(current?.priorWeight, 0)} detail="SUBJ uses W = |X|" />
            </div>
            <div className="table-scroll">
              <table className="opinion-table">
                <thead>
                  <tr>
                    <th scope="col">State</th>
                    <th scope="col">P</th>
                    <th scope="col">Var</th>
                    <th scope="col">α</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map((l, i) => (
                    <tr key={l}>
                      <th scope="row">{l}</th>
                      <td className="numeric">{format(current?.projection[i])}</td>
                      <td className="numeric">{format(current?.variance[i], 4)}</td>
                      <td className="numeric">{current?.strength ? format(current.strength[i], 2) : "∞"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card
            title="Probability density"
            subtitle={
              dim === 2
                ? "Beta PDF of p(x₁)."
                : dim === 3
                  ? "Dirichlet PDF over the probability simplex; the dot is the projected probability."
                  : "Beta marginals of the Dirichlet PDF."
            }
          >
            <PdfPanel entries={[{ label: "ω_X", color: COLOR, analysis: current, emphasis: true }]} labels={labels} scheme={scheme} />
          </Card>
        </div>
      </div>
      <Explanation>
        <p>
          A subjective opinion <Op sub="X" /> = (b, u, a) distributes belief mass b over the states of X and
          uncertainty mass u = 1 − Σb, with base rate a as prior. It is equivalent to a Dirichlet PDF with evidence
          rᵢ = W·bᵢ / u. The hollow marker <Op base="ω̈" sub="X" /> is the uncertainty-maximized opinion with the
          same projected probability.
        </p>
      </Explanation>
    </div>
  );
}
