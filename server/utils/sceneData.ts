/**
 * Scene data: everything one Fishers & Forts instance shares (fort, settings, leaderboards, daily
 * rollover) lives in the data object of that scene's key asset (`Fishers&Forts_keyAsset`). Two scenes in
 * one world act independently, and removing a scene removes its data with it.
 *
 * Every asset in a scene drop shares a `sceneDropId`, so any drawer (Fishing, Fort, Trophy) finds the
 * key asset with one lookup.
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
  UNIQUE_NAMES,
} from "@shared/constants.js";
import type { FortState, SceneDataObject } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, countAnalytic } from "./analytics.js";
import { rankedEntries, topProfileIds } from "./leaderboard.js";
import { standardizeError } from "./standardizeError.js";
import { clock, etDayKey, sleep } from "./time.js";
import { World } from "./topiaInit.js";

/** The scene drop this request came from. Every instance is a scene drop, so a missing id is a setup error. */
export const requireSceneDropId = (credentials: Credentials) => {
  const { sceneDropId } = credentials;
  if (!sceneDropId || sceneDropId === "undefined" || sceneDropId === "null") {
    throw Object.assign(new Error("Fishers & Forts must be placed as a scene."), { status: 400 });
  }
  return sceneDropId;
};

/** Key for this instance's state in the player's record: `${urlSlug}-${sceneDropId}`. */
export const sceneKey = (credentials: Credentials) => `${credentials.urlSlug}-${requireSceneDropId(credentials)}`;

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

export const defaultSceneData = (now: number): SceneDataObject => ({
  fort: newFort(1, now),
  settings: { fortGoal: DEFAULT_FORT_GOAL, tournamentLakesPerDay: DEFAULT_TOURNAMENT_LAKES },
  dayKey: etDayKey(new Date(now)),
  leaderboards: { tournament: {}, dailyLake: {}, fortBuilders: {}, yesterday: null },
  tournamentHistory: {},
  fortBuildersEpoch: 0,
});

type WorldInstance = Awaited<ReturnType<typeof World.create>>;
type KeyAsset = Awaited<ReturnType<WorldInstance["fetchDroppedAssetsBySceneDropId"]>>[number];

/**
 * This scene's key asset, which holds the scene data. Matched by name here rather than with the
 * `uniqueName` filter: the SDK puts that filter in the query string unencoded, so the `&` in
 * `Fishers&Forts_keyAsset` splits it and the API matches nothing.
 */
const getKeyAsset = async (world: WorldInstance, sceneDropId: string): Promise<KeyAsset> => {
  const assets = await world.fetchDroppedAssetsBySceneDropId({ sceneDropId });
  const keyAsset = (assets || []).find((a: any) => a?.uniqueName === UNIQUE_NAMES.keyAsset);
  if (!keyAsset) {
    throw Object.assign(new Error(`This scene has no ${UNIQUE_NAMES.keyAsset} asset.`), { status: 404 });
  }
  return keyAsset;
};

const fetchData = async (keyAsset: KeyAsset) => {
  await keyAsset.fetchDataObject();
  return (keyAsset.dataObject || {}) as SceneDataObject;
};

/** Fill in any missing top-level keys (older data or partial init). */
const withDefaults = (data: Partial<SceneDataObject>, now: number): SceneDataObject => {
  const d = defaultSceneData(now);
  return {
    ...d,
    ...data,
    fort: { ...d.fort, ...(data.fort || {}) },
    settings: { ...d.settings, ...(data.settings || {}) },
    leaderboards: { ...d.leaderboards, ...(data.leaderboards || {}) },
  } as SceneDataObject;
};

/**
 * Close out the previous day: freeze its boards as "yesterday", keep the tournament
 * top 10 for lazy badges, clear today's boards. Exactly once per day via a held lock keyed on the day.
 */
const rollover = async (
  keyAsset: KeyAsset,
  data: SceneDataObject,
  credentials: Credentials,
  sceneDropId: string,
  today: string,
) => {
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

  await keyAsset.updateDataObject(
    {
      "dayKey": today,
      "leaderboards.tournament": {},
      "leaderboards.dailyLake": {},
      "leaderboards.yesterday": { dayKey: closedDay, tournament, dailyLake },
      tournamentHistory,
    },
    { analytics, lock: { lockId: `ff-rollover-${sceneDropId}-${today}`, releaseLock: false } },
  );
};

/**
 * Fetch this scene's data, initializing defaults and running the daily rollover if needed.
 * `world` is for world-level effects (toasts, particles, fort piece lookups); `keyAsset` holds the data.
 */
export const getSceneData = async (credentials: Credentials) => {
  try {
    const sceneDropId = requireSceneDropId(credentials);
    const world = World.create(credentials.urlSlug, { credentials });
    const keyAsset = await getKeyAsset(world, sceneDropId);
    const now = clock.now();
    let data = await fetchData(keyAsset);

    if (!data?.fort) {
      try {
        await keyAsset.setDataObject(withDefaults(data || {}, now), {
          lock: { lockId: `ff-scene-init-${sceneDropId}`, releaseLock: true },
        });
      } catch (error) {
        console.warn("getSceneData: init lock busy, re-reading", error);
        await sleep(150);
      }
      data = await fetchData(keyAsset);
    }
    data = withDefaults(data, now);

    const today = etDayKey(new Date(now));
    if (data.dayKey !== today) {
      try {
        await rollover(keyAsset, data, credentials, sceneDropId, today);
      } catch (error) {
        // Another request already rolled the day over (lock held) — just re-read.
        await sleep(150);
      }
      data = withDefaults(await fetchData(keyAsset), now);
    }

    return { world, keyAsset, sceneDropId, data };
  } catch (error) {
    throw standardizeError(error);
  }
};

export type SceneContext = Awaited<ReturnType<typeof getSceneData>>;

export interface FortUpdate<T> {
  patch: Record<string, unknown>;
  analytics?: Analytic[];
  result: T;
}

/**
 * Compare-and-swap write to the scene data. `compute` gets the freshest data and returns the patch.
 * Retries with jitter when another writer got there first.
 */
export const updateFortCAS = async <T>({
  scene,
  data,
  compute,
  attempts = 6,
}: {
  scene: SceneContext;
  data: SceneDataObject;
  compute: (data: SceneDataObject) => FortUpdate<T>;
  attempts?: number;
}): Promise<{ data: SceneDataObject; result: T }> => {
  const { keyAsset, sceneDropId } = scene;
  let current = data;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { patch, analytics, result } = compute(current);
    const { fort, settings } = current;
    const lockId = `ff-fort-${sceneDropId}-${fort.fortNumber}-${fort.worldSnow}-${fort.bricksPlaced}-${settings.fortGoal}-${settings.tournamentLakesPerDay}`;
    try {
      await keyAsset.updateDataObject(patch, { analytics, lock: { lockId, releaseLock: false } });
      return { data: withDefaults(await fetchData(keyAsset), clock.now()), result };
    } catch (error) {
      lastError = error;
      await sleep(60 + Math.floor(Math.random() * 200) * (attempt + 1));
      current = withDefaults(await fetchData(keyAsset), clock.now());
    }
  }
  throw standardizeError(lastError);
};
