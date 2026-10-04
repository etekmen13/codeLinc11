import { useRef, type ReactNode } from "react";
import { useParallax } from "../motion/hooks";
import { procedurePhrases, ui } from "../narrative/script";
import { fill, parts } from "../narrative/template";
import { editFrom } from "../narrative/useAdvance";
import { useScroll } from "../scroll/ScrollProvider";
import { formatMoney } from "../lib/coverage";
import {
  baseSample,
  memberOf,
  procedure,
  questions,
  samplePlan,
} from "../state/selectors";
import { useStore } from "../state/store";
import type { MemberInput } from "../api";
import { InlineNumber } from "../ui/InlineNumber";

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

  // Balances are edited in place; they belong to this plan year.
  const setBalance = (patch: Partial<MemberInput>) => {
    const s = useStore.getState();
    const base = baseSample(s);
    if (base)
      s.setAnswers({
        member: { ...(s.answers.member ?? memberOf(base)), ...patch },
      });
  };
  const member = sample?.default_member;
  const balances: Record<string, ReactNode> =
    sample && member
      ? {
          used: (
            <InlineNumber
              key="used"
              value={member.amount_used}
              label={formatMoney(member.amount_used)}
              name={ui.recap.usedName}
              unit="money"
              max={sample.plan.annual_maximum}
              note={ui.recap.usedNote}
              onChange={(v) => setBalance({ amount_used: v })}
            />
          ),
          deductibleMet: (
            <InlineNumber
              key="deductibleMet"
              value={member.deductible_met}
              label={formatMoney(member.deductible_met)}
              name={ui.recap.deductibleMetName}
              unit="money"
              max={sample.plan.deductible}
              onChange={(v) => setBalance({ deductible_met: v })}
            />
          ),
        }
      : {};

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
            ) : p.token in balances ? (
              balances[p.token]
            ) : !words[p.token] ? null : (
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
        {onboarding.problems && (
          <div role="alert">
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
