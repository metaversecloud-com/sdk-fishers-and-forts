/**
 * Snow Fort rules (spec §6) and the Castle layout (mockup ww-icefish-ui-fort-castle-stages).
 */
import type { FortState, FortSummary, SectionKey } from "../types/index.js";

export const SLOT_COUNT = 50;
export const TOWER_TOP_SLOTS = [33, 34];

export const SECTIONS: { key: SectionKey; name: string; lastSlot: number }[] = [
  { key: "foundation", name: "Foundation", lastSlot: 8 },
  { key: "walls", name: "Walls", lastSlot: 20 },
  { key: "towers", name: "Towers", lastSlot: 34 },
  { key: "keep", name: "Keep", lastSlot: 50 },
];

export type PieceType = "brick" | "towerTop";
export const pieceTypeForSlot = (slot: number): PieceType => (TOWER_TOP_SLOTS.includes(slot) ? "towerTop" : "brick");

/**
 * Snow needed for brick `n` to appear. Bricks after `spacing.fromBricks` are spread evenly between
 * `spacing.fromSnow` and the goal, so changing the goal mid-fort re-spaces the remaining bricks (spec §7).
 */
export const brickThreshold = (n: number, goal: number, spacing: FortState["spacing"]) => {
  const { fromSnow, fromBricks } = spacing;
  if (n <= fromBricks) return 0;
  const remaining = SLOT_COUNT - fromBricks;
  return Math.ceil(fromSnow + ((goal - fromSnow) * (n - fromBricks)) / remaining);
};

/** How many bricks the given snow has earned (never fewer than already placed). */
export const bricksForSnow = (worldSnow: number, goal: number, spacing: FortState["spacing"], placed = 0) => {
  let n = Math.max(placed, spacing.fromBricks);
  while (n < SLOT_COUNT && worldSnow >= brickThreshold(n + 1, goal, spacing)) n++;
  return n;
};

export const snowUntilNextBrick = (fort: FortState, goal: number) =>
  fort.bricksPlaced >= SLOT_COUNT ? 0 : Math.max(0, brickThreshold(fort.bricksPlaced + 1, goal, fort.spacing) - fort.worldSnow);

export const toFortSummary = (fort: FortState, goal: number): FortSummary => ({
  worldSnow: fort.worldSnow,
  goal,
  bricksPlaced: fort.bricksPlaced,
  snowUntilNextBrick: snowUntilNextBrick(fort, goal),
  complete: fort.bricksPlaced >= SLOT_COUNT,
});

/** Sections whose last slot falls in (before, after]. */
export const sectionsCrossed = (before: number, after: number) =>
  SECTIONS.filter((s) => s.lastSlot > before && s.lastSlot <= after);

// ───────────────────── Castle layout (drawer picture) ─────────────────────
/** col is in brick widths from the left (halves allowed), row in brick heights from the ground. */
export interface LayoutPiece {
  slot: number;
  col: number;
  row: number;
  type: PieceType;
}

const castle: LayoutPiece[] = [];
const add = (slot: number, col: number, row: number) => castle.push({ slot, col, row, type: pieceTypeForSlot(slot) });

// Foundation 1–8 and walls row 9–16
for (let c = 0; c < 8; c++) add(1 + c, c, 0);
for (let c = 0; c < 8; c++) add(9 + c, c, 1);
// Walls 17–20 (middle of row 2), towers 21–24 (ends of row 2)
[2, 3, 4, 5].forEach((c, i) => add(17 + i, c, 2));
[0, 1, 6, 7].forEach((c, i) => add(21 + i, c, 2));
// Towers 25–32 (rows 3–4, two bricks at each end), tower tops 33–34
[0, 1, 6, 7].forEach((c, i) => add(25 + i, c, 3));
[0, 1, 6, 7].forEach((c, i) => add(29 + i, c, 4));
add(33, 0, 5);
add(34, 6, 5);
// Keep 35–49 (three wide, offset half a brick, rows 3–7), 50 on top
for (let r = 0; r < 5; r++) [2.5, 3.5, 4.5].forEach((c, i) => add(35 + r * 3 + i, c, 3 + r));
add(50, 3.5, 8);

export const CASTLE_LAYOUT: LayoutPiece[] = castle.sort((a, b) => a.slot - b.slot);
export const CASTLE_FLAG = { col: 3.5, row: 9 };
