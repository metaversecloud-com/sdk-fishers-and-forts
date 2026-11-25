import { CASTLE_LAYOUT, SECTIONS, brickThreshold, bricksForSnow, sectionsCrossed } from "@shared/fort/fort.js";
import { parseSlot } from "../utils/fortPieces.js";

const even = { fromSnow: 0, fromBricks: 0 };

describe("Snow Fort math", () => {
  test("one brick per 600 snow at the default goal", () => {
    expect(brickThreshold(1, 30000, even)).toBe(600);
    expect(brickThreshold(50, 30000, even)).toBe(30000);
    expect(bricksForSnow(18720, 30000, even)).toBe(31);
  });

  test("raising the goal re-spaces the remaining bricks; bricks never decrease", () => {
    const spacing = { fromSnow: 18720, fromBricks: 31 };
    expect(bricksForSnow(18720, 50000, spacing, 31)).toBe(31);
    expect(brickThreshold(50, 50000, spacing)).toBe(50000);
    expect(brickThreshold(32, 50000, spacing)).toBeGreaterThan(18720);
  });

  test("lowering the goal below World Snow places every brick at once", () => {
    expect(bricksForSnow(18720, 10000, { fromSnow: 18720, fromBricks: 31 }, 31)).toBe(50);
  });

  test("sections and milestones", () => {
    expect(SECTIONS.map((s) => s.lastSlot)).toEqual([8, 20, 34, 50]);
    expect(sectionsCrossed(7, 21).map((s) => s.key)).toEqual(["foundation", "walls"]);
  });

  test("castle layout has 50 unique slots with tower tops at 33/34 and the flag block at 50", () => {
    expect(CASTLE_LAYOUT.map((p) => p.slot)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(CASTLE_LAYOUT.filter((p) => p.type === "towerTop").map((p) => p.slot)).toEqual([33, 34]);
    expect(CASTLE_LAYOUT.filter((p) => p.type === "flag").map((p) => p.slot)).toEqual([50]);
  });

  test("unique name parsing tolerates padding and ignores junk", () => {
    expect(parseSlot("Fishers&Forts_fortBlock_7")).toBe(7);
    expect(parseSlot("Fishers&Forts_fortBlock_07")).toBe(7);
    expect(parseSlot("Fishers&Forts_fortBlock_51")).toBeNull();
    expect(parseSlot("Fishers&Forts_fortBlock_7 copy")).toBeNull();
  });
});
