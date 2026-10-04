// "Ink on paper" version of MonteCarloScene: white background; the ink colour
// follows the time axis, near-black plum at month 0 to orange at the end
// (the badge/lanyard GRADIENT in ink.ts). Few lines: strong strokes; as more
// are drawn each line gets lighter, and overlapping lines stack up darker.
//
// Futures are drawn one after another, then faster and faster until the whole
// cloud is in, while a counter and a running risk estimate settle (Monte Carlo
// converging). It ends on the full cloud; the slider then moves a month cursor
// across it, with the state shares and risk band for that month.
//
// Props come straight from the backend:
//   paths:  sample of futures, paths[i][t] = state index of future i at month t
//           (run_simulation's `paths` transposed; ~200-500 futures is plenty)
//   states: state names, index-aligned with the matrix
//   bands:  optional outcome_summary(...)["bands"], one per month

import { useEffect, useMemo, useRef, useState } from "react";
import { Ink } from "./ink";
import { partialPolyline, smooth, withAlpha } from "./manim";
import { SUB, bridgePaths } from "./stochastic";

type Props = {
  paths: number[][];
  states: string[];
  bands?: string[];
  totalFutures?: number; // shown in the counter; defaults to the number drawn
  laneSpacing?: number; // px between states on the y axis
  durationMs?: number; // length of the whole animation (default 7000)
};

type Layout = {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  laneH: number;
  height: number;
  x: (t: number) => number;
  y: (s: number) => number;
};

// paper palette
// colours from the badge/lanyard ramp in ink.ts
const P = {
  PAPER: "#FFFFFF",
  INK_TEXT: "#3A1F27",
  MUTED: "#8C7479",
  RULE: "#F0E6E6",
  ORANGE: "#E2603F",
  BANDS: { low: "#F5A462", medium: "#C9554D", high: "#7A3F4D" } as Record<
    string,
    string
  >,
};

const FONT = `"CMU Serif", "Latin Modern Roman", "STIX Two Text", Georgia, serif`;
const DEFAULT_MS = 7000; // whole animation
const DRAW_MS = 450; // time to draw one future; every future uses the same speed
// Density each finished future adds to the ink buffer (fainter when there are
// more, so the final cloud is balanced). Floor = 1.2/255, the smallest step an
// 8-bit canvas can add.
const lineInk = (n: number) =>
  Math.max(1.2 / 255, Math.min(0.09, 25 / Math.max(n, 1)));
// Optical depth of one line when `n` are on screen: dark when few, lighter when many.
const liveDepth = (n: number) => Math.min(0.35, 25 / Math.max(n, 1)) * 8;
// depth scale for the ink buffer when `n` of `total` futures are on screen
const depthFor = (n: number, total: number) => liveDepth(n) / lineInk(total);

const label = (s: string) => s.replace(/_/g, " ");

