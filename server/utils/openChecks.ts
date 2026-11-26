/**
 * Runs once per drawer open: lazy badge awards (milestones, tournament finishes, and any
 * badge whose grant failed earlier), the "you finished #4 yesterday" toast, and the open analytics —
 * all recorded in ONE visitor write.
 */
import type { VisitorLifetime, VisitorSceneData, SceneDataObject } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, analytic } from "./analytics.js";
import { awardBadges, pendingBadges } from "./badges.js";
import { rankOf } from "./leaderboard.js";
import { clock, etDayKey } from "./time.js";
import type { VisitorInstance } from "./visitorData.js";

/** Best tournament finish among closed days the player hasn't been checked for. */
const bestUncheckedTournamentRank = (
  world: SceneDataObject,
  sceneEntry: VisitorSceneData,
  profileId: string,
  today: string,
) => {
  const since = sceneEntry.lastSeenDay || "";
  let best: number | null = null;
  for (const [dayKey, top] of Object.entries(world.tournamentHistory || {})) {
    if (dayKey < since || dayKey >= today) continue;
    const idx = top.indexOf(profileId);
    if (idx >= 0 && (best === null || idx + 1 < best)) best = idx + 1;
  }
  return best;
};

export const runOpenChecks = async ({
  credentials,
  visitor,
  lifetime,
  sceneEntry,
  badgeCache,
  world,
  openAnalytics,
}: {
  credentials: Credentials;
  visitor: VisitorInstance;
  lifetime: VisitorLifetime;
  sceneEntry: VisitorSceneData;
  badgeCache: Record<string, number>;
  world: SceneDataObject;
  openAnalytics: string[];
}) => {
  const { profileId, urlSlug } = credentials;
  const now = clock.now();
  const today = etDayKey(new Date(now));
  const firstOpenToday = sceneEntry.lastSeenDay !== today;

  const tournamentBestRank = firstOpenToday ? bestUncheckedTournamentRank(world, sceneEntry, profileId, today) : null;
  const names = pendingBadges({ lifetime, sceneEntry, world, profileId, tournamentBestRank }, badgeCache);
  const { record, analytics: badgeAnalytics } = await awardBadges({ credentials, visitor, names });

  // Yesterday's tournament finish toast (player only, first open of the day).
  const yesterday = world.leaderboards.yesterday;
  if (
    firstOpenToday &&
    yesterday &&
    sceneEntry.tournament.dayKey === yesterday.dayKey &&
    sceneEntry.tournament.lakesFinished > 0
  ) {
    const rank = rankOf("tournament", yesterday.tournament, profileId);
    if (rank) {
      visitor
        .fireToast({ title: "Fishing Tournament", text: `You finished #${rank} in yesterday's Fishing Tournament!` })
        .catch(() => console.error("Failed to fire yesterday's tournament toast"));
    }
  }

  const patch: Record<string, unknown> = { [`${urlSlug}.lastOpenAt`]: now, [`${urlSlug}.lastSeenDay`]: today };
  for (const name of record) patch[`badges.${name}`] = now;
  const analytics: Analytic[] = [...openAnalytics.map((name) => analytic(name, credentials)), ...badgeAnalytics];

  await visitor
    .updateDataObject(patch, { analytics })
    .catch((error: unknown) => console.error("runOpenChecks: write failed", error));
};
