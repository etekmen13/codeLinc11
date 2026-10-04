// Motion: one easing, a few durations, and every timing tunable. Adjust the
// feel here. Durations are seconds unless the name ends in Ms.

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// The only easing. No bounce, no overshoot.
export const EASE_BEZIER = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = `cubic-bezier(${EASE_BEZIER.join(", ")})`;
export const EASE = "calm"; // GSAP name for the same curve

export const duration = {
  expression: 0.25, // avatar expression cross-fade
  fade: 0.5, // beat cross-fade, small reveals
  move: 0.7, // element transitions, the timing toggle
  scrollTo: 0.9, // auto-scroll to the next beat or a section
  entrance: 0.9, // narrator slide-in
  zoom: 1.2, // tooth zoom (Phase 3)
  spread: 1.5, // background field easing to a new spread
} as const;

export const narration = {
  charsPerSecond: 35, // typewriter speed
  // A reaction stays until it has been typed out, plus this long to read.
  reactionHoldMs: 1100,
  advanceDelayMs: 250, // pause before auto-scrolling when there's no reaction
} as const;

// The narrator's idle breathing. No blink: the art has no closed-eye frame.
export const avatar = {
  breatheScale: 1.01,
  breatheSeconds: 4, // one breath, in and out
} as const;

// How long a reaction line stays before the narration moves on: the beat
// cross-fade, the typing, then reactionHoldMs. Without the typewriter
// (reduced motion), only the fade and the hold.
export function reactionWaitMs(line: string): number {
  const typing = prefersReducedMotion()
    ? 0
    : (line.length / narration.charsPerSecond) * 1000;
  return (duration.fade * 1000) / 2 + typing + narration.reactionHoldMs;
}

// Parallax speeds relative to scroll (content moves at 1).
export const parallax = {
  field: 0.2,
  type: 0.6,
} as const;

// The soft wall at an unanswered beat.
export const gate = {
  runwayVh: 0.5, // scroll room past the wall before the page ends
  springDelayMs: 140, // wait after the last overshoot before springing back
  hardLimitVh: 0.35, // overshoot past this springs back immediately
  springDuration: 0.6,
} as const;

// Background trajectory field.
export const field = {
  lines: 260,
  segments: 40, // points per line
  alphaOnWhite: 0.075,
  driftSpeed: 0.035, // how fast wiggles travel left to right
  maxDpr: 2,
  bundleSpacingVh: 0.55, // vertical distance between bundles of lines
  spreadDefault: 0.45,
  spreadStep: 0.09, // added per "raises" answer, removed per "lowers"
} as const;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

let registered = false;

// Registers the GSAP plugins and the custom ease once.
export function setupMotion(): void {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  const [x1, y1, x2, y2] = EASE_BEZIER;
  CustomEase.create(EASE, `M0,0 C${x1},${y1} ${x2},${y2} 1,1`);
  gsap.defaults({ ease: EASE, duration: duration.move });
}

// The easing as a plain function, for Lenis.
export function easeFn(t: number): number {
  return gsap.parseEase(EASE)(t);
}

export function motionVariables(): Record<string, string> {
  const vars: Record<string, string> = {
    "--ease": EASE_CSS,
    "--runway": `${gate.runwayVh * 100}vh`,
  };
  for (const [k, v] of Object.entries(duration)) vars[`--dur-${k}`] = `${v}s`;
  vars["--breathe-scale"] = String(avatar.breatheScale);
  vars["--breathe-half"] = `${avatar.breatheSeconds / 2}s`;
  return vars;
}
