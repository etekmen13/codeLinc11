import { formatMoney } from "../lib/coverage";
import {
  COVERAGE_KEYS,
  conflictingFields,
  foundFields,
  setCoverageValue,
  type CoverageKey,
} from "../narrative/coverage";
import { ui } from "../narrative/script";
import { fill, parts } from "../narrative/template";
import { useStore } from "../state/store";
import { InlineNumber } from "../ui/InlineNumber";

const percent = (v: number) => `${Math.round(v * 100)}%`;

// The numbers read from a benefits summary, as a sentence on a plaque. Each
// is editable; hovering one says where it came from. Shown only while a
// reviewed upload exists, so the beat's stop is otherwise empty.
export function Coverage() {
  const up = useStore((s) => s.coverageUpload);
  if (up.status !== "review" || !up.draft) return <div className="coverage" />;

  const draft = up.draft;
  const found = foundFields(up.result);
  const conflicts = conflictingFields(up.result);
  const note = (k: CoverageKey) => {
    if (up.edited.includes(k)) return ui.coverage.edited;
    const field = found.includes(k) ? up.result?.fields[k] : undefined;
    if (field)
      return fill(ui.coverage.fromPdf, {
        page: field.page,
        evidence: field.evidence,
      });
    return conflicts.includes(k)
      ? ui.coverage.conflicting
      : ui.coverage.fromDemo;
  };

  return (
    <div className="coverage">
      <div className="plaque">
        <p className="recap__sentence">
          {parts(ui.coverage.sentence).map((p, i) => {
            if ("text" in p) return <span key={i}>{p.text}</span>;
            const k = p.token as CoverageKey;
            if (!COVERAGE_KEYS.includes(k)) return null;
            const pct = k !== "annual_maximum" && k !== "deductible";
            return (
              <InlineNumber
                key={k}
                value={draft[k]}
                label={pct ? percent(draft[k]) : formatMoney(draft[k])}
                name={ui.coverage.names[k]}
                unit={pct ? "percent" : "money"}
                note={note(k)}
                muted={!found.includes(k) && !up.edited.includes(k)}
                onChange={(v) => setCoverageValue(k, v)}
              />
            );
          })}
        </p>
      </div>
      <p className="quiet recap__status">{ui.coverage.rest}</p>
    </div>
  );
}
