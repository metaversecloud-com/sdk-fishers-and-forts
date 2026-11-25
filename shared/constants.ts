/** Puzzle settings. */
export const LAKE_SIZE = 7;
export const HOLE_COUNT = LAKE_SIZE * LAKE_SIZE;
export const FISH_COUNT = 7;
export const DRILLS = 18;
export const STARTER_CLUES = 3;
/** A generated lake is kept only if the solver catches at least this many fish. */
export const SOLVER_MIN_FISH = 5;

/** Snow values. */
export const SNOW_PER_FISH = 1;
export const SNOW_PER_SPECIAL_FISH = 5;
export const SNOW_PERFECT_BONUS = 3;

/** Admin setting options. */
export const FORT_GOAL_OPTIONS = [1000, 10000, 30000, 50000, 100000] as const;
export const DEFAULT_FORT_GOAL = 30000;
export const TOURNAMENT_LAKE_OPTIONS = [5, 10, 20, null] as const;
export const DEFAULT_TOURNAMENT_LAKES = 10;

/** Leaderboards show this many rows (+ the player's own row). */
export const LEADERBOARD_ROWS = 25;
/** Tournament top-N kept per closed day for lazy badge awards. */
export const TOURNAMENT_HISTORY_TOP = 10;
export const TOURNAMENT_HISTORY_DAYS = 14;

/** Today's special fish name (v1 shows a single special fish; the 10-fish rotation is stretch). */
export const SPECIAL_FISH_NAME = "Rainbow Trout";

/** Unique names of the assets in the scene. Drawers are chosen by path route, not unique name. */
export const UNIQUE_NAMES = {
  keyAsset: "Fishers&Forts_keyAsset",
  fort: "Fishers&Forts_fort",
  fortBlockPrefix: "Fishers&Forts_fortBlock_",
} as const;

/** Particle played on each newly placed brick. TODO(art): confirm the particle name with Shelby. */
export const BRICK_PARTICLE_NAME = "Sparkle";