export default function MonteCarloPaper({
  paths,
  states,
  bands,
  totalFutures,
  laneSpacing = 64,
  durationMs = DEFAULT_MS,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [run, setRun] = useState(0); // bump to replay
  const [done, setDone] = useState(false);
  const months = (paths[0]?.length ?? 1) - 1;
  const total = totalFutures ?? paths.length;
  const [cursor, setCursor] = useState(months);
  const cloudRef = useRef<{ key: unknown; canvas: HTMLCanvasElement } | null>(
    null,
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(320, e.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout: Layout = useMemo(() => {
    const padL = Math.min(140, width * 0.2);
    const padR = Math.min(160, width * 0.2);
    const padT = 76;
    const padB = 70;
    const laneH = laneSpacing;
    const plotW = width - padL - padR;
    return {
      padL,
      padR,
      padT,
      padB,
      plotW,
      laneH,
      height: padT + padB + laneH * states.length,
      x: (t: number) => padL + (months ? (t / months) * plotW : 0),
      y: (s: number) => padT + (s + 0.5) * laneH,
    };
  }, [width, states.length, months, laneSpacing]);

  // Stochastic interpolation between simulated months, in pixels.
  const fine = useMemo(() => bridgePaths(paths, { ouLimit: 0.3 }), [paths]);
  const pts = useMemo(
    () =>
      fine.map((f) =>
        Array.from(
          f,
          (y, j) => [layout.x(j / SUB), layout.y(y)] as [number, number],
        ),
      ),
    [fine, layout],
  );
  const cloudKey = pts; // cached cloud is valid as long as the drawn points are
  const worse = useMemo(
    () => paths.map((p) => p[months] > p[0]),
    [paths, months],
  );

  // The animation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paths.length === 0) return;
    const ctx = setupCanvas(canvas, width, layout.height);
    const N = paths.length;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const t0 = performance.now();
    let raf = 0;
    setDone(false);

    // Futures start at a constant rate and each draws at the same speed
    // (Manim's Create with a fixed lag). Finished futures are committed to an
    // offscreen layer so each frame only redraws the ones still in flight.
    // Quadratic ramp: the number of futures started by time t grows like t^2,
    // so future i starts at startSpan * sqrt(i / (N - 1)). Every future then
    // takes the same drawMs to draw.
    const lengthMs = Math.max(200, durationMs);
    const drawMs = Math.min(DRAW_MS, lengthMs * 0.4);
    const startSpan = lengthMs - drawMs;
    const startAt = (i: number) =>
      N > 1 ? startSpan * Math.sqrt(i / (N - 1)) : 0;
    const dpr = window.devicePixelRatio || 1;
    const ink = new Ink(
      canvas.width,
      canvas.height,
      dpr,
      1.4,
      layout.padL * dpr,
      (layout.padL + layout.plotW) * dpr,
    );
    const a = lineInk(N);
    let committed = 0;

    const frame = (now: number) => {
      const el = reduce ? lengthMs : now - t0;
      // commit every future that has finished drawing
      ink.layer.strokeStyle = Ink.stroke(a);
      while (committed < N && el >= startAt(committed) + drawMs) {
        partialPolyline(ink.layer, pts[committed], 1);
        committed++;
      }

      // ink depth: few lines -> dark strokes, many -> lighter. Lines still being
      // drawn add the same ink as finished ones.
      ink.paint(ctx, depthFor(Math.max(committed, 1), N), (t) => {
        t.strokeStyle = Ink.stroke(a);
        for (let i = committed; i < N && startAt(i) <= el; i++)
          partialPolyline(t, pts[i], smooth((el - startAt(i)) / drawMs));
      });
      drawAxes(ctx, layout, states, months, reduce ? 1 : Math.min(1, el / 600));

      const est = committed
        ? worse.slice(0, committed).filter(Boolean).length / committed
        : 0;
      header(
        ctx,
        layout,
        width,
        `futures simulated: ${Math.round((committed / N) * total).toLocaleString()}`,
        committed >= 20
          ? `chance it gets worse by month ${months}: ${(est * 100).toFixed(1)}%`
          : "",
      );

      if (committed < N) raf = requestAnimationFrame(frame);
      else {
        setCursor(months);
        setDone(true);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [
    run,
    paths,
    pts,
    worse,
    states,
    months,
    width,
    layout,
    total,
    durationMs,
  ]);

  // Resting view: the full cloud plus a month cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!done || !canvas) return;
    const ctx = setupCanvas(canvas, width, layout.height);
    // the finished cloud is drawn once and cached; scrubbing only redraws the cursor
    if (!cloudRef.current || cloudRef.current.key !== cloudKey) {
      const img = document.createElement("canvas");
      img.width = canvas.width;
      img.height = canvas.height;
      const c = img.getContext("2d")!;
      const N = paths.length;
      const dpr = window.devicePixelRatio || 1;
      const ink = new Ink(
        img.width,
        img.height,
        dpr,
        1.4,
        layout.padL * dpr,
        (layout.padL + layout.plotW) * dpr,
      );
      ink.layer.strokeStyle = Ink.stroke(lineInk(N));
      paths.forEach((_, i) => partialPolyline(ink.layer, pts[i], 1));
      // same depth the animation ended on, so nothing jumps
      ink.paint(c, depthFor(N, N));
      cloudRef.current = { key: cloudKey, canvas: img };
    }
    clear(ctx, width, layout.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cloudRef.current.canvas, 0, 0);
    ctx.restore();
    drawAxes(ctx, layout, states, months, 1);
    drawCursor(ctx, layout, width, paths, states, bands, months, cursor, total);
  }, [
    done,
    cursor,
    paths,
    pts,
    states,
    bands,
    months,
    width,
    layout,
    total,
    cloudKey,
  ]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        background: P.PAPER,
        borderRadius: 8,
        border: `1px solid ${P.RULE}`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: layout.height, display: "block" }}
      />
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "6px 16px 12px",
        }}
      >
        <button onClick={() => setRun((r) => r + 1)}>Replay</button>
        <input
          type="range"
          min={0}
          max={months}
          step={1}
          value={cursor}
          disabled={!done}
          onChange={(e) => setCursor(Number(e.target.value))}
          style={{ flex: 1 }}
          aria-label="Month"
        />
        <span style={{ color: P.MUTED, fontFamily: FONT, minWidth: 80 }}>
          month {cursor}
        </span>
      </div>
    </div>
  );
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function clear(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = P.PAPER;
  c.fillRect(0, 0, w, h);
}

