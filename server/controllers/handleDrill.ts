import { Request, Response } from "express";
import { FISH_COUNT, SPECIAL_FISH_NAME } from "@shared/constants.js";
import { snowUntilNextBrick } from "@shared/fort/fort.js";
import { applyDrill } from "@shared/lake/engine.js";
import type { DrillResponse, LakeKind, LakeProgress, VisitorSceneData, SceneDataObject } from "@shared/types/index.js";
import {
  Analytic,
  analytic,
  awardBadges,
  buildLakeView,
  buildTournamentSummary,
  clock,
  computeSnow,
  errorHandler,
  etDayKey,
  finishLakeWorldUpdate,
  fireMilestoneToasts,
  fortSummaryOf,
  getCredentials,
  getVisitorData,
  getSceneData,
  isDailyFinishedToday,
  lakeFor,
  pendingBadges,
  rankOf,
  reconcileFortPieces,
  resolveProgress,
  SceneContext,
  sceneKey,
  tournamentToday,
  updateFortCAS,
} from "../utils/index.js";

const REJECT_MESSAGES: Record<string, string> = {
  finished: "This lake is finished.",
  invalid: "That hole doesn't exist.",
  drilled: "That hole is already drilled.",
  marked: "That hole is marked empty.",
};

/**
 * POST /api/lake/drill { kind, hole } — server-authoritative drilling.
 * Fish positions never leave the server until the lake ends.
 */
