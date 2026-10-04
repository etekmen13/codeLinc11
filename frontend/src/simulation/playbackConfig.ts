// The futures playback: every tunable for the maroon stage and the paths
// drawn on it. Times are milliseconds. Colors come from design/tokens.ts.

// idle: the white page. dark: the ground fading to maroon. playing: the
// futures being drawn. done: the finished picture, with Next and Replay.
export type StagePhase = "idle" | "dark" | "playing" | "done";

export const stage = {
  afterLineMs: 900, // pause after the narrator's line is typed, before the ground darkens
  darkenMs: 1400, // white to maroon (and back, when the reader moves on)
} as const;

// The stage's fade, for CSS (applyTokens writes it to :root).
export function stageVariables(): Record<string, string> {
  return { "--stage-darken": `${stage.darkenMs}ms` };
}

export const playback = {
  // Paths are drawn one at a time, slowly at first, then faster:
  // path i takes minPathMs + (firstPathMs - minPathMs) * exp(-i / rampPaths).
  // About 6.5 s in all for 300 paths.
  firstPathMs: 900,
  minPathMs: 6,
  rampPaths: 5,

  // Each path is drawn at full white, then fades to restAlpha over trailMs.
  // Resting paths are translucent white, so where many futures overlap the
  // band glows brighter.
  trailMs: 450,
  restAlpha: 0.1,
  activeWidth: 1.8,
  restWidth: 1.2,
  // The slow early paths get a soft glow and a bright head.
  glowBlur: 12,
  glowSlowerThanMs: 60,
  headRadius: 2.5,

  // Sideways wobble within a state's lane, as a fraction of the lane.
  laneWobble: 0.3,

  // Histogram of where the drawn futures end up, at the right.
  barThickness: 0.2, // of a lane
  barAlpha: 0.9,
  barEase: 0.18, // per-frame easing of the bars toward their counts

  // Time axis: a tick every few months; only the ends are labeled.
  tickEveryMonths: 3,
} as const;

// Plot geometry inside the stage, in CSS pixels.
export const plot = {
  labelWidth: 120, // state labels on the left (narrow screens: 84)
  labelWidthNarrow: 84,
  histogramWidth: 140, // bars on the right (narrow screens: 56)
  histogramWidthNarrow: 56,
  gap: 20, // between the paths and the labels or bars
  axisHeight: 40, // ticks and the end labels below the paths
} as const;
