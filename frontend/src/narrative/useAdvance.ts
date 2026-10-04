// After an answer: let the reaction play (or skip), then scroll to the next
// stop. The reaction stays on screen until that stop is reached (App's
// onStopChange clears it). When the user came to edit an earlier answer from the summary, go
// back to where they were instead, unless something new now needs answering.

import { useEffect, useLayoutEffect, useRef } from "react";
import { narration, reactionWaitMs } from "../motion/config";
import { useScroll } from "../scroll/ScrollProvider";
import { useStore } from "../state/store";
import type { Flow } from "./flow";

let returnTo: string | null = null;

// Remember where to come back to after editing an earlier answer.
export function editFrom(stopId: string): void {
  returnTo = stopId;
}

export function useAdvance(flow: Flow): void {
  const { scrollToStop } = useScroll();
  const advanceFrom = useStore((s) => s.advanceFrom);
  const reaction = useStore((s) => s.reaction);
  const flowRef = useRef(flow);
  useLayoutEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  useEffect(() => {
    if (!advanceFrom) return;
    const wait = !reaction
      ? narration.advanceDelayMs
      : reaction.skipped
        ? 0
        : reactionWaitMs(reaction.reaction.line);
    const timer = window.setTimeout(() => {
      const { stops, gateId } = flowRef.current;
      const i = stops.findIndex((s) => s.id === advanceFrom);
      let target = stops[i + 1]?.id;
      if (returnTo) {
        const back = stops.findIndex((s) => s.id === returnTo);
        const gate = gateId
          ? stops.findIndex((s) => s.id === gateId)
          : Infinity;
        if (back > i && back <= gate) target = returnTo;
        returnTo = null;
      }
      useStore
        .getState()
        .patch(
          target
            ? { advanceFrom: null }
            : { advanceFrom: null, reaction: null },
        );
      if (target) scrollToStop(target);
    }, wait);
    return () => window.clearTimeout(timer);
    // Re-run when the reaction is skipped.
  }, [advanceFrom, reaction, scrollToStop]);
}
