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
  VisitorSceneData,
  SceneDataObject,
} from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, analytic } from "./analytics.js";
import { cleanName, rankOf } from "./leaderboard.js";
import { dailySeed, tournamentSeed } from "./time.js";
import { FortUpdate, sceneKey } from "./sceneData.js";

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
export const tournamentToday = (sceneEntry: VisitorSceneData, today: string) =>
  sceneEntry.tournament.dayKey === today
    ? sceneEntry.tournament
    : { ...sceneEntry.tournament, dayKey: today, lakesFinished: 0, fish: 0, reachedAt: 0 };

export const isDailyFinishedToday = (sceneEntry: VisitorSceneData, today: string) =>
  Boolean(sceneEntry.daily && sceneEntry.daily.dayKey === today && sceneEntry.daily.finished);

export const lakesLeftToday = (sceneEntry: VisitorSceneData, world: SceneDataObject, today: string) => {
  const cap = world.settings.tournamentLakesPerDay;
  return cap === null ? null : Math.max(0, cap - tournamentToday(sceneEntry, today).lakesFinished);
};

/**
 * Which progress record a drawer shows / a drill applies to. `isNew` = not started yet (nothing saved).
 * Tournament: the lake in progress (carries over midnight), else the next lake, or — when out of lakes —
 * the last finished one.
 */
export const resolveProgress = ({
  kind,
  sceneEntry,
  world,
  credentials,
  today,
  now,
}: {
  kind: LakeKind;
  sceneEntry: VisitorSceneData;
  world?: SceneDataObject; // required for tournament lakes (daily cap)
  credentials: Credentials;
  today: string;
  now: number;
}): { progress: LakeProgress; isNew: boolean; outOfLakes: boolean } => {
  if (kind === "daily") {
    const d = sceneEntry.daily;
    if (d && d.dayKey === today) return { progress: d, isNew: false, outOfLakes: false };
    return { progress: newProgress("daily", dailySeed(today), today, now), isNew: true, outOfLakes: false };
  }

  const t = sceneEntry.tournament;
  if (t.inProgress && !t.inProgress.finished) return { progress: t.inProgress, isNew: false, outOfLakes: false };
  const left = world ? lakesLeftToday(sceneEntry, world, today) : null;
  if (left === 0) {
    const last = t.lastFinished;
    if (last) return { progress: last, isNew: false, outOfLakes: true };
  }
  const seed = tournamentSeed(credentials.profileId, sceneKey(credentials), t.started || 0);
  return { progress: newProgress("tournament", seed, today, now), isNew: true, outOfLakes: left === 0 };
};

export const lakeLabel = (
  kind: LakeKind,
  sceneEntry: VisitorSceneData,
  world: SceneDataObject | undefined,
  today: string,
  progress: LakeProgress,
) => {
  if (kind === "daily") return `DAILY LAKE • ${FISH_COUNT} FISH`;
  const cap = world ? world.settings.tournamentLakesPerDay : null;
  const done = tournamentToday(sceneEntry, today).lakesFinished;
  const number = progress.finished ? Math.max(done, 1) : done + 1;
  return cap === null
    ? `TOURNAMENT LAKE ${number} • ${FISH_COUNT} FISH`
    : `TOURNAMENT LAKE ${Math.min(number, cap)}/${cap} • ${FISH_COUNT} FISH`;
};

export const buildLakeView = (
  kind: LakeKind,
  progress: LakeProgress,
  sceneEntry: VisitorSceneData,
  world: SceneDataObject | undefined,
  today: string,
): LakeView => {
  const view = toLakeView(lakeFor(progress), progress, lakeLabel(kind, sceneEntry, world, today, progress));
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
  sceneEntry: VisitorSceneData,
  world: SceneDataObject,
  profileId: string,
  today: string,
  rankDelta?: number,
): TournamentSummary => {
  const t = tournamentToday(sceneEntry, today);
  const lakesLeft = lakesLeftToday(sceneEntry, world, today);
  const hasInProgress = Boolean(sceneEntry.tournament.inProgress && !sceneEntry.tournament.inProgress.finished);
  return {
    unlocked: isDailyFinishedToday(sceneEntry, today),
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
    sceneEntry,
    firstSnowThisFort,
    now,
  }: {
    credentials: Credentials;
    kind: LakeKind;
    progress: LakeProgress;
    snowTotal: number;
    sceneEntry: VisitorSceneData; // already updated with this lake
    firstSnowThisFort: boolean;
    now: number;
  }) =>
  (world: SceneDataObject): FortUpdate<FinishWorldResult> => {
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
      patch[`leaderboards.fortBuilders.${profileId}`] = `${name}|${sceneEntry.buildersSnow}|${sceneEntry.snowAddedAt}`;
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
      const t = sceneEntry.tournament;
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

export const fortSummaryOf = (world: SceneDataObject) => toFortSummary(world.fort, world.settings.fortGoal);
