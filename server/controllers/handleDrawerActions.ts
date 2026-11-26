import { Request, Response } from "express";
import { analytic, clock, errorHandler, getCredentials, getVisitorData } from "../utils/index.js";

const BOARDS = ["tournament", "dailyLake", "fortBuilders"];

/** POST /api/leaderboard-view { board } — leaderboardViews-{board} analytics when a player switches boards. */
export const handleLeaderboardView = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const board = String(req.body?.board || "");
    if (!BOARDS.includes(board)) return res.status(400).json({ success: false, message: "Unknown leaderboard" });

    const { visitor } = await getVisitorData(credentials);
    await visitor.updateDataObject(
      { [`${credentials.urlSlug}.lastOpenAt`]: clock.now() },
      { analytics: [analytic(`leaderboardViews-${board}`, credentials)] },
    );
    return res.json({ success: true });
  } catch (error) {
    return errorHandler({ error, functionName: "handleLeaderboardView", message: "Error recording leaderboard view", req, res });
  }
};
