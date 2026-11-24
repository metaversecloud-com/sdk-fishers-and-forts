/**
 * The puzzle engine (spec §4). Pure TypeScript, no SDK dependencies.
 *
 * - generateLake: steps 1–4 (place fish, pick starter clues, test with the solver, pick the special fish).
 * - solveLake: the deterministic "careful player" (solver steps A–F).
 * - applyDrill / runHelper: the rules a real player plays by.
 */
import { DRILLS, FISH_COUNT, HOLE_COUNT, SOLVER_MIN_FISH, STARTER_CLUES } from "../constants.js";
import type { Lake } from "../types/index.js";
import { NEIGHBORS, isAdjacent } from "./grid.js";
import { seededRng, shuffle } from "./rng.js";

const ALL_HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i);

/** How many fish are in the holes around `hole`. */
export const countAround = (hole: number, fish: Set<number>) => NEIGHBORS[hole].filter((n) => fish.has(n)).length;

/** Steps 1–2 for a single try. Returns null when 3 valid starter clues can't be found. */
const tryBuild = (rng: () => number): { fish: number[]; clues: number[] } | null => {
  const fish = shuffle(ALL_HOLES, rng).slice(0, FISH_COUNT);
  const fishSet = new Set(fish);
  const candidates = shuffle(
    ALL_HOLES.filter((h) => !fishSet.has(h) && countAround(h, fishSet) >= 1),
    rng,
  );
  const clues: number[] = [];
  for (const h of candidates) {
    if (clues.every((c) => !isAdjacent(c, h))) clues.push(h);
    if (clues.length === STARTER_CLUES) break;
  }
  if (clues.length < STARTER_CLUES) return null;
  return { fish: fish.sort((a, b) => a - b), clues: clues.sort((a, b) => a - b) };
};

/**
 * Generate a lake from a seed. Each try uses `${seed}#${try}`, so the same seed always gives the same lake.
 * Daily lakes get a special fish; tournament lakes don't.
 */
export const generateLake = (seed: string, withSpecial: boolean): Lake => {
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = seededRng(`${seed}#${attempt}`);
    const built = tryBuild(rng);
    if (!built) continue;
    const lake: Lake = { fish: built.fish, clues: built.clues, special: null };
    if (solveLake(lake) < SOLVER_MIN_FISH) continue;
    if (withSpecial) lake.special = built.fish[Math.floor(rng() * built.fish.length)];
    return lake;
  }
  // Practically unreachable (the spec's 2,000-lake test never rejected a lake at ≥5).
  throw new Error(`Could not generate a lake for seed ${seed}`);
};

/**
 * The Helper (spec §4.3): every number whose caught neighbors equal the number marks its undrilled
 * neighbors empty. Never combines numbers, never reveals fish. One pass is enough.
 * Returns the newly marked holes in reading order.
 */
export const runHelper = (
  lake: Lake,
  state: { drilled: number[]; caught: number[]; marked: number[] },
): number[] => {
  const fishSet = new Set(lake.fish);
  const caught = new Set(state.caught);
  const opened = new Set([...lake.clues, ...state.drilled, ...state.caught]);
  const marked = new Set(state.marked);
  const numbers = [...lake.clues, ...state.drilled];
  const newly = new Set<number>();

  for (const h of numbers) {
    const n = countAround(h, fishSet);
    const caughtAround = NEIGHBORS[h].filter((x) => caught.has(x)).length;
    if (caughtAround !== n) continue;
    for (const nb of NEIGHBORS[h]) {
      if (!opened.has(nb) && !marked.has(nb)) newly.add(nb);
    }
  }
  return [...newly].sort((a, b) => a - b);
};

export type DrillOutcome =
  | { ok: false; reason: "finished" | "invalid" | "drilled" | "marked" }
  | { ok: true; fish: boolean; newlyMarked: number[]; finished: boolean };

