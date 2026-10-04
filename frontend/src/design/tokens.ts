// Design tokens: the only place colors, fonts and the type scale are set.
// applyTokens() writes them to :root as CSS custom properties before the
// first render; canvas code imports the values directly. Motion values live
// in motion/config.ts and are written to :root the same way.

// Palette. No grays: secondary ink is maroon at reduced alpha.
export const color = {
  white: "#FFFFFF",
  maroon: "#650030", // primary type on white; ground of the simulation
  wine: "#951D32", // risk step 1 (low); secondary emphasis
  brick: "#C9362D", // risk step 2 (medium); "scheduled" on the max meter
  // Risk step 3 (high). Scarce: escalation, the balance-billing gap, the
  // expiring-benefits figure and the acute takeover only. On white, only for
  // text 24px or larger, or for non-text marks (about 3.3:1).
  orange: "#FF4F17",
} as const;

// Translucent maroon for tracks, hairlines, secondary ink and disabled states,
// and translucent white for the same jobs on maroon ground.
export const tint = {
  maroon6: rgba(color.maroon, 0.06),
  maroon12: rgba(color.maroon, 0.12),
  maroon24: rgba(color.maroon, 0.24),
  maroon64: rgba(color.maroon, 0.64), // secondary text, still above 4.5:1
  white12: rgba(color.white, 0.12),
  white0: rgba(color.white, 0), // scrim edge on white
  white90: rgba(color.white, 0.9), // scrim center on white
  maroon0: rgba(color.maroon, 0),
  maroon90: rgba(color.maroon, 0.9),
  white40: rgba(color.white, 0.4),
  white72: rgba(color.white, 0.72),
} as const;

// Ordered risk scale, low to high. Use it wherever risk appears.
export const riskScale = [color.wine, color.brick, color.orange] as const;

// Five tooth states, healthy to extraction, on the same scale.
export const stateColors = [
  tint.maroon12,
  color.wine,
  color.brick,
  color.orange,
  color.maroon,
] as const;

export const font = {
  display: `"Fraunces Variable", Georgia, serif`,
  text: `"Inter Tight Variable", system-ui, sans-serif`,
} as const;

// Fluid type scale. Display sizes for headlines and figures; narration for
// the narrator's line; text sizes for UI.
export const type = {
  displayXL: "clamp(2.75rem, 5.2vw + 1rem, 6.75rem)",
  displayL: "clamp(2rem, 3vw + 1rem, 3.75rem)",
  figure: "clamp(2.25rem, 2.4vw + 1.25rem, 3.5rem)",
  figureGiant: "min(9vw, 13vh)", // the simulation summary's one number
  narration: "clamp(1.5rem, 0.9vw + 1.15rem, 2.25rem)",
  plaque: "clamp(1.375rem, 0.8vw + 1rem, 2rem)", // the summary plaque
  lead: "1.25rem",
  body: "1.0625rem",
  small: "0.9375rem",
  micro: "0.8125rem",
  measure: "38rem", // keeps lines under about 70 characters
} as const;

// Page geometry. The left third stays clear for the narrator during
// narrated sections; the narration line starts where the slot ends.
export const layout = {
  avatarSlot: "33vw",
  narrationRight: "25vw",
  gutter: "8vw",
  gutterNarrow: "16px",
} as const;

// Light paper grain over white ground.
export const grain = {
  opacity: 0.045,
  frequency: 0.85,
} as const;

export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const kebab = (s: string) =>
  s.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();

export function tokenVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[`--${k}`] = v;
  for (const [k, v] of Object.entries(tint)) vars[`--${kebab(k)}`] = v;
  riskScale.forEach((v, i) => (vars[`--risk-${i + 1}`] = v));
  for (const [k, v] of Object.entries(font)) vars[`--font-${k}`] = v;
  for (const [k, v] of Object.entries(type)) vars[`--type-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(layout)) vars[`--layout-${kebab(k)}`] = v;
  vars["--grain-opacity"] = String(grain.opacity);
  const noise = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${grain.frequency}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.396  0 0 0 0 0  0 0 0 0 0.188  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  vars["--grain-image"] = `url("data:image/svg+xml;utf8,${noise}")`;
  return vars;
}
