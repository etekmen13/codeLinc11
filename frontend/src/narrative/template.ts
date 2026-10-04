// Fills {name} placeholders. Unknown names stay visible as {name}, so a
// missing value shows up on screen rather than as an empty gap.
export type Values = Record<string, string | number | undefined | null>;

export function fill(template: string, values: Values): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = values[key];
    return v === undefined || v === null ? whole : String(v);
  });
}

// Splits a template into text and {token} parts, for sentences whose tokens
// render as interactive words.
export type Part = { text: string } | { token: string };

export function parts(template: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) out.push({ text: template.slice(last, m.index) });
    out.push({ token: m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}