/** Apply a player's drill to the progress (mutates `state`). */
export const applyDrill = (
  lake: Lake,
  state: { drilled: number[]; caught: number[]; marked: number[]; drillsLeft: number; finished: boolean },
  hole: number,
): DrillOutcome => {
  if (state.finished) return { ok: false, reason: "finished" };
  if (!Number.isInteger(hole) || hole < 0 || hole >= HOLE_COUNT) return { ok: false, reason: "invalid" };
  if (lake.clues.includes(hole) || state.drilled.includes(hole) || state.caught.includes(hole))
    return { ok: false, reason: "drilled" };
  if (state.marked.includes(hole)) return { ok: false, reason: "marked" };

  const fish = lake.fish.includes(hole);
  state.drillsLeft -= 1;
  if (fish) state.caught.push(hole);
  else state.drilled.push(hole);

  const newlyMarked = runHelper(lake, state);
  state.marked.push(...newlyMarked);

  state.finished = state.drillsLeft <= 0 || state.caught.length >= lake.fish.length;
  return { ok: true, fish, newlyMarked, finished: state.finished };
};

/**
 * The solver (spec §4, steps A–F). Sees only what a player sees, with 18 drills and the Helper on.
 * Returns how many fish it caught (guesses included).
 */
export const solveLake = (lake: Lake): number => {
  const fishSet = new Set(lake.fish);
  const numbers = new Set<number>(lake.clues); // revealed numbers
  const caught = new Set<number>();
  const knownEmpty = new Set<number>();
  let drills = DRILLS;

  const isOpen = (h: number) => !numbers.has(h) && !caught.has(h) && !knownEmpty.has(h);

  const drill = (h: number) => {
    drills--;
    if (fishSet.has(h)) caught.add(h);
    else numbers.add(h);
  };

  type Info = { open: number[]; need: number };
  const readNumbers = (): Info[] =>
    [...numbers]
      .sort((a, b) => a - b)
      .map((h) => {
        const n = countAround(h, fishSet);
        const caughtAround = NEIGHBORS[h].filter((x) => caught.has(x)).length;
        return { open: NEIGHBORS[h].filter(isOpen), need: n - caughtAround };
      });

  while (drills > 0 && caught.size < lake.fish.length) {
    let certainFish: number | null = null;

    // Steps A–E: deduce until nothing new is learned or a certain fish is found.
    let learned = true;
    while (learned && certainFish === null) {
      learned = false;
      const infos = readNumbers(); // A

      for (const { open, need } of infos) {
        if (need === 0 && open.length) {
          open.forEach((h) => knownEmpty.add(h)); // B
          learned = true;
        } else if (need > 0 && need === open.length) {
          certainFish = open[0]; // C
          break;
        }
      }
      if (learned || certainFish !== null) continue;

      // D: two numbers together.
      outer: for (const a of infos) {
        if (!a.open.length) continue;
        for (const b of infos) {
          if (a === b || b.open.length <= a.open.length) continue;
          if (!a.open.every((h) => b.open.includes(h))) continue;
          const extra = b.open.filter((h) => !a.open.includes(h));
          const diff = b.need - a.need;
          if (diff === 0) {
            extra.forEach((h) => knownEmpty.add(h));
            learned = true;
            break outer;
          }
          if (diff === extra.length) {
            certainFish = extra[0];
            break outer;
          }
        }
      }
    }

    if (certainFish !== null) {
      drill(certainFish);
      continue;
    }

    // F: best guess.
    const unknown = ALL_HOLES.filter(isOpen);
    if (!unknown.length) break;
    const infos = readNumbers();
    const fishLeft = lake.fish.length - caught.size;
    const baseline = fishLeft / unknown.length;
    let best = unknown[0];
    let bestP = -1;
    for (const h of unknown) {
      let p = -1;
      for (const info of infos) {
        if (info.open.includes(h) && info.open.length) p = Math.max(p, info.need / info.open.length);
      }
      if (p < 0) p = baseline;
      if (p > bestP) {
        bestP = p;
        best = h;
      }
    }
    drill(best);
  }

  return caught.size;
};
