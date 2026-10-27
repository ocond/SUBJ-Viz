import { BarEditor } from "../components/BarEditor";
import { OpinionTable } from "../components/OpinionTable";
import { PdfPanel } from "../components/PdfPanel";
import type { Overlay, SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Triangle } from "../components/Triangle";
import { Card, ErrorBanner, Explanation, Op, StatTile, Stepper, useRemembered } from "../components/ui";
import { useApi } from "../lib/api";
import { INK, MUTED, seriesColor } from "../lib/colors";
import { binomial, focusedOpinion, format, masses, stateLabels, vacuous } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { Opinion, TrustDiscountingResponse } from "../lib/types";

const TRUST_COLOR = seriesColor(0);
const SOURCE_COLOR = seriesColor(1);

const DEFAULT = {
  dim: 2,
  trust: binomial(0.6, 0.15, 0.25, 0.5),
  opinion: binomial(0.7, 0.2, 0.1, 0.5),
};

export function TrustTab() {
  const scheme = useScheme();
  const [state, setState] = useRemembered("trust", () => DEFAULT);
  const { dim, trust, opinion } = state;
  const labels = stateLabels("x", dim);

  const { data, error } = useApi<TrustDiscountingResponse>("/api/trust-discounting", { trust, opinion, pdf: true });
  const current = data && data.result.belief.length === dim ? data : null;

  const setTrust = (o: Opinion) => setState((s) => ({ ...s, trust: o }));
  const setOpinion = (o: Opinion) => setState((s) => ({ ...s, opinion: o }));

  const trustPoints: SimplexPoint[] = [
    {
      id: "trust",
      label: "ω^A_B",
      opinion: trust,
      color: TRUST_COLOR,
      role: "input",
      projection: current?.trust.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
      showProjection: true,
    },
  ];

  const points: SimplexPoint[] = [
    {
      id: "opinion",
      label: "ω^B_X",
      opinion,
      color: SOURCE_COLOR,
      role: "input",
      projection: current?.opinion.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
    },
  ];
  const overlays: Overlay[] = [];
  if (current) {
    points.push({
      id: "result",
      label: "ω^[A;B]_X",
      opinion: current.result,
      color: INK,
      role: "result",
      projection: current.result.projection,
      showProjection: true,
    });
    // The discounted opinion lies on the segment from the source's opinion to the vacuous opinion
    overlays.push({ kind: "segment", points: [masses(opinion), masses(vacuous(dim))], color: MUTED, opacity: 0.7 });
  }

  const entries = [
    { label: "ω^B_X", color: SOURCE_COLOR, shape: "dot" as const, analysis: current?.opinion },
    { label: "ω^[A;B]_X", color: INK, shape: "diamond" as const, analysis: current?.result, emphasis: true },
  ];

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Stepper
          label="States |X|"
          value={dim}
          min={2}
          max={6}
          onChange={(d) => setState((s) => ({ ...s, dim: d, opinion: d === 2 ? DEFAULT.opinion : focusedOpinion(d, 0, 0.6, 0.1) }))}
        />
      </div>
      <ErrorBanner error={error} />
      <div className="grid two">
        <Card
          title={
            <>
              Trust of A in B <Op sub="B" sup="A" />
            </>
          }
          subtitle="Drag the trust opinion. Its projected probability is the discount factor."
        >
          <Triangle
            labels={["trust", "distrust"]}
            points={trustPoints}
            onChange={(_, o) => setTrust(o)}
            ariaLabel="Trust opinion triangle"
          />
          <div className="stat-row">
            <StatTile label="Trust probability P(trust)" value={format(current?.trustProbability)} detail="b + a·u of the trust opinion" />
          </div>
        </Card>
        <Card
          title={
            <>
              B's opinion <Op sub="X" sup="B" /> and A's derived opinion <Op sub="X" sup="[A;B]" />
            </>
          }
          subtitle={
            hasSimplex(dim)
              ? "Discounting moves the opinion towards the vacuous opinion (the apex), by the factor P(trust)."
              : "The discounted beliefs are P(trust)·b."
          }
        >
          {hasSimplex(dim) ? (
            <SimplexView
              labels={labels}
              points={points}
              overlays={overlays}
              onChange={(id, o) => id === "opinion" && setOpinion(o)}
              ariaLabel="Opinion simplex with the source's and the discounted opinion"
            />
          ) : (
            current && (
              <BarEditor
                opinion={current.result}
                labels={labels}
                color={INK}
                projection={current.result.projection}
                expanded
                name="the discounted opinion"
              />
            )
          )}
          <BarEditor
            opinion={opinion}
            onChange={setOpinion}
            labels={labels}
            color={SOURCE_COLOR}
            projection={current?.opinion.projection}
            name="B's opinion"
          />
        </Card>
      </div>
      <div className="grid two">
        <Card title="Values" subtitle="All values computed by SUBJ.">
          <OpinionTable caption="Source's and discounted opinion" labels={labels} entries={entries} />
        </Card>
        <Card title="Probability density">
          <PdfPanel entries={dim > 3 ? entries.slice(-1) : entries} labels={labels} scheme={scheme} />
        </Card>
      </div>
      <Explanation>
        <p>
          Probability-sensitive trust discounting scales the beliefs of the advisor's opinion by the projected
          probability of the trust opinion, p = P(trust): b<sup>[A;B]</sup> = p·b<sup>B</sup> and u<sup>[A;B]</sup> =
          1 − p·Σb<sup>B</sup>. The base rate is kept. Full trust keeps the opinion, zero trust makes it vacuous.
        </p>
      </Explanation>
    </div>
  );
}
