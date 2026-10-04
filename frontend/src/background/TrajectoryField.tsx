// Full-viewport field of faint lines drifting left to right, like loose
// trajectories. Lines leave each bundle tightly packed on the left and fan
// out to the right; `spread` (0 to 1) sets how far they fan, eased over
// duration.spread. It is the only thing on the page that moves on its own.
//
// Cheap per frame: every line goes into one path with one stroke. DPR is
// capped, and the loop stops while the tab is hidden.

import { useEffect, useRef } from "react";
import { color, rgba } from "../design/tokens";
import {
  duration,
  field,
  parallax,
  prefersReducedMotion,
} from "../motion/config";

interface Line {
  bundle: number;
  dev: number; // where it ends up in the fan, in bundle widths
  freq: number; // wiggles across the width
  phase: number;
  amp: number;
}

function gaussian(): number {
  const u = Math.max(Math.random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// paused: stop drawing while something opaque covers the field (the
// simulation stage), so it doesn't compete for frames.
export function TrajectoryField({
  spread,
  paused = false,
}: {
  spread: number;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(spread);
  const redraw = useRef<() => void>(() => {});
  const pausedRef = useRef(paused);
  const resume = useRef<() => void>(() => {});
  useEffect(() => {
    pausedRef.current = paused;
    if (!paused) resume.current();
  }, [paused]);
  useEffect(() => {
    target.current = spread;
    redraw.current();
  }, [spread]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = prefersReducedMotion();
    let w = 0,
      h = 0,
      raf = 0,
      last = performance.now(),
      t = 0,
      current = target.current;
    let lines: Line[] = [];

    const resize = () => {
      const dpr = Math.min(field.maxDpr, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bundles = Math.ceil(1 / field.bundleSpacingVh) + 2;
      lines = Array.from({ length: field.lines }, (_, i) => ({
        bundle: i % bundles,
        dev: gaussian() * 0.5,
        freq: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        amp: 0.5 + Math.random(),
      }));
    };

    const draw = () => {
      const spacing = h * field.bundleSpacingVh;
      const bundles = Math.ceil(1 / field.bundleSpacingVh) + 2;
      const period = bundles * spacing;
      const offset = reduce ? 0 : window.scrollY * parallax.field;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = rgba(color.maroon, field.alphaOnWhite);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = field.segments;
      for (const l of lines) {
        const center =
          ((((l.bundle * spacing - offset) % period) + period) % period) -
          spacing;
        for (let j = 0; j <= n; j++) {
          const u = j / n;
          const fan = Math.pow(u, 1.4);
          const wiggle =
            Math.sin(
              (u * l.freq - t * field.driftSpeed) * Math.PI * 2 + l.phase,
            ) *
            spacing *
            0.035 *
            l.amp *
            (0.3 + fan) *
            (0.4 + current);
          const y = center + l.dev * current * spacing * 1.1 * fan + wiggle;
          if (j === 0) ctx.moveTo(0, y);
          else ctx.lineTo(u * w, y);
        }
      }
      ctx.stroke();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      // Exponential ease toward the target, ~95% there after duration.spread.
      current +=
        (target.current - current) *
        (1 - Math.exp((-3 * dt) / duration.spread));
      draw();
      if (!pausedRef.current) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (!reduce && !pausedRef.current) raf = requestAnimationFrame(frame);
    };
    resume.current = start;
    const onVisibility = () =>
      document.hidden ? cancelAnimationFrame(raf) : start();
    const onResize = () => {
      resize();
      draw();
    };

    redraw.current = () => {
      if (reduce) {
        current = target.current;
        draw();
      }
    };

    resize();
    draw();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="field" aria-hidden="true" />;
}
