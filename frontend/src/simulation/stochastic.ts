// Stochastic interpolation between the simulated monthly states.
//
// The Monte Carlo only knows the state at whole months. Between months we
// draw a path that is random but consistent with those endpoints:
//   - if the state changed during month t -> t+1, the switch happens at a
//     random moment tau in that month (uniform), smoothed over a short window;
//   - a Brownian bridge adds noise that is pinned to 0 at both month ends,
//     so the path still passes exactly through each simulated state;
//   - an Ornstein-Uhlenbeck process gives each future a slow sideways wobble
//     within its lane, so futures in the same state don't overlap.
// Output y is in "state units": state s sits at y = s, offsets are fractions
// of a lane. Deterministic per future (seeded), so frames don't flicker.

import { smooth } from "./manim";

export const SUB = 12; // sub-steps per month

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

type Opts = {
  sub?: number; // sub-steps per month
  bridgeSigma?: number; // Brownian bridge noise on a month with a transition
  calmSigma?: number; // ... on a month that stays in one state
  ouTheta?: number; // pull of the lane wobble back to centre (per month)
  ouSigma?: number; // strength of the lane wobble
  ouLimit?: number; // max wobble, as a fraction of a lane
  switchWidth?: number; // how long a state change takes, as a fraction of a month
};

export function bridgePaths(
  paths: number[][],
  opts: Opts = {},
): Float32Array[] {
  const {
    sub = SUB,
    bridgeSigma = 0.22,
    calmSigma = 0.05,
    ouTheta = 1.2,
    ouSigma = 0.35,
    ouLimit = 0.4,
    switchWidth = 0.3,
  } = opts;
  const dt = 1 / sub;

  return paths.map((p, i) => {
    const rand = mulberry32(0x9e3779b9 ^ (i * 2654435761));
    const months = p.length - 1;
    const y = new Float32Array(months * sub + 1);
    let ou = (rand() - 0.5) * ouLimit; // start somewhere in the lane

    for (let t = 0; t < months; t++) {
      const a = p[t];
      const b = p[t + 1];
      const tau = 0.1 + 0.8 * rand(); // when in the month the change happens
      const sigma = a === b ? calmSigma : bridgeSigma;

      // Brownian bridge on this month: W_j - (j/sub) * W_sub
      const w = new Float32Array(sub + 1);
      for (let j = 1; j <= sub; j++)
        w[j] = w[j - 1] + gaussian(rand) * Math.sqrt(dt) * sigma;

      for (let j = 0; j < sub; j++) {
        const u = j * dt;
        const base =
          a === b ? a : a + (b - a) * smooth((u - tau) / switchWidth + 0.5);
        const bridge = w[j] - u * w[sub];
        ou += -ouTheta * ou * dt + ouSigma * Math.sqrt(dt) * gaussian(rand);
        ou = Math.max(-ouLimit, Math.min(ouLimit, ou));
        y[t * sub + j] = base + bridge + ou;
      }
    }
    y[months * sub] = p[months] + ou;
    return y;
  });
}

/** y (state units) of future i at fractional month m, linearly between sub-steps. */
export function yAt(fine: Float32Array, m: number, sub = SUB): number {
  const h = Math.min(Math.max(m * sub, 0), fine.length - 1);
  const j = Math.floor(h);
  const f = h - j;
  return j + 1 < fine.length ? fine[j] + (fine[j + 1] - fine[j]) * f : fine[j];
}