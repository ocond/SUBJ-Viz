import { useState } from "react";
import { INK, INK_SECONDARY, UNCERTAINTY, labelInk } from "../lib/colors";
import { format, masses, moveBoundary, setBaseRate, setBelief, setUncertainty, withMasses } from "../lib/opinion";
import type { Opinion } from "../lib/types";
import { StackedBar } from "./StackedBar";

export interface BarEditorProps {
  opinion: Opinion;
  onChange?: (opinion: Opinion) => void;
  labels: string[];
  color: string;
  /** Projected probabilities computed by SUBJ */
  projection?: number[];
  /** Hide the base rate, e.g. for conditionals whose base rate SUBJ replaces */
  hideBaseRate?: boolean;
  /** Show the table of exact values initially */
  expanded?: boolean;
  name: string;
}

function NumberInput({
  value,
  onCommit,
  label,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(v)) onCommit(Math.min(1, Math.max(0, v)));
    setDraft(null);
  };
  return (
    <input
      type="number"
      className="number-input"
      min={0}
      max={1}
      step={0.01}
      aria-label={label}
      disabled={disabled}
      value={draft ?? format(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/** Editor for opinions of any dimension: stacked mass and base rate bars plus exact values. */
export function BarEditor({
  opinion,
  onChange,
  labels,
  color,
  projection,
  hideBaseRate,
  expanded = false,
  name,
}: BarEditorProps) {
  const [open, setOpen] = useState(expanded);
  const dim = opinion.belief.length;
  const editable = Boolean(onChange);
  const massLabels = [...labels, "u"];
  const fill = color === INK ? INK_SECONDARY : color;
  const massColors = [...Array(dim).fill(fill), UNCERTAINTY];
  const massInk = [...Array(dim).fill(labelInk(fill)), INK];
  const neutralInk = Array(dim).fill(INK);

  return (
    <div className="bar-editor">
      <div className="bar-row">
        <span className="bar-caption">b, u</span>
        <StackedBar
          values={masses(opinion)}
          colors={massColors}
          labelColors={massInk}
          labels={massLabels}
          quantity={(i) => (i < dim ? `b(${labels[i]})` : "u")}
          onBoundaryMove={
            onChange && ((i, p) => onChange(withMasses(opinion, moveBoundary(masses(opinion), i, p))))
          }
          ariaLabel={`Belief and uncertainty masses of ${name}`}
        />
      </div>
      {!hideBaseRate && (
        <div className="bar-row">
          <span className="bar-caption">a</span>
          <StackedBar
            values={opinion.baseRate}
            colors={Array(dim).fill("var(--base-rate)")}
            labelColors={neutralInk}
            labels={labels}
            quantity={(i) => `a(${labels[i]})`}
            onBoundaryMove={
              onChange &&
              ((i, p) => onChange({ ...opinion, baseRate: moveBoundary(opinion.baseRate, i, p) }))
            }
            height={14}
            ariaLabel={`Base rate of ${name}`}
          />
        </div>
      )}
      {projection && (
        <div className="bar-row">
          <span className="bar-caption">P</span>
          <StackedBar
            values={projection}
            colors={Array(dim).fill("var(--projection)")}
            labelColors={neutralInk}
            labels={labels}
            quantity={(i) => `P(${labels[i]})`}
            height={14}
            ariaLabel={`Projected probabilities of ${name}`}
          />
        </div>
      )}
      <button type="button" className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide values" : editable ? "Edit values" : "Show values"}
      </button>
      {open && (
        <table className="values-table">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">b</th>
              {!hideBaseRate && <th scope="col">a</th>}
              {projection && <th scope="col">P</th>}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>
                  <NumberInput
                    value={opinion.belief[i]}
                    label={`b(${label}) of ${name}`}
                    disabled={!editable}
                    onCommit={(v) => onChange?.(setBelief(opinion, i, v))}
                  />
                </td>
                {!hideBaseRate && (
                  <td>
                    <NumberInput
                      value={opinion.baseRate[i]}
                      label={`a(${label}) of ${name}`}
                      disabled={!editable}
                      onCommit={(v) => onChange?.(setBaseRate(opinion, i, v))}
                    />
                  </td>
                )}
                {projection && <td className="numeric">{format(projection[i])}</td>}
              </tr>
            ))}
            <tr>
              <th scope="row">u</th>
              <td>
                <NumberInput
                  value={opinion.uncertainty}
                  label={`Uncertainty of ${name}`}
                  disabled={!editable}
                  onCommit={(v) => onChange?.(setUncertainty(opinion, v))}
                />
              </td>
              {!hideBaseRate && <td />}
              {projection && <td />}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