function header(
  c: CanvasRenderingContext2D,
  L: Layout,
  width: number,
  left: string,
  right: string,
  rightCol?: string,
) {
  c.font = `26px ${FONT}`;
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.fillStyle = P.INK_TEXT;
  c.fillText(left, L.padL, 42);
  c.textAlign = "right";
  c.fillStyle = rightCol ?? P.ORANGE;
  c.fillText(right, width - 16, 42);
  c.textAlign = "left";
}

// State lanes and month ticks, fading in with opacity `a`.
function drawAxes(
  c: CanvasRenderingContext2D,
  L: Layout,
  states: string[],
  months: number,
  a: number,
) {
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = P.RULE;
  c.lineWidth = 1;
  c.font = `17px ${FONT}`;
  states.forEach((s, i) => {
    c.beginPath();
    c.moveTo(L.padL, L.y(i));
    c.lineTo(L.padL + L.plotW, L.y(i));
    c.stroke();
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillStyle = P.INK_TEXT;
    c.fillText(label(s), L.padL - 12, L.y(i));
  });
  c.fillStyle = P.MUTED;
  c.textAlign = "center";
  c.textBaseline = "top";
  const step = months > 12 ? 3 : 1;
  const yTicks = L.height - L.padB + 10;
  for (let t = 0; t <= months; t += step) c.fillText(String(t), L.x(t), yTicks);
  c.textAlign = "left";
  c.restore();
}

// Month cursor: vertical line, state shares at that month, full band strip.
function drawCursor(
  c: CanvasRenderingContext2D,
  L: Layout,
  width: number,
  paths: number[][],
  states: string[],
  bands: string[] | undefined,
  months: number,
  m: number,
  totalFutures: number,
) {
  const N = paths.length;

  // band strip under the axis; months up to the cursor drawn solid
  if (bands) {
    const yb = L.height - L.padB + 38;
    for (let t = 0; t < months; t++) {
      c.fillStyle = withAlpha(
        P.BANDS[bands[t + 1]] ?? P.MUTED,
        t < m ? 1 : 0.35,
      );
      c.fillRect(L.x(t), yb, L.x(t + 1) - L.x(t) + 0.5, 7);
    }
  }

  // cursor line
  c.strokeStyle = withAlpha(P.INK_TEXT, 0.6);
  c.lineWidth = 1;
  c.setLineDash([3, 4]);
  c.beginPath();
  c.moveTo(L.x(m), L.padT - 6);
  c.lineTo(L.x(m), L.height - L.padB + 2);
  c.stroke();
  c.setLineDash([]);

  // shares at month m (from the simulated states)
  const counts = new Array(states.length).fill(0);
  for (let i = 0; i < N; i++) counts[paths[i][m]]++;
  const barX = width - L.padR + 16;
  const barMax = L.padR - 66;
  c.font = `16px ${FONT}`;
  c.textBaseline = "middle";
  counts.forEach((n, s) => {
    const share = n / N;
    c.fillStyle = P.ORANGE;
    c.fillRect(barX, L.y(s) - 7, Math.max(1, share * barMax), 14);
    c.fillStyle = P.INK_TEXT;
    c.fillText(
      `${Math.round(share * 100)}%`,
      barX + share * barMax + 6,
      L.y(s),
    );
  });

  const band = bands?.[m];
  header(
    c,
    L,
    width,
    `${totalFutures.toLocaleString()} futures · month ${m}`,
    band ? `risk: ${band}` : "",
    band ? P.BANDS[band] : undefined,
  );
}