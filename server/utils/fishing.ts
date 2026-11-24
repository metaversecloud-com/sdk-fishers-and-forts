/**
 * Fishing drawer logic shared by the game-state and drill controllers.
 */
import { FISH_COUNT, SNOW_PERFECT_BONUS, SNOW_PER_FISH, SNOW_PER_SPECIAL_FISH } from "@shared/constants.js";
import { bricksForSnow, sectionsCrossed, toFortSummary, snowUntilNextBrick } from "@shared/fort/fort.js";
import { generateLake } from "@shared/lake/engine.js";
import { newProgress, toLakeView } from "@shared/lake/view.js";
import type {
  Lake,
  LakeKind,
  LakeProgress,
  LakeView,
  SnowBreakdown,
  TournamentSummary,
  VisitorWorldData,
  WorldDataObject,
} from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, analytic } from "./analytics.js";
import { cleanName, rankOf } from "./leaderboard.js";
import { dailySeed, tournamentSeed } from "./time.js";
import { FortUpdate } from "./world.js";

const lakeCache = new Map<string, Lake>();
/** Lakes are deterministic from their seed, so they're regenerated instead of stored. */
export const lakeFor = (progress: Pick<LakeProgress, "seed" | "kind">) => {
  const key = `${progress.kind}:${progress.seed}`;
  let lake = lakeCache.get(key);
  if (!lake) {
    lake = generateLake(progress.seed, progress.kind === "daily");
    if (lakeCache.size > 500) lakeCache.clear();
    lakeCache.set(key, lake);
  }
  return lake;
};

/** Tournament counters only count for the day they belong to. */
export const tournamentToday = (worldEntry: VisitorWorldData, today: string) =>
  worldEntry.tournament.dayKey === today
    ? worldEntry.tournament
    : { ...worldEntry.tournament, dayKey: today, lakesFinished: 0, fish: 0, reachedAt: 0 };

export const isDailyFinishedToday = (worldEntry: VisitorWorldData, today: string) =>
  Boolean(worldEntry.daily && worldEntry.daily.dayKey === today && worldEntry.daily.finished);

export const lakesLeftToday = (worldEntry: VisitorWorldData, world: WorldDataObject, today: string) => {
  const cap = world.settings.tournamentLakesPerDay;
  return cap === null ? null : Math.max(0, cap - tournamentToday(worldEntry, today).lakesFinished);
};

/**
 * Which progress record a drawer shows / a drill applies to. `isNew` = not started yet (nothing saved).
 * Tournament: the lake in progress (carries over midnight), else the next lake, or — when out of lakes —
 * the last finished one.
 */
export const resolveProgress = ({
  kind,
  worldEntry,
  world,
  credentials,
  today,
  now,
}: {
  kind: LakeKind;
  worldEntry: VisitorWorldData;
  world?: WorldDataObject; // required for tournament lakes (daily cap)
  credentials: Credentials;
  today: string;
  now: number;
}): { progress: LakeProgress; isNew: boolean; outOfLakes: boolean } => {
  if (kind === "daily") {
    const d = worldEntry.daily;
    if (d && d.dayKey === today) return { progress: d, isNew: false, outOfLakes: false };
    return { progress: newProgress("daily", dailySeed(today), today, now), isNew: true, outOfLakes: false };
  }

  const t = worldEntry.tournament;
  if (t.inProgress && !t.inProgress.finished) return { progress: t.inProgress, isNew: false, outOfLakes: false };
  const left = world ? lakesLeftToday(worldEntry, world, today) : null;
  if (left === 0) {
    const last = t.lastFinished;
    if (last) return { progress: last, isNew: false, outOfLakes: true };
  }
  const seed = tournamentSeed(credentials.profileId, credentials.urlSlug, t.started || 0);
  return { progress: newProgress("tournament", seed, today, now), isNew: true, outOfLakes: left === 0 };
};

export const lakeLabel = (
  kind: LakeKind,
  worldEntry: VisitorWorldData,
  world: WorldDataObject | undefined,
  today: string,
  progress: LakeProgress,
) => {
  if (kind === "daily") return `DAILY LAKE • ${FISH_COUNT} FISH`;
  const cap = world ? world.settings.tournamentLakesPerDay : null;
  const done = tournamentToday(worldEntry, today).lakesFinished;
  const number = progress.finished ? Math.max(done, 1) : done + 1;
  return cap === null
    ? `TOURNAMENT LAKE ${number} • ${FISH_COUNT} FISH`
    : `TOURNAMENT LAKE ${Math.min(number, cap)}/${cap} • ${FISH_COUNT} FISH`;
};

