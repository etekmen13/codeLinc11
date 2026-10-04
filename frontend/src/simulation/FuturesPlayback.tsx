// The futures, drawn one at a time in white on the maroon stage. The canvas
// is transparent; finished paths rest on an offscreen layer at low opacity,
// so where many futures overlap the band glows brighter. Only the active
// path and the short trail of recent ones are drawn live, so each frame
// costs about the same. A histogram at the right grows as futures land.
// State labels and the time axis are HTML, so they use the page's fonts.

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
  const canvas = useRef<HTMLCanvasElement>(null);
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

  // Where each future ends up; the largest share fills the bar width.
  const ends = useMemo(() => paths.map((p) => p[months]), [paths, months]);
  const finalShares = useMemo(() => {
    const c = new Array(states.length).fill(0);
    for (const s of ends) c[s]++;
    return c.map((n) => n / Math.max(1, ends.length));
  }, [ends, states.length]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !layout) return;
    const ctx = setup(cv, layout.w, layout.h);
    const scale = layout.barMax / Math.max(...finalShares, 1e-6);

    const drawBars = (shares: number[]) => {
      ctx.fillStyle = white(P.barAlpha);
      const t = layout.laneH * P.barThickness;
      shares.forEach((v, s) => {
        if (v <= 0) return;
        const y = (s + 0.5) * layout.laneH;
        ctx.fillRect(layout.barX, y - t / 2, v * scale, t);
      });
    };
    const restStroke = (c: CanvasRenderingContext2D) => {
      c.strokeStyle = white(P.restAlpha);
      c.lineWidth = P.restWidth;
      c.lineJoin = "round";
    };
    const drawFinal = () => {
      ctx.clearRect(0, 0, layout.w, layout.h);
      restStroke(ctx);
      for (const p of pts) partialPolyline(ctx, p, 1);
      drawBars(finalShares);
    };

    if (phase === "done") {
      drawFinal();
      return;
    }
    // A fresh run starts on an empty stage. Going idle leaves the picture
    // as it is, so it fades out with the stage.
    if (phase === "dark") ctx.clearRect(0, 0, layout.w, layout.h);
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

    const accum = document.createElement("canvas");
    const actx = setup(accum, layout.w, layout.h);
    restStroke(actx);
    const counts = new Array(states.length).fill(0);
    const shown = new Array(states.length).fill(0);
    let committed = 0; // paths resting on the accumulation layer
    let landed = 0; // paths fully drawn (counted in the histogram)
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      const el = now - t0;
      while (
        committed < N &&
        start[committed] + dur[committed] + P.trailMs <= el
      )
        partialPolyline(actx, pts[committed++], 1);
      while (landed < N && start[landed] + dur[landed] <= el)
        counts[ends[landed++]]++;

      ctx.clearRect(0, 0, layout.w, layout.h);
      ctx.drawImage(accum, 0, 0, layout.w, layout.h);
      ctx.lineJoin = "round";
      for (let i = committed; i < N && start[i] <= el; i++) {
        const p = (el - start[i]) / dur[i];
        if (p < 1) {
          const glow = dur[i] > P.glowSlowerThanMs;
          ctx.save();
          if (glow) {
            ctx.shadowColor = white(0.8);
            ctx.shadowBlur = P.glowBlur;
          }
          ctx.strokeStyle = white(1);
          ctx.lineWidth = P.activeWidth;
          partialPolyline(ctx, pts[i], p);
          if (glow) {
            const [hx, hy] = pointAt(pts[i], p);
            ctx.fillStyle = white(1);
            ctx.beginPath();
            ctx.arc(hx, hy, P.headRadius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else {
          const f = easeFn(Math.min(1, (el - start[i] - dur[i]) / P.trailMs));
          ctx.strokeStyle = white(lerp(1, P.restAlpha, f));
          ctx.lineWidth = lerp(P.activeWidth, P.restWidth, f);
          partialPolyline(ctx, pts[i], 1);
        }
      }

      let settled = landed === N;
      for (let s = 0; s < shown.length; s++) {
        const target = counts[s] / N;
        shown[s] += (target - shown[s]) * P.barEase;
        if (Math.abs(target - shown[s]) > 0.001) settled = false;
      }
      drawBars(shown);

      if (committed === N && settled) onDoneRef.current();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, runId, layout, pts, ends, finalShares, states.length]);

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
        ref={canvas}
        className="futures__canvas"
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
