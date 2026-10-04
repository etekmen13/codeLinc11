// Resolves each expression to an asset URL from src/assets/lincoln/, with
// the fallbacks described in config.ts. null means the maroon circle.

import type { Expression } from "../narrative/script";
import { files } from "./config";

const found = import.meta.glob<string>("../assets/lincoln/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(found)) {
  const name = path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
  byName.set(name, url);
}

const pick = (names: string[]) =>
  names.map((n) => byName.get(n)).find(Boolean) ?? null;

export const EXPRESSIONS = Object.keys(files) as Expression[];

const neutral = pick(files.neutral);
const missing: Expression[] = [];

export const assetUrls = Object.fromEntries(
  EXPRESSIONS.map((e) => {
    const url = pick(files[e]);
    if (!url) missing.push(e);
    return [e, url ?? neutral];
  }),
) as Record<Expression, string | null>;

if (missing.length)
  console.warn(
    `Lincoln: no art for ${missing.join(", ")} in src/assets/lincoln/; ` +
      (neutral ? "showing neutral instead." : "showing a placeholder circle."),
  );
