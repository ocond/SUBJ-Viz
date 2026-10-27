import { seriesColor } from "../lib/colors";
import type { OpinionAnalysis } from "../lib/types";
import { DirichletHeatmap } from "./DirichletHeatmap";
import { Label, plainLabel } from "./Label";
import { LegendKey } from "./Legend";
import { LineChart, type LineSeries, type Spike } from "./LineChart";

export interface PdfEntry {
  label: string;
  color: string;
  analysis?: OpinionAnalysis;
  emphasis?: boolean;
}

export interface PdfPanelProps {
  entries: PdfEntry[];
  labels: string[];
  scheme: "light" | "dark";
}

/**
 * Dirichlet PDFs of opinions over the same domain: overlaid Beta densities (2 states),
 * heatmaps over the probability simplex (3 states) or Beta marginals per state (more states).
 */
export function PdfPanel({ entries, labels, scheme }: PdfPanelProps) {
  const available = entries.filter((e) => e.analysis);
  if (available.length === 0) return <p className="muted">Waiting for SUBJ…</p>;
  const dim = available[0].analysis!.belief.length;

  if (dim === 2) {
    const series: LineSeries[] = [];
    const spikes: Spike[] = [];
    let x: number[] = [];
    for (const entry of available) {
      const pdf = entry.analysis!.pdf;
      if (!pdf) continue;
      if (pdf.kind === "dogmatic") spikes.push({ label: entry.label, color: entry.color, x: pdf.point![0] });
      else if (pdf.kind === "beta") {
        x = pdf.x!;
        series.push({ label: entry.label, color: entry.color, values: pdf.density!, emphasis: entry.emphasis });
      }
    }
    if (x.length === 0) x = Array.from({ length: 101 }, (_, i) => i / 100);
    return (
      <LineChart
        x={x}
        series={series}
        spikes={spikes}
        xLabel={`p(${labels[0]})`}
        ariaLabel={`Beta probability density functions of ${available.map((e) => plainLabel(e.label)).join(", ")}`}
      />
    );
  }

  return (
    <div className={dim === 3 ? "small-multiples" : "pdf-stack"}>
      {available.map((entry) => {
        const { analysis } = entry;
        const pdf = analysis!.pdf;
        const title = (
          <h4 className="chart-title">
            <LegendKey item={{ label: entry.label, color: entry.color, shape: entry.emphasis ? "diamond" : "dot" }} />
            <Label text={entry.label} />
          </h4>
        );
        if (!pdf) return null;
        if (pdf.kind === "dogmatic") {
          return (
            <div key={entry.label}>
              {title}
              <p className="muted">Dogmatic opinion: the PDF is a Dirac delta at its projected probability.</p>
            </div>
          );
        }
        if (pdf.kind === "dirichlet3") {
          return (
            <div key={entry.label}>
              {title}
              <DirichletHeatmap
                pdf={pdf}
                labels={labels}
                projection={analysis!.projection}
                scheme={scheme}
                ariaLabel={`Dirichlet density of ${plainLabel(entry.label)}`}
              />
            </div>
          );
        }
        return (
          <div key={entry.label}>
            {title}
            <LineChart
              x={pdf.x!}
              series={pdf.marginals!.map((values, i) => ({ label: labels[i], color: seriesColor(i), values }))}
              xLabel="p(xᵢ)"
              yLabel="marginal density"
              ariaLabel={`Beta marginal densities of ${plainLabel(entry.label)}`}
            />
          </div>
        );
      })}
    </div>
  );
}
