// The narrator's line: a fixed layer in the lower third that shows the
// current beat, types it out, and offers its answers. Beats cross-fade; the
// layer itself never moves. The left third is kept clear for the avatar.

import { useEffect, useState } from "react";
import { duration } from "../motion/config";
import { useStore } from "../state/store";
import { answer, skipReaction } from "./answer";
import type { BeatView, Stop } from "./flow";
import { ProcedureInput, SubscriberInput } from "./inputs";
import { Options } from "./Options";
import { ui } from "./script";
import { fill } from "./template";
import { Typewriter } from "./Typewriter";

interface Shown {
  key: string;
  stop: Stop;
  beat: BeatView;
  reaction: boolean;
}

export function NarrationOverlay({
  stops,
  hidden,
}: {
  stops: Stop[];
  hidden: boolean;
}) {
  const currentId = useStore((s) => s.currentStopId);
  const reaction = useStore((s) => s.reaction);
  const stop = stops.find((s) => s.id === currentId);

  // What should be on screen now.
  let next: Shown | null = null;
  if (stop?.beat) {
    if (reaction && reaction.stopId === stop.id)
      next = {
        key: `${stop.id}|reaction|${reaction.reaction.line}`,
        stop,
        reaction: true,
        beat: {
          beatId: stop.beat.beatId,
          expression: reaction.reaction.expression,
          line: reaction.reaction.line,
          options: [],
        },
      };
    else
      next = {
        key: `${stop.id}|${stop.beat.line}`,
        stop,
        beat: stop.beat,
        reaction: false,
      };
  }

  // Cross-fade: fade out, swap, fade in. Options are matched to the latest
  // stop so selections update without a fade.
  const [shown, setShown] = useState<Shown | null>(next);
  const [visible, setVisible] = useState(true);
  const nextKey = next?.key ?? null;
  useEffect(() => {
    if (nextKey === (shown?.key ?? null)) return;
    setVisible(false);
    const t = window.setTimeout(
      () => {
        setShown(next);
        setVisible(true);
      },
      (duration.fade * 1000) / 2,
    );
    return () => window.clearTimeout(t);
    // `next` is rebuilt every render; its key is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey]);

  const live =
    (shown && stops.find((s) => s.id === shown.stop.id)) ?? shown?.stop;
  const beat = shown && live?.beat && !shown.reaction ? live.beat : shown?.beat;

  const [skip, setSkip] = useState(false);
  const [typedKey, setTypedKey] = useState<string | null>(null);
  useEffect(() => setSkip(false), [shown?.key]);
  const ready = typedKey === shown?.key;

  // Space completes the line; during a reaction, it skips the reaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== " " ||
        (e.target as HTMLElement).closest("input, textarea, button")
      )
        return;
      if (shown?.reaction) skipReaction();
      else if (!ready) setSkip(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, shown?.reaction]);

  if (!shown || !beat || !live || hidden) return null;

  return (
    <>
      {beat.counter && (
        <p className="quiz-counter" aria-live="polite">
          {fill(ui.quizCounter, beat.counter)}
        </p>
      )}
      <div className="narration" data-visible={visible}>
        <div className="narration__scrim" aria-hidden="true" />
        <div className="narration__body">
          <p
            className="narration__line"
            aria-live="polite"
            onClick={() => (shown.reaction ? skipReaction() : setSkip(true))}
            title={shown.reaction ? ui.skip : undefined}
          >
            <Typewriter
              key={shown.key}
              id={shown.key}
              text={beat.line}
              skip={skip}
              onDone={() => setTypedKey(shown.key)}
            />
          </p>
          {!shown.reaction && (
            <div className="narration__answers" data-ready={ready}>
              {beat.input === "subscriber" ? (
                <SubscriberInput stop={live} />
              ) : beat.input === "procedure" ? (
                <ProcedureInput stop={live} />
              ) : (
                beat.options.length > 0 && (
                  <Options
                    options={beat.options}
                    selected={beat.selected}
                    onPick={(o) => answer(live, o)}
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
