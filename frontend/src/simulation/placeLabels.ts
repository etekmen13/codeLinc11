// Places labels under the segments of a bar so they never overlap. Each label
// wants to sit centered under its segment. It takes the first row where that
// spot is free, or else the row with the most room; then each row is spread
// so neighbors keep `gap` between them and stay inside the bar. Labels only
// overlap if a row's labels can't fit side by side at all. Pure, so it can be
// checked without a browser.

export interface LabelBox {
  center: number; // px: the middle of the label's segment
  width: number; // px: the label's measured width
}

export interface Placed {
  x: number; // px: the label's left edge
  row: number;
}

export function placeLabels(
  items: LabelBox[], // in bar order, left to right
  width: number, // px: the bar's width
  gap: number, // px: minimum space between labels in a row
  rows: number,
): Placed[] {
  const ideal = items.map(({ center, width: w }) =>
    Math.min(Math.max(center - w / 2, 0), Math.max(0, width - w)),
  );

  // Rows: first row where the ideal spot is free, else the emptiest.
  const right = new Array(rows).fill(-Infinity);
  const row = items.map((it, i) => {
    let r = right.findIndex((edge) => ideal[i] >= edge + gap);
    if (r < 0) r = right.indexOf(Math.min(...right));
    right[r] = Math.max(ideal[i], right[r] + gap) + it.width;
    return r;
  });

  // Spread each row: push right past the previous label, then pull back
  // inside the bar from the right.
  const x = [...ideal];
  for (let r = 0; r < rows; r++) {
    const ids = items.map((_, i) => i).filter((i) => row[i] === r);
    for (let k = 1; k < ids.length; k++) {
      const [a, b] = [ids[k - 1], ids[k]];
      x[b] = Math.max(x[b], x[a] + items[a].width + gap);
    }
    for (let k = ids.length - 1; k >= 0; k--) {
      const b = ids[k];
      const limit = k === ids.length - 1 ? width : x[ids[k + 1]] - gap;
      x[b] = Math.max(0, Math.min(x[b], limit - items[b].width));
    }
  }
  return items.map((_, i) => ({ x: x[i], row: row[i] }));
}
