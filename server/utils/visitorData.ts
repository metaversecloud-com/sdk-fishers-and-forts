/**
 * The player's Visitor/User record (same backing record). Lifetime totals and the badge cache are
 * top-level keys; this scene's state lives under `${urlSlug}-${sceneDropId}` (see `sceneKey`).
 */
import { VisitorInterface } from "@rtsdk/topia";
import type { VisitorDataObject, VisitorLifetime, VisitorSceneData } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { standardizeError } from "./standardizeError.js";
import { sceneKey } from "./sceneData.js";
import { sleep } from "./time.js";
import { Visitor } from "./topiaInit.js";

export const defaultLifetime = (): VisitorLifetime => ({
  fishCaught: 0,
  lakesFinished: 0,
  perfectLakes: 0,
  dailyLakesFinished: 0,
  specialFishCaught: 0,
  tournamentLakesFinished: 0,
});

export const defaultSceneEntry = (): VisitorSceneData => ({
  snowAdded: 0,
  snowAddedAt: 0,
  fortNumber: 0,
  snowThisFort: 0,
  buildersEpoch: 0,
  buildersSnow: 0,
  daily: null,
  tournament: { dayKey: "", lakesFinished: 0, fish: 0, reachedAt: 0, started: 0, inProgress: null, lastFinished: null },
});

export type VisitorInstance = VisitorInterface;

const read = async (visitor: VisitorInstance) => ((await visitor.fetchDataObject()) || {}) as VisitorDataObject;

/**
 * Load the visitor and make sure the record has its defaults before any update (rules.md: data-object pattern).
 * `withDetails` uses Visitor.get (needed for `isAdmin`).
 */
export const getVisitorData = async (credentials: Credentials, withDetails = false) => {
  try {
    const { urlSlug, visitorId, profileId } = credentials;
    const key = sceneKey(credentials);
    const visitor = (
      withDetails
        ? await Visitor.get(visitorId, urlSlug, { credentials })
        : await Visitor.create(visitorId, urlSlug, { credentials })
    ) as VisitorInstance;
    if (!visitor) throw "Not in world";

    let data = await read(visitor);
    const isEmpty = !data || Object.keys(data).length === 0;
    const needsScene = !data?.[key];
    const needsLifetime = !data?.lifetime;

    if (isEmpty || needsScene || needsLifetime) {
      const lock = { lockId: `ff-visitor-init-${profileId}-${key}`, releaseLock: true };
      try {
        if (isEmpty) {
          await visitor.setDataObject(
            { lifetime: defaultLifetime(), badges: {}, [key]: defaultSceneEntry() },
            { lock },
          );
        } else {
          const patch: Record<string, unknown> = {};
          if (needsScene) patch[key] = defaultSceneEntry();
          if (needsLifetime) patch.lifetime = defaultLifetime();
          if (!data.badges) patch.badges = {};
          await visitor.updateDataObject(patch, { lock });
        }
      } catch (error) {
        console.warn("getVisitorData: init lock busy, re-reading", error);
        await sleep(150);
      }
      data = await read(visitor);
    }

    const lifetime = { ...defaultLifetime(), ...(data.lifetime as VisitorLifetime) };
    const base = defaultSceneEntry();
    const stored = (data[key] || {}) as Partial<VisitorSceneData>;
    const sceneEntry: VisitorSceneData = {
      ...base,
      ...stored,
      tournament: { ...base.tournament, ...(stored.tournament || {}) },
    };
    const badgeCache = (data.badges || {}) as Record<string, number>;

    return { visitor, data, lifetime, sceneEntry, badgeCache };
  } catch (error) {
    throw standardizeError(error);
  }
};
