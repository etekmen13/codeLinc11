import { useRef } from "react";
import { useParallax, useSettle } from "../motion/hooks";
import { ui } from "../narrative/script";
import { DEMO_ANSWERS, useStore } from "../state/store";

// One large sentence, the field behind it, and a quiet scroll cue. The
// narrator's intro line sits in the lower third over it.
export function Opening() {
  const headline = useRef<HTMLHeadingElement>(null);
  useParallax(headline);
  useSettle(headline);
  return (
    <div className="opening">
      <h1 ref={headline} className="opening__headline display settle">
        {ui.opening.headline}
      </h1>
      <div className="opening__foot">
        <span className="scroll-cue" aria-hidden="true">
          {ui.opening.scrollCue}
        </span>
        <button
          type="button"
          className="text-link"
          onClick={() =>
            useStore.getState().patch({
              answers: DEMO_ANSWERS,
              scrollTarget: "recap",
              reaction: null,
              advanceFrom: null,
            })
          }
        >
          {ui.opening.demo}
        </button>
      </div>
    </div>
  );
}
