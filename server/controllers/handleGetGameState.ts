import { Request, Response } from "express";
import type { FishingState, LakeKind } from "@shared/types/index.js";
import {
  buildLakeView,
  buildTournamentSummary,
  clock,
  errorHandler,
  etDayKey,
  fortSummaryOf,
  getCredentials,
  getVisitorData,
  getSceneData,
  isDailyFinishedToday,
  rankOf,
  resolveProgress,
  runOpenChecks,
} from "../utils/index.js";

/** GET /api/game-state?kind=daily|tournament&open=true — the Fishing drawer payload. */
export const handleGetGameState = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { profileId } = credentials;
    const isOpen = req.query.open === "true";
    const now = clock.now();
    const today = etDayKey(new Date(now));

    const [{ visitor, lifetime, sceneEntry, badgeCache }, { data: world }] = await Promise.all([
      getVisitorData(credentials, true),
      getSceneData(credentials),
    ]);

    // Tournament is locked until today's Daily Lake is finished.
    let kind: LakeKind = req.query.kind === "tournament" ? "tournament" : "daily";
    if (kind === "tournament" && !isDailyFinishedToday(sceneEntry, today)) kind = "daily";

    if (isOpen) {
      await runOpenChecks({
        credentials,
        visitor,
        lifetime,
        sceneEntry,
        badgeCache,
        world,
        openAnalytics: ["appOpens", "fishingDrawerOpens"],
      });
    }

    const { progress } = resolveProgress({ kind, sceneEntry, world, credentials, today, now });

    const data: FishingState = {
      isAdmin: Boolean(visitor.isAdmin),
      lake: buildLakeView(kind, progress, sceneEntry, world, today),
      dailyRank: isDailyFinishedToday(sceneEntry, today) ? rankOf("dailyLake", world.leaderboards.dailyLake, profileId) : null,
      tournament: buildTournamentSummary(sceneEntry, world, profileId, today),
      fort: fortSummaryOf(world),
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetGameState", message: "Error loading the Fishing drawer", req, res });
  }
};
