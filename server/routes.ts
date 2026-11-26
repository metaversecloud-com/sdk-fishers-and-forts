import express from "express";
import {
  handleDrill,
  handleGetAdminSettings,
  handleGetFort,
  handleGetGameState,
  handleGetTrophy,
  handleLeaderboardView,
  handleResetLeaderboard,
  handleStartNewFort,
  handleUpdateAdminSettings,
} from "./controllers/index.js";
import { getVersion } from "@utils/getVersion.js";

const router = express.Router();
const SERVER_START_DATE = new Date();

router.get("/", (req, res) => {
  res.json({ message: "Hello from server!" });
});

router.get("/system/health", (req, res) => {
  return res.json({
    appVersion: getVersion(),
    status: "OK",
    serverStartDate: SERVER_START_DATE,
    envs: {
      COMMIT_HASH: process.env.COMMIT_HASH ?? "NOT SET",
      BUILD_TIME: process.env.BUILD_TIME ?? "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
      INSTANCE_DOMAIN: process.env.INSTANCE_DOMAIN,
      INTERACTIVE_KEY: process.env.INTERACTIVE_KEY,
      S3_BUCKET: process.env.S3_BUCKET,
    },
  });
});

// Drawers
router.get("/game-state", handleGetGameState);
router.post("/lake/drill", handleDrill);
router.get("/fort", handleGetFort);
router.get("/trophy", handleGetTrophy);
router.post("/leaderboard-view", handleLeaderboardView);

// Admin
router.get("/admin/settings", handleGetAdminSettings);
router.post("/admin/settings", handleUpdateAdminSettings);
router.post("/admin/start-new-fort", handleStartNewFort);
router.post("/admin/reset-leaderboard", handleResetLeaderboard);

export default router;
