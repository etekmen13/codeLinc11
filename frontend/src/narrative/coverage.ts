// Reading a benefits summary (POST /api/coverage/extract). The file is sent
// once and not kept. What it yields is laid over the sample plan's numbers
// and shown for review; nothing is used until the reader confirms it.

import { extract_coverage, problems_of, type CoverageExtraction } from "../api";
import { baseSample, coverageOf } from "../state/selectors";
import { NO_UPLOAD, useStore } from "../state/store";

export const COVERAGE_KEYS = [
  "annual_maximum",
  "deductible",
  "preventive",
  "basic",
  "major",
] as const;
export type CoverageKey = (typeof COVERAGE_KEYS)[number];

// Numbers the PDF gave one clear value for.
export function foundFields(result: CoverageExtraction | null): CoverageKey[] {
  return COVERAGE_KEYS.filter(
    (k) => typeof result?.fields[k]?.value === "number",
  );
}

// Numbers the PDF gave several values for. The backend drops these and
// names them in a warning.
export function conflictingFields(
  result: CoverageExtraction | null,
): CoverageKey[] {
  const warning = result?.warnings.find((w) => w.startsWith("Conflicting"));
  return warning
    ? COVERAGE_KEYS.filter((k) => warning.split(/[:,]\s*/).includes(k))
    : [];
}

// Opens the file picker. Must run inside the click that asked for it.
export function pickCoveragePdf(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void read(file);
  };
  input.click();
}

async function read(file: File): Promise<void> {
  const planId = useStore.getState().answers.planId;
  useStore
    .getState()
    .patch({ coverageUpload: { ...NO_UPLOAD, status: "reading" } });
  try {
    const result = await extract_coverage(file);
    const s = useStore.getState();
    const base = baseSample(s);
    if (!base || s.answers.planId !== planId) return; // plan changed meanwhile
    const draft = coverageOf(base);
    for (const k of foundFields(result))
      draft[k] = result.fields[k].value as number;
    s.patch({
      coverageUpload: { ...NO_UPLOAD, status: "review", result, draft },
    });
  } catch (e) {
    const problem = problems_of(e).join(" ");
    useStore.getState().patch({
      coverageUpload: {
        ...NO_UPLOAD,
        status: "error",
        error: /[.!?]$/.test(problem) ? problem : `${problem}.`,
      },
    });
  }
}

// An edit on the review plaque. Once confirmed, edits apply at once.
export function setCoverageValue(key: CoverageKey, value: number): void {
  const s = useStore.getState();
  const up = s.coverageUpload;
  if (!up.draft) return;
  const draft = { ...up.draft, [key]: value };
  s.patch({
    coverageUpload: {
      ...up,
      draft,
      edited: up.edited.includes(key) ? up.edited : [...up.edited, key],
    },
  });
  if (s.answers.coverage) s.setAnswers({ coverage: draft });
}