export const buildLakeView = (
  kind: LakeKind,
  progress: LakeProgress,
  worldEntry: VisitorWorldData,
  world: WorldDataObject | undefined,
  today: string,
): LakeView => {
  const view = toLakeView(lakeFor(progress), progress, lakeLabel(kind, worldEntry, world, today, progress));
  // The stored result keeps snow earned; "until the next brick" is always live.
  if (view.result && world) {
    const goal = world.settings.fortGoal;
    view.result = {
      ...view.result,
      snowUntilNextBrick: snowUntilNextBrick(world.fort, goal),
      fortComplete: world.fort.bricksPlaced >= 50,
    };
  }
  return view;
};

export const buildTournamentSummary = (
  worldEntry: VisitorWorldData,
  world: WorldDataObject,
  profileId: string,
  today: string,
  rankDelta?: number,
): TournamentSummary => {
  const t = tournamentToday(worldEntry, today);
  const lakesLeft = lakesLeftToday(worldEntry, world, today);
  const hasInProgress = Boolean(worldEntry.tournament.inProgress && !worldEntry.tournament.inProgress.finished);
  return {
    unlocked: isDailyFinishedToday(worldEntry, today),
    rank: rankOf("tournament", world.leaderboards.tournament, profileId),
    rankDelta,
    fish: t.fish,
    lakesLeft,
    lakesPerDay: world.settings.tournamentLakesPerDay,
    outOfLakes: lakesLeft === 0 && !hasInProgress,
  };
};

export const computeSnow = (lake: Lake, progress: LakeProgress): SnowBreakdown & { specialCaught: boolean } => {
  const specialCaught = lake.special !== null && progress.caught.includes(lake.special);
  const regular = progress.caught.length - (specialCaught ? 1 : 0);
  const fish = regular * SNOW_PER_FISH;
  const special = specialCaught ? SNOW_PER_SPECIAL_FISH : 0;
  const perfectBonus = progress.caught.length >= FISH_COUNT ? SNOW_PERFECT_BONUS : 0;
  return { fish, special, perfectBonus, total: fish + special + perfectBonus, specialCaught };
};

export interface FinishWorldResult {
  bricksBefore: number;
  bricksAfter: number;
  milestonesReached: string[];
  completed: boolean;
}

/**
 * The single locked world write for a finished lake: World Snow, brick count, milestones,
 * builder count and this player's leaderboard rows.
 */
export const finishLakeWorldUpdate =
  ({
    credentials,
    kind,
    progress,
    snowTotal,
    worldEntry,
    firstSnowThisFort,
    now,
  }: {
    credentials: Credentials;
    kind: LakeKind;
    progress: LakeProgress;
    snowTotal: number;
    worldEntry: VisitorWorldData; // already updated with this lake
    firstSnowThisFort: boolean;
    now: number;
  }) =>
  (world: WorldDataObject): FortUpdate<FinishWorldResult> => {
    const { profileId, displayName, username } = credentials;
    const name = cleanName(displayName || username);
    const { fort, settings } = world;
    const goal = settings.fortGoal;

    const worldSnow = fort.worldSnow + snowTotal;
    const bricksAfter = bricksForSnow(worldSnow, goal, fort.spacing, fort.bricksPlaced);
    const crossed = sectionsCrossed(fort.bricksPlaced, bricksAfter);

    const patch: Record<string, unknown> = {};
    const analytics: Analytic[] = [];
    if (snowTotal > 0) {
      patch["fort.worldSnow"] = worldSnow;
      patch[`leaderboards.fortBuilders.${profileId}`] = `${name}|${worldEntry.buildersSnow}|${worldEntry.snowAddedAt}`;
    }
    if (bricksAfter > fort.bricksPlaced) {
      patch["fort.bricksPlaced"] = bricksAfter;
      analytics.push(analytic(`${fort.variety}FortBrickPlacements`, credentials, bricksAfter - fort.bricksPlaced));
    }
    for (const section of crossed) {
      if (fort.milestones?.[section.key]) continue;
      patch[`fort.milestones.${section.key}`] = now;
      analytics.push(analytic(`${fort.variety}FortMilestoneReaches-${section.key}`, credentials));
    }
    const completed = bricksAfter >= 50 && !fort.completedAt;
    if (completed) patch["fort.completedAt"] = now;
    if (firstSnowThisFort) patch["fort.builderCount"] = (fort.builderCount || 0) + 1;

    if (kind === "daily") {
      patch[`leaderboards.dailyLake.${profileId}`] =
        `${name}|${progress.caught.length}|${progress.drillsLeft}|${progress.finishedAt}`;
    } else {
      const t = worldEntry.tournament;
      patch[`leaderboards.tournament.${profileId}`] = `${name}|${t.fish}|${t.reachedAt}`;
    }

    return {
      patch,
      analytics,
      result: {
        bricksBefore: fort.bricksPlaced,
        bricksAfter,
        milestonesReached: crossed.filter((s) => !fort.milestones?.[s.key]).map((s) => s.key),
        completed,
      },
    };
  };

export const fortSummaryOf = (world: WorldDataObject) => toFortSummary(world.fort, world.settings.fortGoal);
