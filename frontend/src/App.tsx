import { useEffect, useState, type KeyboardEvent } from "react";
import { Segmented } from "./components/ui";
import { requestJson } from "./lib/api";
import { useTheme, type ThemeChoice } from "./lib/hooks";
import { SchemeContext } from "./lib/theme";
import type { InfoResponse } from "./lib/types";
import { DeductionTab } from "./tabs/DeductionTab";
import { FusionTab } from "./tabs/FusionTab";
import { MultiplicationTab } from "./tabs/MultiplicationTab";
import { OpinionTab } from "./tabs/OpinionTab";
import { TrustTab } from "./tabs/TrustTab";
import { UnfusionTab } from "./tabs/UnfusionTab";

const TABS = [
  { id: "opinion", label: "Opinion", component: OpinionTab },
  { id: "deduction", label: "Deduction", component: DeductionTab },
  { id: "fusion", label: "Fusion", component: FusionTab },
  { id: "unfusion", label: "Unfusion", component: UnfusionTab },
  { id: "trust", label: "Trust discounting", component: TrustTab },
  { id: "multiplication", label: "Multiplication", component: MultiplicationTab },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const id = window.location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as TabId) : "deduction";
}

export function App() {
  const { choice, setChoice, scheme } = useTheme();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    requestJson<InfoResponse>("/api/info")
      .then(setInfo)
      .catch((error: unknown) => setInfoError(error instanceof Error ? error.message : String(error)));
  }, []);

  const select = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const onTabKey = (event: KeyboardEvent, index: number) => {
    const offset = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  const Active = TABS.find((t) => t.id === tab)!.component;

  return (
    <SchemeContext.Provider value={scheme}>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <h1>SUBJ-Viz</h1>
            <p>Subjective logic operators, computed with the SUBJ library</p>
          </div>
          <Segmented<ThemeChoice>
            label="Theme"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "system", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </header>
        <nav className="tabs" role="tablist" aria-label="Operators">
          {TABS.map((t, index) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              aria-controls="tab-panel"
              tabIndex={t.id === tab ? 0 : -1}
              className={t.id === tab ? "tab selected" : "tab"}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onTabKey(e, index)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {infoError && (
          <div className="banner critical" role="alert">
            <span aria-hidden>⚠</span> Cannot reach the SUBJ-Viz backend ({infoError}). Start it with{" "}
            <code>python -m subjviz</code>.
          </div>
        )}
        <main id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <Active key={tab} />
        </main>
        <footer className="app-footer">
          {info ? (
            <details>
              <summary>
                All operators are evaluated by pySUBJ {info.pysubjVersion} with {info.patches.length} patches applied
              </summary>
              <ul>
                {info.patches.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          ) : (
            <span>Connecting to SUBJ…</span>
          )}
        </footer>
      </div>
    </SchemeContext.Provider>
  );
}
