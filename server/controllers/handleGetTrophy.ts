import { Request, Response } from "express";
import type { TrophyState } from "@shared/types/index.js";
import {
  buildBadgeViews,
  buildLeaderboardView,
  errorHandler,
  getCachedInventoryItems,
  getCredentials,
  getVisitorData,
  getSceneData,
  ownedBadgeNames,
  runOpenChecks,
} from "../utils/index.js";

/** GET /api/trophy?open=true&forceRefreshInventory= — Leaderboards + Badges. */
export const handleGetTrophy = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { profileId } = credentials;
    const forceRefresh = req.query.forceRefreshInventory === "true";

    const [{ visitor, lifetime, sceneEntry, badgeCache }, { data: world }, items] = await Promise.all([
      getVisitorData(credentials, true),
      getSceneData(credentials),
      getCachedInventoryItems({ credentials, forceRefresh }),
    ]);

    if (req.query.open === "true") {
      await runOpenChecks({
        credentials,
        visitor,
        lifetime,
        sceneEntry,
        badgeCache,
        world,
        openAnalytics: ["appOpens", "leaderboardViews-tournament"],
      });
    }

    await visitor.fetchInventoryItems();
    const owned = ownedBadgeNames(visitor);
    const { tournament, dailyLake, fortBuilders, yesterday } = world.leaderboards;

    const data: TrophyState = {
      isAdmin: Boolean(visitor.isAdmin),
      lakesPerDay: world.settings.tournamentLakesPerDay,
      leaderboards: {
        tournament: {
          today: buildLeaderboardView("tournament", tournament, profileId),
          yesterday: yesterday ? buildLeaderboardView("tournament", yesterday.tournament, profileId) : null,
        },
        dailyLake: {
          today: buildLeaderboardView("dailyLake", dailyLake, profileId),
          yesterday: yesterday ? buildLeaderboardView("dailyLake", yesterday.dailyLake, profileId) : null,
        },
        fortBuilders: buildLeaderboardView("fortBuilders", fortBuilders, profileId),
      },
      yesterdayDayKey: yesterday?.dayKey || null,
      badges: buildBadgeViews(items, owned),
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetTrophy", message: "Error loading the Trophy", req, res });
  }
};
