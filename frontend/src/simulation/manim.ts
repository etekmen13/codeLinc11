// Manim's look, ported for live canvas drawing.
// Values copied from Manim Community v0.21 (manim/utils/color/manim_colors.py,
// manim/utils/rate_functions.py, manim/constants.py).

export const C = {
  BLACK: "#000000",
  GREY_E: "#222222",
  GREY_D: "#444444",
  GREY_C: "#888888",
  GREY_B: "#BBBBBB",
  WHITE: "#FFFFFF",
  BLUE: "#58C4DD",
  TEAL: "#5CD0B3",
  GREEN: "#83C167",
  YELLOW: "#F7D96F",
  GOLD: "#F0AC5F",
  RED: "#FC6255",
  MAROON: "#C55F73",
  PURPLE: "#9A72AC",
} as const;

// One color per state, healthy -> worst. Extra states reuse the last color.
export const STATE_COLORS = [
  C.GREEN,
  C.TEAL,
  C.YELLOW,
  C.GOLD,
  C.RED,
  C.MAROON,
];

export const BAND_COLORS: Record<string, string> = {
  low: C.GREEN,
  medium: C.YELLOW,
  high: C.RED,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Manim's default rate function: a sigmoid normalised to run 0 -> 1. */
export function smooth(t: number, inflection = 10): number {
  t = clamp01(t);
  const err = sigmoid(-inflection / 2);
  return clamp01((sigmoid(inflection * (t - 0.5)) - err) / (1 - 2 * err));
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Manim's lag_ratio: progress of item i of n when the whole group has
 * progress t. lag = 0 means all at once, 1 means strictly one after another.
 */
export function lagged(t: number, i: number, n: number, lag: number): number {
  const span = 1 / (1 + lag * (n - 1));
  const start = i * lag * span;
  return clamp01((t - start) / span);
}

/** Hex "#RRGGBB" + alpha -> rgba() string. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Draw the first `p` (0..1) of a polyline, like Manim's Create(). */
export function partialPolyline(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  p: number,
) {
  if (pts.length < 2 || p <= 0) return;
  const segs = pts.length - 1;
  const end = p * segs;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= Math.floor(end); i++) ctx.lineTo(pts[i][0], pts[i][1]);
  const frac = end - Math.floor(end);
  if (frac > 0 && Math.floor(end) < segs) {
    const [x0, y0] = pts[Math.floor(end)];
    const [x1, y1] = pts[Math.floor(end) + 1];
    ctx.lineTo(lerp(x0, x1, frac), lerp(y0, y1, frac));
  }
  ctx.stroke();
}
