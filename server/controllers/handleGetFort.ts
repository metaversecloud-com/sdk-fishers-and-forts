import { Request, Response } from "express";
import { SECTIONS, brickThreshold } from "@shared/fort/fort.js";
import type { FortView } from "@shared/types/index.js";
import { errorHandler, fortSummaryOf, getCredentials, getVisitorData, getWorldData, runOpenChecks } from "../utils/index.js";

/** GET /api/fort?open=true — the Snow Fort drawer payload. */
export const handleGetFort = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const [{ visitor, lifetime, worldEntry, badgeCache }, { data: world }] = await Promise.all([
      getVisitorData(credentials),
      getWorldData(credentials),
    ]);

    if (req.query.open === "true") {
      await runOpenChecks({ credentials, visitor, lifetime, worldEntry, badgeCache, world, openAnalytics: ["appOpens", "fortDrawerOpens"] });
    }

    const { fort, settings } = world;
    const data: FortView = {
      isAdmin: false,
      fort: fortSummaryOf(world),
      variety: fort.variety,
      youAdded: worldEntry.fortNumber === fort.fortNumber ? worldEntry.snowThisFort : 0,
      builderCount: fort.builderCount || 0,
      sections: SECTIONS.map((s) => {
        const reached = fort.bricksPlaced >= s.lastSlot;
        return {
          key: s.key,
          name: s.name,
          bricks: s.lastSlot,
          reached,
          snowToGo: reached ? 0 : Math.max(0, brickThreshold(s.lastSlot, settings.fortGoal, fort.spacing) - fort.worldSnow),
        };
      }),
    };

    return res.json({ success: true, data });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetFort", message: "Error loading the Snow Fort", req, res });
  }
};
