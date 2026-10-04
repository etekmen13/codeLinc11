// What answering a beat does to state. The narration overlay calls answer();
// useAdvance then scrolls on once the reaction has played.

import { normalize_subscriber_id } from "../onboarding/subscriber_id";
import { NO_UPLOAD, useStore } from "../state/store";
import { pickCoveragePdf } from "./coverage";
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
    // Uploaded numbers and edited balances belong to the old plan.
    if (option.value !== answers.planId) {
      setAnswers({
        planId: option.value,
        coverage: null,
        coverageDone: answers.coverage ? false : answers.coverageDone,
        member: null,
      });
      s.patch({ coverageUpload: NO_UPLOAD });
    }
  } else if (id.startsWith("coverage")) {
    if (option.value === "upload") {
      pickCoveragePdf(); // the beat follows the upload from here
      return;
    }
    if (option.value === "confirm")
      setAnswers({ coverage: s.coverageUpload.draft, coverageDone: true });
    else {
      setAnswers({ coverage: null, coverageDone: true });
      s.patch({ coverageUpload: NO_UPLOAD });
    }
  } else if (id === "subscriber")
    setAnswers({
      subscriberConfirmed: true,
      subscriberId:
        option.value === "skip"
          ? ""
          : normalize_subscriber_id(answers.subscriberId),
    });
  else if (id === "procedure") setAnswers({ procedureCode: option.value });
  else if (id.startsWith("quiz:"))
    setAnswers({ quiz: { ...answers.quiz, [id.slice(5)]: option.value } });
  else if (id === "recap") setAnswers({ recapDone: true });
  else if (id === "tooth_done") setAnswers({ toothDone: true });
  else if (id === "sim_played") {
    if (option.value === "replay") {
      s.patch({ simReplay: s.simReplay + 1, simStage: "playing" });
      return; // stays on this stop
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
