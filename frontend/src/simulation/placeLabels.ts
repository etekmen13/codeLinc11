// Rows for labels anchored at the left edge of their bar segments. Labels
// never move sideways; a label that would run into the one before it drops
// to the first row where it fits. If no row has room, it is left out
// (row -1); the bar's own label still lists every state. Pure, so it can be
// checked without a browser.

export interface Anchored {
  left: number; // px from the bar's left edge: where the segment starts
  width: number; // px: the label's measured width
}

export function labelRows(
  items: Anchored[], // in bar order, left to right
  gap: number, // px: minimum space between labels in a row
  rows: number,
): number[] {
  const right = new Array(rows).fill(-Infinity); // right edge used per row
  return items.map(({ left, width }) => {
    const row = right.findIndex((edge) => left >= edge + gap);
    if (row >= 0) right[row] = left + width;
    return row;
  });
}