export const handleDrill = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { profileId } = credentials;
    const key = sceneKey(credentials);
    const kind: LakeKind = req.body?.kind === "tournament" ? "tournament" : "daily";
    const hole = Number(req.body?.hole);
    const now = clock.now();
    const today = etDayKey(new Date(now));

    const { visitor, lifetime, sceneEntry, badgeCache } = await getVisitorData(credentials);

    let scene: SceneContext | undefined;
    let world: SceneDataObject | undefined;
    const loadWorld = async () => {
      if (!scene) {
        scene = await getSceneData(credentials);
        world = scene.data;
      }
      return scene;
    };

    if (kind === "tournament") {
      if (!isDailyFinishedToday(sceneEntry, today))
        return res.status(400).json({ success: false, message: "Finish today's Daily Lake first." });
      await loadWorld();
    }

    const { progress, isNew, outOfLakes } = resolveProgress({ kind, sceneEntry, world, credentials, today, now });
    if (kind === "tournament" && isNew && outOfLakes) {
      return res.status(400).json({ success: false, message: "You've fished all your tournament lakes today." });
    }

    const state: LakeProgress = structuredClone(progress);
    const lake = lakeFor(state);
    const outcome = applyDrill(lake, state, hole);
    if (!outcome.ok) return res.status(400).json({ success: false, message: REJECT_MESSAGES[outcome.reason] });

    const caughtSpecial = outcome.fish && lake.special === hole;
    if (caughtSpecial) {
      visitor
        .fireToast({ title: "Special catch!", text: `Special catch! You caught today's ${SPECIAL_FISH_NAME}.` })
        .catch(() => console.error("Failed to fire special catch toast"));
    }

    const entry: VisitorSceneData = structuredClone(sceneEntry);
    const analytics: Analytic[] = [];
    if (isNew) {
      analytics.push(analytic(`lakeStarts-${kind}`, credentials));
      if (kind === "tournament") entry.tournament.started = (entry.tournament.started || 0) + 1;
    }

    // Compare-and-swap on this player's own lake: a double tap that raced is rejected, not double-counted.
    const drillLock = {
      lockId: `ff-drill-${profileId}-${key}-${kind}-${state.seed}-${progress.drilled.length + progress.caught.length}`,
      releaseLock: false,
    };

    // ───────── Mid-lake: save progress only ─────────
    if (!outcome.finished) {
      let patch: Record<string, unknown>;
      if (kind === "daily") patch = { [`${key}.daily`]: state };
      else patch = { [`${key}.tournament`]: { ...entry.tournament, inProgress: state } };
      try {
        await visitor.updateDataObject(patch, { analytics, lock: drillLock });
      } catch (error) {
        return res.status(409).json({ success: false, message: "Still drilling, try again." });
      }
      entry.daily = kind === "daily" ? state : entry.daily;
      const data: DrillResponse = {
        lake: buildLakeView(kind, state, entry, world, today),
        newlyMarked: outcome.newlyMarked,
        caughtFish: outcome.fish,
        caughtSpecial,
        justFinished: false,
        addedBrick: false,
      };
      return res.json({ success: true, data });
    }

    // ───────── Lake finished ─────────
    const loaded = await loadWorld();
    const worldBefore = loaded.data;
    const snow = computeSnow(lake, state);
    const caught = state.caught.length;
    const perfect = caught >= FISH_COUNT;
    state.finishedAt = now;
    state.result = {
      fishCaught: caught,
      perfect,
      specialCaught: kind === "daily" ? snow.specialCaught : null,
      snow: { fish: snow.fish, special: snow.special, perfectBonus: snow.perfectBonus, total: snow.total },
      snowUntilNextBrick: snowUntilNextBrick(worldBefore.fort, worldBefore.settings.fortGoal),
      fortComplete: worldBefore.fort.bricksPlaced >= 50,
    };

    // Lifetime totals (follow the player across worlds).
    const nextLifetime = { ...lifetime };
    nextLifetime.fishCaught += caught;
    nextLifetime.lakesFinished += 1;
    if (perfect) nextLifetime.perfectLakes += 1;
    if (kind === "daily") {
      nextLifetime.dailyLakesFinished += 1;
      if (snow.specialCaught) nextLifetime.specialFishCaught += 1;
    } else {
      nextLifetime.tournamentLakesFinished += 1;
    }

    // This world's contribution.
    if (entry.fortNumber !== worldBefore.fort.fortNumber) {
      entry.fortNumber = worldBefore.fort.fortNumber;
      entry.snowThisFort = 0;
    }
    if (entry.buildersEpoch !== (worldBefore.fortBuildersEpoch || 0)) {
      entry.buildersEpoch = worldBefore.fortBuildersEpoch || 0;
      entry.buildersSnow = 0;
    }
    const firstSnowThisFort = entry.snowThisFort === 0 && snow.total > 0;
    if (snow.total > 0) {
      entry.snowThisFort += snow.total;
      entry.buildersSnow += snow.total;
      entry.snowAdded += snow.total;
      entry.snowAddedAt = now;
    }

    const prevTournamentRank = rankOf("tournament", worldBefore.leaderboards.tournament, profileId);
    if (kind === "daily") {
      entry.daily = state;
    } else {
      const t = { ...tournamentToday(entry, today), started: entry.tournament.started };
      t.lakesFinished += 1;
      if (caught > 0) {
        t.fish += caught;
        t.reachedAt = now;
      }
      entry.tournament = { ...t, inProgress: null, lastFinished: state };
    }

    // Badges earned by this lake (milestone badges for a first-time helper included).
    const names = pendingBadges(
      { lifetime: nextLifetime, sceneEntry: entry, world: worldBefore, profileId },
      badgeCache,
    );
    const { record, analytics: badgeAnalytics } = await awardBadges({ credentials, visitor, names });

    analytics.push(analytic(`lakeFinishes-${kind}`, credentials));
    analytics.push(analytic(`lakeFinishes-${FISH_COUNT - caught}fishLeft`, credentials));
    if (snow.specialCaught) analytics.push(analytic("specialCatches", credentials));
    analytics.push(...badgeAnalytics);

    const visitorPatch: Record<string, unknown> = { [key]: entry, lifetime: nextLifetime };
    for (const name of record) visitorPatch[`badges.${name}`] = now;
    try {
      await visitor.updateDataObject(visitorPatch, { analytics, lock: drillLock });
    } catch (error) {
      return res.status(409).json({ success: false, message: "Still drilling, try again." });
    }

    // One locked world write: snow, bricks, milestones, leaderboards.
    let worldAfter = worldBefore;
    let addedBrick = false;
    try {
      const { data, result } = await updateFortCAS({
        scene: loaded,
        data: worldBefore,
        compute: finishLakeWorldUpdate({
          credentials,
          kind,
          progress: state,
          snowTotal: snow.total,
          sceneEntry: entry,
          firstSnowThisFort,
          now,
        }),
      });
      worldAfter = data;
      addedBrick = result.bricksAfter > result.bricksBefore;

      if (addedBrick) {
        const sparkleSlots = Array.from(
          { length: result.bricksAfter - result.bricksBefore },
          (_, i) => result.bricksBefore + i + 1,
        );
        await reconcileFortPieces({
          world: loaded.world,
          sceneDropId: loaded.sceneDropId,
          theme: worldAfter.fort.theme,
          bricksPlaced: worldAfter.fort.bricksPlaced,
          sparkleSlots,
        }).catch((error) => console.error("handleDrill: reconcile failed", error));
        visitor
          .fireToast({ title: "Snow Fort", text: "You added a brick to the Snow Fort!" })
          .catch(() => console.error("Failed to fire brick toast"));
      }
      fireMilestoneToasts(loaded.world, result.milestonesReached, result.completed);
    } catch (error) {
      // The player's lake is saved; only the world credit failed. Log loudly for follow-up.
      errorHandler({ error, functionName: "handleDrill", message: "World snow write failed after retries", req });
    }

    const newRank = rankOf("tournament", worldAfter.leaderboards.tournament, profileId);
    const rankDelta = kind === "tournament" && prevTournamentRank && newRank ? prevTournamentRank - newRank : undefined;

    const data: DrillResponse = {
      lake: buildLakeView(kind, state, entry, worldAfter, today),
      fort: fortSummaryOf(worldAfter),
      tournament: buildTournamentSummary(entry, worldAfter, profileId, today, rankDelta),
      dailyRank: isDailyFinishedToday(entry, today)
        ? rankOf("dailyLake", worldAfter.leaderboards.dailyLake, profileId)
        : null,
      newlyMarked: outcome.newlyMarked,
      caughtFish: outcome.fish,
      caughtSpecial,
      justFinished: true,
      addedBrick,
    };
    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({ error, functionName: "handleDrill", message: "Error drilling a hole", req, res });
  }
};
