// The futures, drawn one at a time in white on the maroon stage. Two
// transparent canvases: the resting layer below holds every landed path at
// low opacity, so where many futures overlap the band glows brighter; the
// live layer above holds the paths being drawn, the fading trail of recent
// ones, and the histogram, which grows as futures land. Each landed path is
// stroked once per layer, so frames stay cheap as the rate climbs. State
// labels and the time axis are HTML, so they use the page's fonts.

import { useEffect, useMemo, useRef, useState } from "react";
import { easeFn, prefersReducedMotion } from "../motion/config";
import { partialPolyline } from "./manim";
import { playback as P, plot, type StagePhase } from "./playbackConfig";
import { bridgePaths, SUB } from "./stochastic";

interface Props {
  paths: number[][]; // paths[i][month] = state index
  states: string[]; // labels, healthy first
  phase: StagePhase;
  runId: number; // a new value replays
  onDone: () => void;
}

interface Layout {
  w: number;
  h: number; // canvas height (the axis sits below it)
  narrow: boolean;
  x0: number;
  x1: number;
  barX: number;
  barMax: number;
  laneH: number;
}

// An offscreen layer of the trail: the paths that landed in one window.
interface Trail {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  end: number; // when its window closes and it starts to fade
}

const white = (a: number) => `rgba(255, 255, 255, ${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function FuturesPlayback({
  paths,
  states,
  phase,
  runId,
  onDone,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const months = (paths[0]?.length ?? 1) - 1;
  const layout: Layout | null = useMemo(() => {
    if (size.w < 200 || size.h < 120) return null;
    const narrow = size.w < 640;
    const padL = narrow ? plot.labelWidthNarrow : plot.labelWidth;
    const padR = narrow ? plot.histogramWidthNarrow : plot.histogramWidth;
    const h = size.h - plot.axisHeight;
    const x1 = size.w - padR - plot.gap;
    return {
      w: size.w,
      h,
      narrow,
      x0: padL + plot.gap,
      x1,
      barX: x1 + plot.gap,
      barMax: padR,
      laneH: h / Math.max(1, states.length),
    };
  }, [size, states.length]);

  // Each future as points in pixels, with eased switches between states and
  // a small sideways wobble so futures in one state don't overlap exactly.
  const fine = useMemo(
    () => bridgePaths(paths, { ouLimit: P.laneWobble }),
    [paths],
  );
  const pts = useMemo(() => {
    if (!layout) return [];
    const { x0, x1, laneH } = layout;
    return fine.map((f) =>
      Array.from(
        f,
        (y, j) =>
          [x0 + (j / SUB / months) * (x1 - x0), (y + 0.5) * laneH] as [
            number,
            number,
          ],
      ),
    );
  }, [fine, layout, months]);

  // The same futures as cached shapes, for stroking whole paths.
  const shapes = useMemo(
    () =>
      pts.map((p) => {
        const s = new Path2D();
        p.forEach(([x, y], j) => (j ? s.lineTo(x, y) : s.moveTo(x, y)));
        return s;
      }),
    [pts],
  );

  // Where each future ends up; the largest share fills the bar width.
  const ends = useMemo(() => paths.map((p) => p[months]), [paths, months]);
  const finalShares = useMemo(() => {
    const c = new Array(states.length).fill(0);
    for (const s of ends) c[s]++;
    return c.map((n) => n / Math.max(1, ends.length));
  }, [ends, states.length]);

  useEffect(() => {
    const baseCv = base.current;
    const liveCv = live.current;
    if (!baseCv || !liveCv || !layout) return;
    const { w, h } = layout;
    const bctx = setup(baseCv, w, h);
    const lctx = setup(liveCv, w, h);
    const scale = layout.barMax / Math.max(...finalShares, 1e-6);

    const drawBars = (shares: number[]) => {
      lctx.fillStyle = white(P.barAlpha);
      const t = layout.laneH * P.barThickness;
      shares.forEach((v, s) => {
        if (v <= 0) return;
        const y = (s + 0.5) * layout.laneH;
        lctx.fillRect(layout.barX, y - t / 2, v * scale, t);
      });
    };
    const pen = (c: CanvasRenderingContext2D, alpha: number, width: number) => {
      c.strokeStyle = white(alpha);
      c.lineWidth = width;
      c.lineJoin = "round";
    };
    const clear = () => {
      bctx.clearRect(0, 0, w, h);
      lctx.clearRect(0, 0, w, h);
    };
    const drawFinal = () => {
      clear();
      pen(bctx, P.restAlpha, P.restWidth);
      for (const s of shapes) bctx.stroke(s);
      drawBars(finalShares);
    };

    if (phase === "done") {
      drawFinal();
      return;
    }
    // A fresh run starts on an empty stage. Going idle leaves the picture
    // as it is, so it fades out with the stage.
    if (phase === "dark") clear();
    if (phase !== "playing") return;
    if (prefersReducedMotion()) {
      drawFinal();
      onDoneRef.current();
      return;
    }

    // Path i starts at start[i] and takes dur[i] to draw.
    const N = pts.length;
    const dur = Array.from(
      { length: N },
      (_, i) =>
        P.minPathMs +
        (P.firstPathMs - P.minPathMs) * Math.exp(-i / P.rampPaths),
    );
    const start = new Array<number>(N);
    for (let i = 0, t = 0; i < N; t += dur[i], i++) start[i] = t;

    // The trail. A landed path goes onto the resting layer at once, and in
    // full white onto the trail layer of the window it landed in. Each trail
    // layer fades as a whole once its window closes, so a frame costs the
    // same however many paths are fading. Spent layers are reused.
    const windowMs = P.trailMs / P.trailSteps;
    const trails: Trail[] = [];
    const spare: Trail[] = [];
    const trailAt = (el: number): Trail => {
      const open = trails[trails.length - 1];
      if (open && el < open.end) return open;
      let t = spare.pop();
      if (!t) {
        const canvas = document.createElement("canvas");
        t = { canvas, ctx: setup(canvas, w, h), end: 0 };
      }
      t.ctx.clearRect(0, 0, w, h);
      pen(t.ctx, 1, P.activeWidth);
      t.end = el + windowMs;
      trails.push(t);
      return t;
    };

    clear();
    pen(bctx, P.restAlpha, P.restWidth);
    const counts = new Array(states.length).fill(0);
    const shown = new Array(states.length).fill(0);
    let landed = 0;
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      const el = now - t0;
      while (landed < N && start[landed] + dur[landed] <= el) {
        const i = landed++;
        counts[ends[i]]++;
        bctx.stroke(shapes[i]);
        trailAt(el).ctx.stroke(shapes[i]);
      }

      lctx.clearRect(0, 0, w, h);
      while (trails.length && el - trails[0].end >= P.trailMs)
        spare.push(trails.shift()!);
      for (const t of trails) {
        lctx.globalAlpha = 1 - easeFn(Math.max(0, (el - t.end) / P.trailMs));
        lctx.drawImage(t.canvas, 0, 0, w, h);
      }
      lctx.globalAlpha = 1;

      // The paths still being drawn; the slow early ones glow.
      for (let i = landed; i < N && start[i] <= el; i++) {
        const p = (el - start[i]) / dur[i];
        const glow = dur[i] > P.glowSlowerThanMs;
        lctx.save();
        if (glow) {
          lctx.shadowColor = white(0.8);
          lctx.shadowBlur = P.glowBlur;
        }
        pen(lctx, 1, P.activeWidth);
        partialPolyline(lctx, pts[i], p);
        if (glow) {
          const [hx, hy] = pointAt(pts[i], p);
          lctx.fillStyle = white(1);
          lctx.beginPath();
          lctx.arc(hx, hy, P.headRadius, 0, Math.PI * 2);
          lctx.fill();
        }
        lctx.restore();
      }

      let settled = landed === N && trails.length === 0;
      for (let s = 0; s < shown.length; s++) {
        const target = counts[s] / N;
        shown[s] += (target - shown[s]) * P.barEase;
        if (Math.abs(target - shown[s]) > 0.001) settled = false;
      }
      drawBars(shown);

      if (settled) onDoneRef.current();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, runId, layout, pts, shapes, ends, finalShares, states.length]);

  const ticks: number[] = [];
  for (let t = 0; t <= months; t += P.tickEveryMonths) ticks.push(t);
  const xAt = (t: number) =>
    layout ? layout.x0 + (t / months) * (layout.x1 - layout.x0) : 0;

  return (
    <div
      ref={wrap}
      className="futures"
      data-shown={phase === "playing" || phase === "done"}
      aria-hidden="true"
    >
      <canvas
        ref={base}
        className="futures__canvas"
        style={{ height: layout?.h }}
      />
      <canvas
        ref={live}
        className="futures__canvas futures__canvas--live"
        style={{ height: layout?.h }}
      />
      {layout && (
        <>
          {states.map((s, i) => (
            <span
              key={s}
              className="futures__state"
              style={{
                top: (i + 0.5) * layout.laneH,
                width: layout.x0 - plot.gap,
              }}
            >
              {s}
            </span>
          ))}
          <div className="futures__axis" style={{ top: layout.h }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="futures__tick"
                style={{ left: xAt(t) }}
              />
            ))}
            <span className="futures__end" style={{ left: xAt(0) }}>
              0
            </span>
            <span className="futures__end" style={{ left: xAt(months) }}>
              {months}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Sizes a canvas for the device pixel ratio. Resizing clears a canvas, so
// it only happens when the size changes.
function setup(cv: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (cv.width !== pw) cv.width = pw;
  if (cv.height !== ph) cv.height = ph;
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// The point a fraction p of the way along a polyline (by vertex count, as
// partialPolyline draws it).
function pointAt(pts: [number, number][], p: number): [number, number] {
  const end = p * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(end));
  const f = end - i;
  return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
}
