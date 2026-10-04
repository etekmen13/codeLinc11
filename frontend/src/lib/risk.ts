import { riskScale } from "../design/tokens";
import type { RiskBand } from "../types";

// A risk band's color on the ordered risk scale (low, medium, high).
export function bandColor(name: string, bands: RiskBand[]): string {
  const i = Math.max(
    0,
    bands.findIndex((b) => b.name === name),
  );
  return riskScale[Math.min(i, riskScale.length - 1)];
}
