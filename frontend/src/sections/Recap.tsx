import { useRef } from "react";
import { useParallax } from "../motion/hooks";
import { procedurePhrases, ui } from "../narrative/script";
import { fill, parts } from "../narrative/template";
import { editFrom } from "../narrative/useAdvance";
import { useScroll } from "../scroll/ScrollProvider";
import { procedure, questions, samplePlan } from "../state/selectors";
import { useStore } from "../state/store";

// The intake as one sentence, in the reader's voice, on a plaque. Each
// answer is an editable word that reopens its beat; after the edit, the
// narration comes back here.
export function Recap() {
  const { scrollToStop } = useScroll();
  const sample = useStore(samplePlan);
  const proc = useStore(procedure);
  const qs = useStore(questions);
  const onboarding = useStore((s) => s.onboarding);
  const plaque = useRef<HTMLDivElement>(null);
  useParallax(plaque);

  const edit = (stopId: string) => {
    editFrom("recap");
    scrollToStop(stopId);
  };
  const words: Record<string, { label: string; stop: string }> = {
    plan: {
      label: sample ? `${sample.plan.insurer} ${sample.plan.plan_name}` : "",
      stop: "insurer",
    },
    procedure: {
      label: proc
        ? (procedurePhrases[proc.cdt_code] ?? proc.name.toLowerCase())
        : "",
      stop: "procedure",
    },
    quiz: {
      label: fill(ui.recap.quizCount, { n: qs?.length ?? 0 }),
      stop: qs?.[0] ? `quiz:${qs[0].id}` : "procedure",
    },
  };

  return (
    <div className="recap">
      <div ref={plaque} className="plaque">
        <p className="recap__sentence">
          {parts(ui.recap.sentence).map((p, i) =>
            "text" in p ? (
              <span key={i}>{p.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className="editable"
                onClick={() => edit(words[p.token].stop)}
              >
                {words[p.token]?.label}
              </button>
            ),
          )}
        </p>
      </div>
      <div className="recap__status" aria-live="polite">
        {onboarding.loading && <p className="quiet">{ui.recap.checking}</p>}
        {onboarding.problems && (
          <div role="alert">
            <p>{ui.recap.problems}</p>
            <ul className="plain-list">
              {onboarding.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                useStore
                  .getState()
                  .patch({ retry: useStore.getState().retry + 1 })
              }
            >
              {ui.recap.retry}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
