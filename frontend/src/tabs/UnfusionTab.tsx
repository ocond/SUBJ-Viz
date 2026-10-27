import { BarEditor } from "../components/BarEditor";
import { OpinionTable } from "../components/OpinionTable";
import { PdfPanel } from "../components/PdfPanel";
import type { SimplexPoint } from "../components/simplex";
import { hasSimplex, SimplexView } from "../components/SimplexView";
import { Card, ErrorBanner, Explanation, Op, Stepper, useRemembered } from "../components/ui";
import { useApi } from "../lib/api";
import { INK, MUTED, seriesColor } from "../lib/colors";
import { binomial, focusedOpinion, fromMasses, stateLabels, uniformBaseRate } from "../lib/opinion";
import { useScheme } from "../lib/theme";
import type { Opinion, UnfusionResponse } from "../lib/types";

const FUSED_COLOR = seriesColor(0);
const SOURCE_COLOR = seriesColor(1);

// C = A ⊕ B for A = (0.2, 0.3, 0.5) and B = (0.4, 0.1, 0.5)
const DEFAULT = {
  dim: 2,
  fused: binomial(0.4, 0.2667, 0.3333),
  opinion: binomial(0.4, 0.1, 0.5),
};

function defaults(dim: number) {
  if (dim === 2) return DEFAULT;
  const opinion = focusedOpinion(dim, 0, 0.3, 0.5);
  // A fused opinion that contains B's evidence: B's beliefs plus some more, with less uncertainty
  const fused = fromMasses([...opinion.belief.map((b, i) => b * 0.75 + (i === 1 ? 0.15 : 0.02)), 0.3], uniformBaseRate(dim));
  return { dim, fused, opinion };
}

export function UnfusionTab() {
  const scheme = useScheme();
  const [state, setState] = useRemembered("unfusion", () => DEFAULT);
  const { dim, fused, opinion } = state;
  const labels = stateLabels("x", dim);

  const { data, error } = useApi<UnfusionResponse>("/api/unfusion", { fused, opinion, pdf: true });
  const current = data && data.fused.belief.length === dim ? data : null;
  const result = current?.result?.valid ? current.result : undefined;

  const set = (key: "fused" | "opinion", o: Opinion) => setState((s) => ({ ...s, [key]: o }));

  const points: SimplexPoint[] = [
    {
      id: "fused",
      label: "ω^C_X",
      note: "fused opinion",
      opinion: fused,
      color: FUSED_COLOR,
      role: "input",
      projection: current?.fused.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
    },
    {
      id: "opinion",
      label: "ω^B_X",
      note: "contributing opinion",
      opinion,
      color: SOURCE_COLOR,
      role: "input",
      projection: current?.opinion.projection,
      draggable: true,
      baseRateDraggable: true,
      showBaseRate: true,
    },
  ];
  if (result) {
    points.push({
      id: "result",
      label: "ω^A_X",
      note: "unfused opinion",
      opinion: result,
      color: INK,
      role: "result",
      projection: result.projection,
      showProjection: true,
    });
  }

  const entries = [
    { label: "ω^C_X", color: FUSED_COLOR, shape: "dot" as const, analysis: current?.fused },
    { label: "ω^B_X", color: SOURCE_COLOR, shape: "dot" as const, analysis: current?.opinion },
    { label: "ω^A_X", color: INK, shape: "diamond" as const, analysis: current?.result, emphasis: true },
  ];

  return (
    <div className="tab-content">
      <div className="toolbar">
        <Stepper label="States |X|" value={dim} min={2} max={4} onChange={(d) => setState(defaults(d))} />
        <button type="button" className="button" onClick={() => setState(defaults(dim))}>
          Reset
        </button>
      </div>
      <ErrorBanner error={error} />
      {current?.message && (
        <div className="banner warning" role="status">
          <span aria-hidden>⚠</span> {current.message}
        </div>
      )}
      <div className="grid two">
        <Card
          title={
            <>
              Cumulative unfusion <Op sub="X" sup="A" /> = <Op sub="X" sup="C" /> ⊖ <Op sub="X" sup="B" />
            </>
          }
          subtitle="Given the fused opinion C = A ⊕ B and the contributing opinion B, unfusion recovers A. The base rate of A is taken from C."
        >
          {hasSimplex(dim) ? (
            <SimplexView
              labels={labels}
              points={points}
              onChange={(id, o) => set(id as "fused" | "opinion", o)}
              ariaLabel="Opinion simplex with fused, contributing and unfused opinions"
            />
          ) : null}
          <div className="editor-list">
            <div className="editor-item">
              <h4 className="editor-title">
                <span className="dot" style={{ background: FUSED_COLOR }} />
                Fused <Op sub="X" sup="C" />
              </h4>
              <BarEditor opinion={fused} onChange={(o) => set("fused", o)} labels={labels} color={FUSED_COLOR} name="the fused opinion" />
            </div>
            <div className="editor-item">
              <h4 className="editor-title">
                <span className="dot" style={{ background: SOURCE_COLOR }} />
                Contributing <Op sub="X" sup="B" />
              </h4>
              <BarEditor opinion={opinion} onChange={(o) => set("opinion", o)} labels={labels} color={SOURCE_COLOR} name="the contributing opinion" />
            </div>
          </div>
        </Card>
        <div className="stack">
          <Card title="Values" subtitle="Fusing the result with B again must give C.">
            <OpinionTable
              caption="Fused, contributing and unfused opinions"
              labels={labels}
              entries={[
                ...entries,
                { label: "ω^A⊕B_X", color: MUTED, shape: "ring" as const, analysis: current?.refused },
              ]}
            />
          </Card>
          <Card title="Probability density">
            <PdfPanel entries={dim > 3 ? entries.slice(-1) : entries} labels={labels} scheme={scheme} />
          </Card>
        </div>
      </div>
      <Explanation>
        <p>
          Unfusion removes the evidence of a known opinion from a cumulatively fused one. It is only defined when the
          fused opinion contains at least the evidence of the contributing opinion for every state; otherwise the
          result has negative masses and SUBJ's output is flagged as invalid.
        </p>
      </Explanation>
    </div>
  );
}
