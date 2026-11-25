import { Request, Response } from "express";
import { FORT_GOAL_OPTIONS, TOURNAMENT_LAKE_OPTIONS } from "@shared/constants.js";
import { bricksForSnow, sectionsCrossed } from "@shared/fort/fort.js";
import type { AdminState, FortGoal, TournamentLakesPerDay, WorldDataObject } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import {
  Analytic,
  analytic,
  clock,
  errorHandler,
  fireMilestoneToasts,
  fortSummaryOf,
  getCredentials,
  getWorldData,
  newFort,
  reconcileFortPieces,
  updateFortCAS,
  Visitor,
} from "../utils/index.js";

/** All admin routes check isAdmin server-side. */
const requireAdmin = async (credentials: Credentials) => {
  const visitor = await Visitor.get(credentials.visitorId, credentials.urlSlug, { credentials });
  if (!(visitor as any)?.isAdmin) throw Object.assign(new Error("Admins only"), { status: 403 });
  return visitor;
};

const adminState = (world: WorldDataObject, missingSlots: number[]): AdminState => ({
  settings: world.settings,
  missingSlots,
  fortNumber: world.fort.fortNumber,
});

/** GET /api/admin/settings — settings plus a reconcile pass that reports missing fort blocks. */
export const handleGetAdminSettings = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    await requireAdmin(credentials);
    const { world: worldInstance, data } = await getWorldData(credentials);
    const { missingSlots } = await reconcileFortPieces({
      world: worldInstance,
      theme: data.fort.theme,
      bricksPlaced: data.fort.bricksPlaced,
    });
    return res.json({ success: true, data: adminState(data, missingSlots) });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetAdminSettings", message: "Error loading admin settings", req, res });
  }
};

/** POST /api/admin/settings { fortGoal?, tournamentLakesPerDay? } */
export const handleUpdateAdminSettings = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    await requireAdmin(credentials);
    const { fortGoal, tournamentLakesPerDay } = req.body || {};

    if (fortGoal !== undefined && !FORT_GOAL_OPTIONS.includes(fortGoal))
      return res.status(400).json({ success: false, message: "Invalid fort goal" });
    if (tournamentLakesPerDay !== undefined && !TOURNAMENT_LAKE_OPTIONS.includes(tournamentLakesPerDay))
      return res.status(400).json({ success: false, message: "Invalid tournament lakes per day" });

    const { world: worldInstance, data } = await getWorldData(credentials);
    const now = clock.now();

    const { data: updated, result } = await updateFortCAS({
      credentials,
      world: worldInstance,
      data,
      compute: (world) => {
        const patch: Record<string, unknown> = {};
        const analytics: Analytic[] = [];
        const { fort } = world;
        let bricksAfter = fort.bricksPlaced;
        let milestonesReached: string[] = [];
        let completed = false;

        if (tournamentLakesPerDay !== undefined) patch["settings.tournamentLakesPerDay"] = tournamentLakesPerDay as TournamentLakesPerDay;
        if (fortGoal !== undefined && fortGoal !== world.settings.fortGoal) {
          // Re-space the remaining bricks between the current snow and the new goal.
          const spacing = { fromSnow: fort.worldSnow, fromBricks: fort.bricksPlaced };
          bricksAfter = bricksForSnow(fort.worldSnow, fortGoal, spacing, fort.bricksPlaced);
          patch["settings.fortGoal"] = fortGoal as FortGoal;
          patch["fort.spacing"] = spacing;
          if (bricksAfter > fort.bricksPlaced) {
            patch["fort.bricksPlaced"] = bricksAfter;
            analytics.push(analytic(`${fort.variety}FortBrickPlacements`, credentials, bricksAfter - fort.bricksPlaced));
            for (const s of sectionsCrossed(fort.bricksPlaced, bricksAfter)) {
              if (fort.milestones?.[s.key]) continue;
              patch[`fort.milestones.${s.key}`] = now;
              milestonesReached.push(s.key);
              analytics.push(analytic(`${fort.variety}FortMilestoneReaches-${s.key}`, credentials));
            }
            if (bricksAfter >= 50 && !fort.completedAt) {
              patch["fort.completedAt"] = now;
              completed = true;
            }
          }
        }
        return { patch, analytics, result: { bricksBefore: fort.bricksPlaced, bricksAfter, milestonesReached, completed } };
      },
    });

    const sparkleSlots = Array.from({ length: result.bricksAfter - result.bricksBefore }, (_, i) => result.bricksBefore + i + 1);
    const { missingSlots } = await reconcileFortPieces({
      world: worldInstance,
      theme: updated.fort.theme,
      bricksPlaced: updated.fort.bricksPlaced,
      sparkleSlots,
    });
    fireMilestoneToasts(worldInstance, result.milestonesReached, result.completed);

    return res.json({ success: true, data: { ...adminState(updated, missingSlots), fort: fortSummaryOf(updated) } });
  } catch (error) {
    return errorHandler({ error, functionName: "handleUpdateAdminSettings", message: "Error saving admin settings", req, res });
  }
};

/** POST /api/admin/start-new-fort — World Snow back to zero, every brick disappears. */
export const handleStartNewFort = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    await requireAdmin(credentials);
    const { world: worldInstance, data } = await getWorldData(credentials);

    const { data: updated } = await updateFortCAS({
      credentials,
      world: worldInstance,
      data,
      compute: (world) => ({
        patch: { fort: newFort(world.fort.fortNumber + 1, clock.now()) },
        analytics: [analytic(`fortRestarts-${world.fort.variety}`, credentials)],
        result: null,
      }),
    });

    const { missingSlots } = await reconcileFortPieces({
      world: worldInstance,
      theme: updated.fort.theme,
      bricksPlaced: 0,
    });

    return res.json({ success: true, data: { ...adminState(updated, missingSlots), fort: fortSummaryOf(updated) } });
  } catch (error) {
    return errorHandler({ error, functionName: "handleStartNewFort", message: "Error starting a new fort", req, res });
  }
};

/** POST /api/admin/reset-leaderboard — clears Fort Builders (the only resettable board). */
export const handleResetLeaderboard = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    await requireAdmin(credentials);
    const { world: worldInstance, data } = await getWorldData(credentials);
    const epoch = (data.fortBuildersEpoch || 0) + 1;
    await worldInstance.updateDataObject(
      { "leaderboards.fortBuilders": {}, fortBuildersEpoch: epoch },
      { lock: { lockId: `ff-reset-builders-${credentials.urlSlug}-${epoch}`, releaseLock: false } },
    );
    return res.json({ success: true });
  } catch (error) {
    return errorHandler({ error, functionName: "handleResetLeaderboard", message: "Error resetting the leaderboard", req, res });
  }
};
