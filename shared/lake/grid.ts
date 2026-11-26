import { HOLE_COUNT, LAKE_SIZE } from "../constants.js";

/** Precomputed neighbor lists (8-way, fewer at edges), in reading order. */
export const NEIGHBORS: number[][] = Array.from({ length: HOLE_COUNT }, (_, i) => {
  const r = Math.floor(i / LAKE_SIZE);
  const c = i % LAKE_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < LAKE_SIZE && nc >= 0 && nc < LAKE_SIZE) out.push(nr * LAKE_SIZE + nc);
    }
  }
  return out;
});

export const isAdjacent = (a: number, b: number) => NEIGHBORS[a].includes(b);

export const rowCol = (i: number) => ({ row: Math.floor(i / LAKE_SIZE) + 1, col: (i % LAKE_SIZE) + 1 });
