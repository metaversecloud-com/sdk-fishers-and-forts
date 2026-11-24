/**
 * World data object: init, daily rollover, and compare-and-swap fort writes.
 *
 * Topia locks only block while they are held, so a plain fetch → compute → write can still lose an
 * update. Fort writes therefore use a lock id derived from the fort state they were computed from and
 * keep it held (`releaseLock: false`): two writers that read the same state collide, and the loser
 * re-reads and recomputes. Each lock id is used once, so a held lock never blocks a later write.
 */
import {
  DEFAULT_FORT_GOAL,
  DEFAULT_TOURNAMENT_LAKES,
  TOURNAMENT_HISTORY_DAYS,
  TOURNAMENT_HISTORY_TOP,
} from "@shared/constants.js";
import type { FortState, WorldDataObject } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, countAnalytic } from "./analytics.js";
import { rankedEntries, topProfileIds } from "./leaderboard.js";
import { standardizeError } from "./standardizeError.js";
import { clock, etDayKey, sleep } from "./time.js";
import { World } from "./topiaInit.js";

export const newFort = (fortNumber: number, now: number): FortState => ({
  fortNumber,
  variety: "castle",
  theme: "winter",
  worldSnow: 0,
  bricksPlaced: 0,
  spacing: { fromSnow: 0, fromBricks: 0 },
  milestones: {},
  builderCount: 0,
  startedAt: now,
  completedAt: null,
});

export const defaultWorldData = (now: number): WorldDataObject => ({
  fort: newFort(1, now),
  settings: { fortGoal: DEFAULT_FORT_GOAL, tournamentLakesPerDay: DEFAULT_TOURNAMENT_LAKES },
  dayKey: etDayKey(new Date(now)),
  leaderboards: { tournament: {}, dailyLake: {}, fortBuilders: {}, yesterday: null },
  tournamentHistory: {},
  fortBuildersEpoch: 0,
});

type WorldInstance = Awaited<ReturnType<typeof World.create>>;

const fetchData = async (world: WorldInstance) => {
  await world.fetchDataObject();
  return (world.dataObject || {}) as WorldDataObject;
};

/** Fill in any missing top-level keys (older data or partial init). */
const withDefaults = (data: Partial<WorldDataObject>, now: number): WorldDataObject => {
  const d = defaultWorldData(now);
  return {
    ...d,
    ...data,
    fort: { ...d.fort, ...(data.fort || {}) },
    settings: { ...d.settings, ...(data.settings || {}) },
    leaderboards: { ...d.leaderboards, ...(data.leaderboards || {}) },
  } as WorldDataObject;
};

/**
 * Close out the previous day (spec §5.4.6): freeze its boards as "yesterday", keep the tournament
 * top 10 for lazy badges, clear today's boards. Exactly once per day via a held lock keyed on the day.
 */
const rollover = async (world: WorldInstance, data: WorldDataObject, credentials: Credentials, today: string) => {
  const closedDay = data.dayKey;
  const { tournament = {}, dailyLake = {} } = data.leaderboards;

  const history = {
    ...(data.tournamentHistory || {}),
    [closedDay]: topProfileIds("tournament", tournament, TOURNAMENT_HISTORY_TOP),
  };
  const keptDays = Object.keys(history).sort().slice(-TOURNAMENT_HISTORY_DAYS);
  const tournamentHistory = Object.fromEntries(keptDays.map((k) => [k, history[k]]));

  const analytics: Analytic[] = [];
  const entered = Object.keys(tournament).length;
  if (entered > 0) {
    const topScore = rankedEntries("tournament", tournament)[0]?.values[0] || 0;
    analytics.push(countAnalytic("tournamentEnds-playersEntered", credentials, entered));
    if (topScore > 0) analytics.push(countAnalytic("tournamentEnds-topScore", credentials, topScore));
  }

  await world.updateDataObject(
    {
      "dayKey": today,
      "leaderboards.tournament": {},
      "leaderboards.dailyLake": {},
      "leaderboards.yesterday": { dayKey: closedDay, tournament, dailyLake },
      tournamentHistory,
    },
    { analytics, lock: { lockId: `ff-rollover-${credentials.urlSlug}-${today}`, releaseLock: false } },
  );
};

/** Fetch the world data object, initializing defaults and running the daily rollover if needed. */
export const getWorldData = async (credentials: Credentials) => {
  try {
    const { urlSlug } = credentials;
    const world = World.create(urlSlug, { credentials });
    const now = clock.now();
    let data = await fetchData(world);

    if (!data?.fort) {
      try {
        await world.setDataObject(withDefaults(data || {}, now), {
          lock: { lockId: `ff-world-init-${urlSlug}`, releaseLock: true },
        });
      } catch (error) {
        console.warn("getWorldData: init lock busy, re-reading", error);
        await sleep(150);
      }
      data = await fetchData(world);
    }
    data = withDefaults(data, now);

    const today = etDayKey(new Date(now));
    if (data.dayKey !== today) {
      try {
        await rollover(world, data, credentials, today);
      } catch (error) {
        // Another request already rolled the day over (lock held) — just re-read.
        await sleep(150);
      }
      data = withDefaults(await fetchData(world), now);
    }

    return { world, data };
  } catch (error) {
    throw standardizeError(error);
  }
};

export interface FortUpdate<T> {
  patch: Record<string, unknown>;
  analytics?: Analytic[];
  result: T;
}

/**
 * Compare-and-swap write to the World data object. `compute` gets the freshest data and returns the patch.
 * Retries with jitter when another writer got there first.
 */
export const updateFortCAS = async <T>({
  credentials,
  world,
  data,
  compute,
  attempts = 6,
}: {
  credentials: Credentials;
  world: WorldInstance;
  data: WorldDataObject;
  compute: (data: WorldDataObject) => FortUpdate<T>;
  attempts?: number;
}): Promise<{ data: WorldDataObject; result: T }> => {
  let current = data;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { patch, analytics, result } = compute(current);
    const { fort, settings } = current;
    const lockId = `ff-fort-${credentials.urlSlug}-${fort.fortNumber}-${fort.worldSnow}-${fort.bricksPlaced}-${settings.fortGoal}-${settings.tournamentLakesPerDay}`;
    try {
      await world.updateDataObject(patch, { analytics, lock: { lockId, releaseLock: false } });
      return { data: withDefaults(await fetchData(world), clock.now()), result };
    } catch (error) {
      lastError = error;
      await sleep(60 + Math.floor(Math.random() * 200) * (attempt + 1));
      current = withDefaults(await fetchData(world), clock.now());
    }
  }
  throw standardizeError(lastError);
};
