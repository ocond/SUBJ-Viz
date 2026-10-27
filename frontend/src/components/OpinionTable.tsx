import { format } from "../lib/opinion";
import type { OpinionAnalysis } from "../lib/types";
import { Label } from "./Label";
import { LegendKey, type LegendItem } from "./Legend";

export interface TableEntry extends LegendItem {
  analysis?: OpinionAnalysis;
}

/** Values of several opinions over the same domain; one column per opinion. */
export function OpinionTable({ entries, labels, caption }: { entries: TableEntry[]; labels: string[]; caption: string }) {
  const rows: { label: string; value: (a: OpinionAnalysis) => number | null; group?: boolean }[] = [
    ...labels.map((l, i) => ({ label: `b(${l})`, value: (a: OpinionAnalysis) => a.belief[i], group: i === 0 })),
    { label: "u", value: (a) => a.uncertainty },
    ...labels.map((l, i) => ({ label: `a(${l})`, value: (a: OpinionAnalysis) => a.baseRate[i], group: i === 0 })),
    ...labels.map((l, i) => ({ label: `P(${l})`, value: (a: OpinionAnalysis) => a.projection[i], group: i === 0 })),
  ];
  return (
    <div className="table-scroll">
      <table className="opinion-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Quantity</span>
            </th>
            {entries.map((entry) => (
              <th scope="col" key={entry.label}>
                <span className="column-head">
                  <LegendKey item={entry} />
                  <Label text={entry.label} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.group ? "group-start" : undefined}>
              <th scope="row">{row.label}</th>
              {entries.map((entry) => (
                <td key={entry.label} className="numeric">
                  {entry.analysis ? format(row.value(entry.analysis)) : "…"}
                </td>
              ))}
            </tr>
          ))}
          {entries.some((e) => e.analysis && !e.analysis.valid) && (
            <tr className="group-start">
              <th scope="row">valid</th>
              {entries.map((entry) => (
                <td key={entry.label} className="numeric">
                  {entry.analysis ? (entry.analysis.valid ? "yes" : "no") : "…"}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
