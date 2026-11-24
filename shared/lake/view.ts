import { DRILLS, FISH_COUNT, HOLE_COUNT } from "../constants.js";
import type { HoleView, Lake, LakeKind, LakeProgress, LakeView } from "../types/index.js";
import { countAround } from "./engine.js";

/** A fresh, unstarted progress record for a lake. */
export const newProgress = (kind: LakeKind, seed: string, dayKey: string, now: number): LakeProgress => ({
  kind,
  seed,
  dayKey,
  drilled: [],
  caught: [],
  marked: [],
  drillsLeft: DRILLS,
  finished: false,
  startedAt: now,
});

/** Build the client-safe view. Fish positions are only included once the lake is finished. */
export const toLakeView = (lake: Lake, progress: LakeProgress, label: string): LakeView => {
  const fishSet = new Set(lake.fish);
  const drilled = new Set(progress.drilled);
  const caught = new Set(progress.caught);
  const marked = new Set(progress.marked);
  const clues = new Set(lake.clues);

  const holes: HoleView[] = Array.from({ length: HOLE_COUNT }, (_, i) => {
    if (caught.has(i)) return lake.special === i ? { s: "fish", special: true } : { s: "fish" };
    if (clues.has(i)) return { s: "num", n: countAround(i, fishSet), clue: true };
    if (drilled.has(i)) return { s: "num", n: countAround(i, fishSet) };
    if (progress.finished && fishSet.has(i)) return { s: "missed" };
    if (marked.has(i)) return { s: "marked" };
    return { s: "ice" };
  });

  return {
    kind: progress.kind,
    label,
    holes,
    drillsLeft: progress.drillsLeft,
    drillsTotal: DRILLS,
    fishCaught: progress.caught.length,
    fishTotal: FISH_COUNT,
    finished: progress.finished,
    result: progress.result,
  };
};
