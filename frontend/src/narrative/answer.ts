// What answering a beat does to state. The narration overlay calls answer();
// useAdvance then scrolls on once the reaction has played.

import { normalize_subscriber_id } from "../onboarding/subscriber_id";
import { useStore } from "../state/store";
import type { OptionView, Stop } from "./flow";

export function answer(stop: Stop, option: OptionView): void {
  const s = useStore.getState();
  const { setAnswers, answers } = s;
  const id = stop.beat?.beatId ?? stop.id;
  let advance = true;

  if (id === "intro") setAnswers({ started: true });
  else if (id === "acute") {
    setAnswers({ acute: option.value as "yes" | "no" });
    advance = option.value === "no"; // "yes" opens the takeover
  } else if (id === "insurer") {
    // A new insurer has a new ID format, so prefill its demo ID.
    const sample = s.form.data?.plans.find((p) => p.plan.id === option.value);
    if (option.value !== answers.planId && sample)
      setAnswers({
        planId: option.value,
        subscriberId: sample.plan.subscriber_id_example,
      });
  } else if (id === "subscriber")
    setAnswers({
      subscriberConfirmed: true,
      subscriberId: normalize_subscriber_id(answers.subscriberId),
    });
  else if (id === "procedure") setAnswers({ procedureCode: option.value });
  else if (id.startsWith("quiz:"))
    setAnswers({ quiz: { ...answers.quiz, [id.slice(5)]: option.value } });
  else if (id === "tooth_done") setAnswers({ toothDone: true });
  else if (id === "sim_intro") {
    if (option.value === "replay") {
      s.patch({ simReplay: s.simReplay + 1 });
      return; // stays on this beat
    }
    setAnswers({ simIntroDone: true });
  } else if (id === "sim_summary" || id === "sim_summary_terminal")
    setAnswers({ simSummaryDone: true });
  else if (id === "closing_end") {
    s.restart();
    advance = false;
  }

  s.patch({
    reaction:
      advance && option.reaction
        ? { stopId: stop.id, reaction: option.reaction }
        : null,
    advanceFrom: advance ? stop.id : null,
  });
}

// Skips a playing reaction: the line stays, and the narration moves on now.
export function skipReaction(): void {
  const s = useStore.getState();
  if (s.reaction && !s.reaction.skipped)
    s.patch({ reaction: { ...s.reaction, skipped: true } });
}
