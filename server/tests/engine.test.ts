import { DRILLS, FISH_COUNT, HOLE_COUNT } from "@shared/constants.js";
import { applyDrill, countAround, generateLake, runHelper, solveLake } from "@shared/lake/engine.js";
import { NEIGHBORS, isAdjacent } from "@shared/lake/grid.js";
import { newProgress, toLakeView } from "@shared/lake/view.js";
import type { Lake } from "@shared/types/index.js";

describe("lake generation", () => {
  test("lakes follow the generation rules", () => {
    for (let i = 0; i < 200; i++) {
      const lake = generateLake(`gen-${i}`, true);
      const fish = new Set(lake.fish);
      expect(fish.size).toBe(FISH_COUNT);
      expect(lake.clues).toHaveLength(3);
      for (const c of lake.clues) {
        expect(fish.has(c)).toBe(false);
        expect(countAround(c, fish)).toBeGreaterThanOrEqual(1);
      }
      for (const a of lake.clues) for (const b of lake.clues) if (a !== b) expect(isAdjacent(a, b)).toBe(false);
      expect(solveLake(lake)).toBeGreaterThanOrEqual(5);
      expect(lake.fish).toContain(lake.special);
    }
  });

  test("same seed gives the same lake; tournament lakes have no special fish", () => {
    expect(generateLake("daily-x", true)).toEqual(generateLake("daily-x", true));
    expect(generateLake("t-1", false).special).toBeNull();
  });

  test("solver catches all 7 on most lakes (~79%)", () => {
    let perfect = 0;
    for (let i = 0; i < 300; i++) if (solveLake(generateLake(`stat-${i}`, false)) === 7) perfect++;
    expect(perfect / 300).toBeGreaterThan(0.65);
  });
});

describe("Helper and drilling", () => {
  // Hand-built lake: fish at 0 and 2; clue at 1 shows 2.
  const lake: Lake = { fish: [0, 2, 40, 41, 42, 47, 48], clues: [1, 24, 30], special: null };

  test("a 2 with 2 caught fish marks its other neighbors; with 1 it marks nothing", () => {
    const state = { drilled: [] as number[], caught: [0], marked: [] as number[] };
    expect(runHelper(lake, state).filter((h) => NEIGHBORS[1].includes(h))).toEqual([]);
    state.caught.push(2);
    const marked = runHelper(lake, state);
    expect(marked).toEqual(expect.arrayContaining([7, 8, 9]));
    expect(marked).not.toContain(0);
  });

  test("a drilled 0 marks all its undrilled neighbors at once", () => {
    const state = { drilled: [14], caught: [] as number[], marked: [] as number[] };
    expect(countAround(14, new Set(lake.fish))).toBe(0);
    expect(runHelper(lake, state)).toEqual(expect.arrayContaining(NEIGHBORS[14].filter((n) => !lake.clues.includes(n))));
  });

  test("applyDrill rejects clues, repeats, marked and out-of-range holes", () => {
    const p = newProgress("tournament", "s", "2026-12-01", 0);
    expect(applyDrill(lake, p, 1)).toEqual({ ok: false, reason: "drilled" });
    expect(applyDrill(lake, p, 99)).toEqual({ ok: false, reason: "invalid" });
    expect(applyDrill(lake, p, 14)).toMatchObject({ ok: true, fish: false });
    expect(applyDrill(lake, p, 14)).toEqual({ ok: false, reason: "drilled" });
    const marked = p.marked[0];
    expect(applyDrill(lake, p, marked)).toEqual({ ok: false, reason: "marked" });
    expect(p.drillsLeft).toBe(DRILLS - 1);
  });

  test("the lake ends when all fish are caught; the view hides fish until then", () => {
    const p = newProgress("tournament", "s", "2026-12-01", 0);
    const before = toLakeView(lake, p, "L");
    expect(before.holes.filter((h) => h.s === "fish" || h.s === "missed")).toHaveLength(0);
    for (const f of lake.fish) applyDrill(lake, p, f);
    expect(p.finished).toBe(true);
    const after = toLakeView(lake, p, "L");
    expect(after.fishCaught).toBe(7);
    expect(before.holes).toHaveLength(HOLE_COUNT);
    // Drills were left over, but nothing on the lake is still drillable or hidden.
    expect(p.drillsLeft).toBeGreaterThan(0);
    expect(after.holes.filter((h) => h.s === "ice" || h.s === "marked")).toHaveLength(0);
    expect(after.holes.filter((h) => h.s === "num" && h.revealed)).toHaveLength(HOLE_COUNT - 7 - lake.clues.length);
  });
});
