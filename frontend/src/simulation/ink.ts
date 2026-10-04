// "Ink on paper" rendering for thousands of faint lines.
//
// Lines add into a grey density buffer (each line adds the same small amount).
// Each frame the buffer is turned into colour with Beer-Lambert absorption,
// using the ink colour for that x position (GRADIENT):
//   colour_c = 255 * exp(-depth * A_c(x)),  A_c(x) = -ln(gradient_c(x) / 255)
// so one unit of depth shows the gradient colour, less is paler, and
// overlapping lines stack up darker.
// `gain` scales the depth of every line (dark when few lines, lighter when many).

// Ink colour along the time axis (left -> right), from a Lincoln Financial
// badge stripe and lanyard (photo, white-balanced against the badge paper;
// close, not exact brand values): near-black plum at month 0 to orange at the end.
export const GRADIENT: [number, string][] = [
  [0.0, "#2A1418"], // near-black plum
  [0.07, "#5A2B38"], // deep plum
  [0.15, "#7A3F4D"], // badge plum
  [0.27, "#A95456"], // badge mauve
  [0.42, "#C9554D"], // badge red
  [0.62, "#E2603F"], // badge orange
  [1.0, "#F08A4B"], // toward the lanyard orange
];

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const STOPS = GRADIENT.map(([t, c]) => [t, rgb(c)] as const);

/** Ink colour at position u in [0, 1] along the time axis. */
export function gradientAt(u: number): number[] {
  u = Math.min(1, Math.max(0, u));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (u <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const f = (u - t0) / (t1 - t0);
      return c0.map((v, k) => v + (c1[k] - v) * f);
    }
  }
  return [...STOPS[STOPS.length - 1][1]];
}

const BANDS = 160; // colour steps across the width (gradient resolution)

export class Ink {
  private density: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private tmp: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  private out: ImageData;
  private w: number;
  private h: number;

  private bandOf: Uint16Array; // device column -> colour band
  private absorb: Float32Array; // band -> per-channel absorbance

  /** x0, x1: device-pixel x range the gradient spans (the plot area). */
  constructor(
    w: number,
    h: number,
    dpr: number,
    lineWidth: number,
    x0 = 0,
    x1 = w,
  ) {
    this.w = w;
    this.h = h;
    this.bandOf = new Uint16Array(w);
    for (let x = 0; x < w; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      this.bandOf[x] = Math.round(Math.min(1, Math.max(0, u)) * (BANDS - 1));
    }
    this.absorb = new Float32Array(BANDS * 3);
    for (let b = 0; b < BANDS; b++) {
      const c = gradientAt(b / (BANDS - 1));
      for (let k = 0; k < 3; k++)
        this.absorb[b * 3 + k] = -Math.log(Math.max(1, c[k]) / 255);
    }
    const make = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = "#000";
      x.fillRect(0, 0, w / dpr, h / dpr);
      x.globalCompositeOperation = "lighter";
      x.lineWidth = lineWidth;
      x.lineJoin = "round";
      return [c, x] as const;
    };
    [this.density, this.dctx] = make();
    [this.tmp, this.tctx] = make();
    this.out = new ImageData(w, h);
  }

  /** Context to stroke finished lines into (use `Ink.stroke(a)` as strokeStyle). */
  get layer() {
    return this.dctx;
  }

  /** strokeStyle that adds `a` (0..1) of density per line. */
  static stroke(a: number) {
    return `rgba(255, 255, 255, ${Math.min(1, Math.max(0, a))})`;
  }

  /**
   * Paint the ink onto `target` at depth scale `depth` (optical depth of a
   * full-density pixel). `extra(ctx)` may add lines still being drawn.
   */
  paint(
    target: CanvasRenderingContext2D,
    depth: number,
    extra?: (ctx: CanvasRenderingContext2D) => void,
  ) {
    const t = this.tctx;
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = "copy";
    t.drawImage(this.density, 0, 0);
    t.restore();
    if (extra) extra(t);

    // lookup table per colour band: grey level -> paper colour
    const lut = new Uint8ClampedArray(BANDS * 256 * 3);
    for (let b = 0; b < BANDS; b++)
      for (let v = 0; v < 256; v++) {
        const d = (v / 255) * depth;
        const o = (b * 256 + v) * 3;
        for (let k = 0; k < 3; k++)
          lut[o + k] = 255 * Math.exp(-d * this.absorb[b * 3 + k]);
      }
    const src = t.getImageData(0, 0, this.w, this.h).data;
    const dst = this.out.data;
    for (let y = 0, i = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++, i += 4) {
        const o = (this.bandOf[x] * 256 + src[i]) * 3;
        dst[i] = lut[o];
        dst[i + 1] = lut[o + 1];
        dst[i + 2] = lut[o + 2];
        dst[i + 3] = 255;
      }
    t.putImageData(this.out, 0, 0);
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(this.tmp, 0, 0);
    target.restore();
  }
}
