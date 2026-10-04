import { lincolnVariables } from "../lincoln/config";
import { motionVariables } from "../motion/config";
import { stageVariables } from "../simulation/playbackConfig";
import { tokenVariables } from "./tokens";

// Writes design, motion and narrator tokens to :root. Called once before render.
export function applyTokens(): void {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries({
    ...tokenVariables(),
    ...motionVariables(),
    ...lincolnVariables(),
    ...stageVariables(),
  }))
    root.setProperty(k, v);
}
