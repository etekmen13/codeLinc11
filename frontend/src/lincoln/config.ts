// The narrator: his art, his size, and where he stands in each section.
// Swapping in new art means dropping files into src/assets/lincoln/; the
// names below are matched in order, as .svg, .png or .webp. Motion timings
// (entrance, cross-fade, breathing) live in motion/config.ts.

import type { SectionId } from "../narrative/flow";
import type { Expression } from "../narrative/script";

// Candidate file names per expression, first match wins. A missing
// expression falls back to neutral; a missing neutral falls back to a
// maroon circle. Either logs one console warning.
export const files: Record<Expression, string[]> = {
  neutral: ["lincoln_default", "lincoln_neutral", "neutral"],
  happy: ["lincoln_happy", "happy"],
  concerned: ["lincoln_concerned", "lincoln_sad", "concerned"],
  thinking: ["lincoln_thinking", "thinking"],
  smile: ["lincoln_smile", "smile"],
};

// Every asset shares this canvas, so cross-fades don't shift.
export const canvas = { width: 137, height: 198 };

// Center of the mouth, in percent of the canvas (estimated from the
// thinking asset's mouth layer). The tooth zoom in Phase 3 scales around it.
export const mouthCenter = { x: 73, y: 67 };
export const zoomScale = 4;

// full: in the left third, bottom-aligned. bust: small, in the lower-left
// corner, while his lines are margin notes. away: offstage to the left.
export type Presence = "full" | "bust" | "away";

export const sectionPresence: Record<SectionId, Presence> = {
  opening: "full",
  safety: "full",
  intake: "full",
  quiz: "full",
  summary: "full",
  tooth: "full",
  simulation: "full",
  providers: "bust",
  careplan: "bust",
  closing: "full",
};

// Stops that differ from their section. holdMs keeps him at full size, with
// the beat's expression, before he leaves. Loading and error lines are
// always delivered at full size.
export const stopPresence: Record<
  string,
  { presence: Presence; holdMs?: number }
> = {
  sim_intro: { presence: "away", holdMs: 1400 },
};

// Stops without a narrator line (summary, dentists, care plan).
export const contentExpression: { idle: Expression; loading: Expression } = {
  idle: "neutral",
  loading: "thinking",
};

export const size = {
  fullHeight: "80vh", // capped so he never spills out of the avatar slot
  slotInset: "2vw", // space between him and the narration
  bustScale: 0.18, // of full size
  bustInset: "1.25rem", // from the lower-left corner
  narrowHeight: "18vh", // below 768px he sits at the top of the screen
  narrowTop: "0.75rem",
};

export function lincolnVariables(): Record<string, string> {
  return {
    "--lincoln-aspect": String(canvas.width / canvas.height),
    "--lincoln-full-height": size.fullHeight,
    "--lincoln-slot-inset": size.slotInset,
    "--lincoln-bust-scale": String(size.bustScale),
    "--lincoln-bust-inset": size.bustInset,
    "--lincoln-narrow-height": size.narrowHeight,
    "--lincoln-narrow-top": size.narrowTop,
  };
}
