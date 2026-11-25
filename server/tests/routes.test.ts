/**
 * Route tests against the stateful SDK fake in mocks/@rtsdk/topia.ts — the real controllers and utils run.
 */
import express from "express";
import request from "supertest";

import { UNIQUE_NAMES } from "@shared/constants.js";
import { generateLake } from "@shared/lake/engine.js";
import { HOLE_COUNT } from "@shared/constants.js";
import router from "../routes.js";
import { BADGE_RULES } from "../utils/badges.js";
import { clock, dailySeed, etDayKey, tournamentSeed } from "../utils/time.js";

const fake = require("../mocks/@rtsdk/topia");
const store = fake.__store;

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
};

const SLUG = "winter-wonderland";
const SCENE = "scene-1";
const KEY = `${SLUG}-${SCENE}`; // this scene's key in the player's record
const creds = (profileId = "p1", visitorId = 1, sceneDropId = SCENE) => ({
  assetId: "asset-key",
  sceneDropId,
  displayName: `Player ${profileId}`,
  interactiveNonce: "nonce",
  interactivePublicKey: process.env.INTERACTIVE_KEY,
  profileId,
  urlSlug: SLUG,
  visitorId,
});

// 12:00 noon ET on Dec 1, 2026
const DEC1 = Date.parse("2026-12-01T17:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const today = () => etDayKey(new Date(clock.now()));

/** The scene data object: the data object of that scene's key asset. */
const sceneData = (sceneDropId = SCENE) => {
  const keyAsset = store.assets[SLUG].find((a: any) => a.uniqueName === UNIQUE_NAMES.keyAsset && a.sceneDropId === sceneDropId);
  return store.assetData[keyAsset.id];
};

const app = makeApp();
const get = (path: string, query = {}, who = creds()) => request(app).get(`/api${path}`).query({ ...who, ...query });
const post = (path: string, body = {}, who = creds()) => request(app).post(`/api${path}`).query(who).send(body);

/** Holes to drill: every fish first (a perfect lake), then empty holes until drills run out if `fishToCatch` < 7. */
const playLake = async (kind: "daily" | "tournament", seed: string, fishToCatch = 7, who = creds()) => {
  const lake = generateLake(seed, kind === "daily");
  const targets = lake.fish.slice(0, fishToCatch);
  let last: any;
  for (const hole of targets) {
    last = await post("/lake/drill", { kind, hole }, who);
    expect(last.status).toBe(200);
  }
  // Burn the remaining drills on non-fish, non-marked holes.
  while (!last?.body.data.lake.finished) {
    const holes = last ? last.body.data.lake.holes : (await get("/game-state", { kind }, who)).body.data.lake.holes;
    const hole = holes.findIndex((h: any, i: number) => h.s === "ice" && !lake.fish.includes(i));
    last = await post("/lake/drill", { kind, hole }, who);
    expect(last.status).toBe(200);
  }
  return last.body.data;
};

beforeEach(() => {
  fake.resetStore();
  clock.now = () => DEC1;
  fake.addAsset(SLUG, UNIQUE_NAMES.keyAsset, SCENE);
  // Catalog fixture, like the inventory ZIP: listed in reverse to prove the app sorts by metadata.sortOrder.
  store.inventoryItems = Object.keys(BADGE_RULES)
    .map((name, i) => ({
      id: `badge-${i}`,
      name,
      type: "BADGE",
      status: "ACTIVE",
      description: `${name} description`,
      image_path: `https://img/${i}.png`,
      metadata: { displayName: name, sortOrder: i, group: i < 6 ? "Fishing" : "Other" },
    }))
    .reverse();
});

describe("system", () => {
  test("GET /system/health", async () => {
    const res = await request(app).get("/api/system/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "OK");
  });
});

describe("Fishing drawer", () => {
  test("first open initializes data, shows today's Daily Lake with 3 clues and no fish, tournament locked", async () => {
    const res = await get("/game-state", { open: "true" });
    expect(res.status).toBe(200);
    const { lake, tournament, fort } = res.body.data;
    expect(lake.kind).toBe("daily");
    expect(lake.label).toBe("DAILY LAKE • 7 FISH");
    expect(lake.holes).toHaveLength(HOLE_COUNT);
    expect(lake.holes.filter((h: any) => h.s === "num" && h.clue)).toHaveLength(3);
    expect(lake.holes.some((h: any) => h.s === "fish" || h.s === "missed")).toBe(false);
    expect(tournament.unlocked).toBe(false);
    expect(fort).toMatchObject({ worldSnow: 0, goal: 30000, bricksPlaced: 0 });
    expect(sceneData().fort.fortNumber).toBe(1);
    expect(store.visitors.p1[KEY]).toBeDefined();
    expect(store.analytics.map((a: any) => a.analyticName)).toEqual(expect.arrayContaining(["appOpens", "fishingDrawerOpens"]));
  });

  test("asking for the tournament before the daily is finished falls back to the daily lake", async () => {
    const res = await get("/game-state", { kind: "tournament" });
    expect(res.body.data.lake.kind).toBe("daily");
    const drill = await post("/lake/drill", { kind: "tournament", hole: 0 });
    expect(drill.status).toBe(400);
    expect(drill.body.message).toBe("Finish today's Daily Lake first.");
  });

  test("drill validation: clues and bad holes are rejected", async () => {
    const lake = generateLake(dailySeed(today()), true);
    expect((await post("/lake/drill", { kind: "daily", hole: lake.clues[0] })).status).toBe(400);
    expect((await post("/lake/drill", { kind: "daily", hole: 99 })).status).toBe(400);
  });

  test("a perfect Daily Lake credits snow, leaderboards, lifetime totals and badges", async () => {
    const data = await playLake("daily", dailySeed(today()));
    expect(data.justFinished).toBe(true);
    expect(data.lake.result).toMatchObject({ fishCaught: 7, perfect: true, specialCaught: true });
    expect(data.lake.result.snow).toEqual({ fish: 6, special: 5, perfectBonus: 3, total: 14 });
    expect(data.fort.worldSnow).toBe(14);
    expect(data.dailyRank).toBe(1);
    expect(data.tournament.unlocked).toBe(true);

    const world = sceneData();
    expect(world.fort.worldSnow).toBe(14);
    expect(world.fort.builderCount).toBe(1);
    expect(world.leaderboards.dailyLake.p1).toMatch(/^Player p1\|7\|\d+\|\d+$/);
    expect(world.leaderboards.fortBuilders.p1).toMatch(/^Player p1\|14\|/);

    const v = store.visitors.p1;
    expect(v.lifetime).toMatchObject({ fishCaught: 7, lakesFinished: 1, perfectLakes: 1, dailyLakesFinished: 1, specialFishCaught: 1 });
    expect(store.owned.p1).toEqual(expect.arrayContaining(["First Catch", "Perfect Lake", "Daily Catch", "Special Catch", "Fort Builder"]));
    expect(Object.keys(v.badges)).toEqual(expect.arrayContaining(["First Catch", "Fort Builder"]));
    const names = store.analytics.map((a: any) => a.analyticName);
    expect(names).toEqual(expect.arrayContaining(["lakeStarts-daily", "lakeFinishes-daily", "lakeFinishes-0fishLeft", "specialCatches", "badgeEarns-firstCatch"]));

    // One attempt: the finished lake can't be drilled again.
    const again = await post("/lake/drill", { kind: "daily", hole: 0 });
    expect(again.status).toBe(400);
  });

  test("tournament lakes count toward the day's score and respect the daily cap", async () => {
    await playLake("daily", dailySeed(today()));
    sceneData().settings.tournamentLakesPerDay = 5;

    const first = await get("/game-state", { kind: "tournament" });
    expect(first.body.data.lake.label).toBe("TOURNAMENT LAKE 1/5 • 7 FISH");

    const data = await playLake("tournament", tournamentSeed("p1", KEY, 0), 4);
    expect(data.lake.result.specialCaught).toBeNull();
    expect(data.tournament).toMatchObject({ fish: 4, lakesLeft: 4, rank: 1 });
    expect(sceneData().leaderboards.tournament.p1).toMatch(/^Player p1\|4\|/);

    // Use up the remaining lakes by editing the counter, then the next drill is refused.
    store.visitors.p1[KEY].tournament.lakesFinished = 5;
    const out = await get("/game-state", { kind: "tournament" });
    expect(out.body.data.tournament.outOfLakes).toBe(true);
    expect((await post("/lake/drill", { kind: "tournament", hole: 0 })).status).toBe(400);
  });

  test("an unfinished lake resumes where it left off", async () => {
    const lake = generateLake(dailySeed(today()), true);
    await post("/lake/drill", { kind: "daily", hole: lake.fish[0] });
    const res = await get("/game-state");
    expect(res.body.data.lake.fishCaught).toBe(1);
    expect(res.body.data.lake.drillsLeft).toBe(17);
  });
});

describe("Snow Fort", () => {
  const setupPieces = (skip: number[] = []) => {
    for (let slot = 1; slot <= 50; slot++) if (!skip.includes(slot)) fake.addAsset(SLUG, `${UNIQUE_NAMES.fortBlockPrefix}${slot}`, SCENE);
  };

  test("crossing a brick threshold swaps the brick image, sparkles it and toasts the player", async () => {
    setupPieces([3]);
    await get("/game-state"); // init world
    sceneData().settings.fortGoal = 1000; // 20 snow per brick
    sceneData().fort.worldSnow = 30;
    sceneData().fort.bricksPlaced = 1;

    const data = await playLake("daily", dailySeed(today())); // +14 → 44 snow = 2 bricks
    expect(data.addedBrick).toBe(true);
    expect(data.fort.bricksPlaced).toBe(2);

    const assets = store.assets[SLUG];
    const slot = (n: number) => assets.find((a: any) => a.uniqueName === `${UNIQUE_NAMES.fortBlockPrefix}${n}`);
    expect(slot(1).topLayerURL).toMatch(/brick\.png$/);
    expect(slot(2).topLayerURL).toMatch(/brick\.png$/);
    expect(slot(4).topLayerURL).toMatch(/transparent\.png$/);
    expect(store.particles).toHaveLength(1);
    expect(store.visitorToasts.map((t: any) => t.text)).toContain("You added a brick to the Snow Fort!");
    expect(store.analytics).toEqual(expect.arrayContaining([expect.objectContaining({ analyticName: "castleFortBrickPlacements", incrementBy: 1 })]));
  });

  test("finishing a section records the milestone once and fires the world toast", async () => {
    setupPieces();
    await get("/game-state");
    sceneData().settings.fortGoal = 1000;
    sceneData().fort.worldSnow = 150; // 7 bricks
    sceneData().fort.bricksPlaced = 7;

    await playLake("daily", dailySeed(today())); // 164 → 8 bricks: foundation
    expect(sceneData().fort.milestones.foundation).toBeDefined();
    expect(store.worldToasts.map((t: any) => t.text)).toContain("The Snow Fort's foundation is finished! Come see it.");
  });

  test("GET /fort returns progress, sections and the player's contribution", async () => {
    await playLake("daily", dailySeed(today()));
    const res = await get("/fort", { open: "true" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ youAdded: 14, builderCount: 1 });
    expect(res.body.data.sections[2]).toMatchObject({ key: "towers", bricks: 34, reached: false, snowToGo: 20400 - 14 });
  });

  test("concurrent finishes don't lose snow (compare-and-swap retry)", async () => {
    await get("/game-state");
    let injected = false;
    store.beforeSceneUpdate = () => {
      // Another lake finish lands between this request's read and write.
      if (injected) return;
      injected = true;
      const w = sceneData();
      w.fort.worldSnow += 5;
      store.locks.add(`ff-fort-${SCENE}-1-0-0-30000-10`);
    };
    await playLake("daily", dailySeed(today()));
    expect(sceneData().fort.worldSnow).toBe(19);
  });
});

describe("Daily rollover", () => {
  test("first request after midnight ET freezes yesterday, records the top 10, and toasts the player", async () => {
    await playLake("daily", dailySeed(today()));
    await playLake("tournament", tournamentSeed("p1", KEY, 0), 3);

    clock.now = () => DEC1 + DAY;
    const res = await get("/game-state", { open: "true" });
    expect(res.status).toBe(200);
    const w = sceneData();
    expect(w.dayKey).toBe("2026-12-02");
    expect(w.leaderboards.tournament).toEqual({});
    expect(w.leaderboards.yesterday.dayKey).toBe("2026-12-01");
    expect(w.tournamentHistory["2026-12-01"]).toEqual(["p1"]);
    expect(store.owned.p1).toEqual(expect.arrayContaining(["Top Ten", "On the Podium", "Tournament Champion"]));
    expect(store.visitorToasts.map((t: any) => t.text)).toContain("You finished #1 in yesterday's Fishing Tournament!");
    expect(store.analytics).toEqual(expect.arrayContaining([expect.objectContaining({ analyticName: "tournamentEnds-playersEntered", incrementBy: 1 })]));
    // New day: daily lake is fresh again.
    expect(res.body.data.lake.finished).toBe(false);
  });
});

describe("Trophy drawer", () => {
  test("leaderboards show the top rows; badges come from the ecosystem catalog", async () => {
    await playLake("daily", dailySeed(today()));
    await playLake("daily", dailySeed(today()), 7, creds("p2", 2));
    const res = await get("/trophy", { open: "true" });
    expect(res.status).toBe(200);
    const { leaderboards, badges } = res.body.data;
    expect(leaderboards.dailyLake.today.rows.map((r: any) => r.rank)).toEqual([1, 2]);
    expect(leaderboards.dailyLake.today.rows[0].score).toMatch(/^7 fish · \d+ left$/);
    expect(badges).toHaveLength(19);
    expect(badges.map((b: any) => b.name)).toEqual(Object.keys(BADGE_RULES));
    expect(badges[0]).toMatchObject({
      name: "First Catch",
      description: "First Catch description",
      group: "Fishing",
      earned: true,
      icon: "https://img/0.png",
    });
    expect(badges.find((b: any) => b.name === "Master Angler")).toMatchObject({ earned: false });
  });
});

describe("Two scenes in one world", () => {
  const SCENE_B = "scene-2";
  const KEY_B = `${SLUG}-${SCENE_B}`;

  test("each scene keeps its own fort, leaderboards, settings, player progress and blocks", async () => {
    fake.addAsset(SLUG, UNIQUE_NAMES.keyAsset, SCENE_B);
    for (let slot = 1; slot <= 50; slot++) {
      fake.addAsset(SLUG, `${UNIQUE_NAMES.fortBlockPrefix}${slot}`, SCENE);
      fake.addAsset(SLUG, `${UNIQUE_NAMES.fortBlockPrefix}${slot}`, SCENE_B);
    }
    await get("/game-state"); // init scene A
    sceneData().settings.fortGoal = 1000; // 20 snow per brick in scene A only

    await playLake("daily", dailySeed(today())); // p1 in scene A: +14 snow
    await playLake("daily", dailySeed(today()), 7, creds("p2", 2, SCENE_B)); // p2 in scene B: +14 snow

    // Each fort only counts its own scene's snow and builders.
    expect(sceneData().fort.worldSnow).toBe(14);
    expect(sceneData(SCENE_B).fort.worldSnow).toBe(14);
    expect(Object.keys(sceneData().leaderboards.dailyLake)).toEqual(["p1"]);
    expect(Object.keys(sceneData(SCENE_B).leaderboards.dailyLake)).toEqual(["p2"]);
    expect(sceneData(SCENE_B).settings.fortGoal).toBe(30000);

    // Player progress is per scene: p1 hasn't played scene B's Daily Lake yet.
    expect(store.visitors.p1[KEY].daily.finished).toBe(true);
    expect(store.visitors.p1[KEY_B]).toBeUndefined();
    const inB = await get("/game-state", {}, creds("p1", 1, SCENE_B));
    expect(inB.body.data.lake.finished).toBe(false);
    expect(store.visitors.p1[KEY_B]).toBeDefined();

    // Tournament lakes differ between scenes, so a solved lake can't be replayed on the other board.
    expect(tournamentSeed("p1", KEY, 0)).not.toBe(tournamentSeed("p1", KEY_B, 0));

    // Admin changes stay in their scene, and only that scene's blocks change.
    store.admins.add("p1");
    await post("/admin/settings", { fortGoal: 1000 }, creds("p1", 1, SCENE_B));
    const blocks = (scene: string) =>
      store.assets[SLUG].filter((a: any) => a.sceneDropId === scene && a.uniqueName.startsWith(UNIQUE_NAMES.fortBlockPrefix));
    expect(sceneData(SCENE_B).settings.fortGoal).toBe(1000);
    expect(sceneData(SCENE_B).fort.bricksPlaced).toBe(0); // 14 snow after the re-space is still short of a brick
    sceneData(SCENE_B).fort.bricksPlaced = 3;
    await get("/admin/settings", {}, creds("p1", 1, SCENE_B)); // reconcile pass for scene B
    expect(blocks(SCENE_B).filter((a: any) => /brick\.png$/.test(a.topLayerURL))).toHaveLength(3);
    expect(blocks(SCENE).every((a: any) => a.updateWebImageLayers.mock.calls.length === 0)).toBe(true);

    await post("/admin/start-new-fort", {}, creds("p1", 1, SCENE_B));
    expect(sceneData(SCENE_B).fort.fortNumber).toBe(2);
    expect(sceneData().fort.fortNumber).toBe(1);
    expect(sceneData().fort.worldSnow).toBe(14);
  });

  test("a request without a scene drop, or from a scene without a key asset, is refused", async () => {
    const noScene = await get("/game-state", {}, { ...creds(), sceneDropId: "" });
    expect(noScene.status).toBe(400);
    const noKeyAsset = await get("/game-state", {}, creds("p1", 1, "scene-without-key"));
    expect(noKeyAsset.status).toBe(404);
  });
});

describe("Admin", () => {
  test("admin routes are admins only", async () => {
    await get("/game-state");
    expect((await get("/admin/settings")).status).toBe(403);
    expect((await post("/admin/start-new-fort")).status).toBe(403);
    expect((await post("/admin/settings", { fortGoal: 1000 })).status).toBe(403);
    expect((await post("/admin/reset-leaderboard")).status).toBe(403);
  });

  test("settings report missing fort blocks; lowering the goal places bricks; start new fort resets", async () => {
    store.admins.add("p1");
    for (let slot = 1; slot <= 50; slot++) if (slot !== 12 && slot !== 27) fake.addAsset(SLUG, `${UNIQUE_NAMES.fortBlockPrefix}${slot}`, SCENE);
    await playLake("daily", dailySeed(today()));

    const settings = await get("/admin/settings");
    expect(settings.status).toBe(200);
    expect(settings.body.data).toMatchObject({ missingSlots: [12, 27] });

    expect((await post("/admin/settings", { fortGoal: 12345 })).status).toBe(400);
    const lowered = await post("/admin/settings", { fortGoal: 1000 });
    expect(lowered.status).toBe(200);
    expect(lowered.body.data.settings.fortGoal).toBe(1000);
    expect(sceneData().fort.spacing).toEqual({ fromSnow: 14, fromBricks: 0 });

    const reset = await post("/admin/start-new-fort");
    expect(reset.status).toBe(200);
    const fort = sceneData().fort;
    expect(fort).toMatchObject({ fortNumber: 2, worldSnow: 0, bricksPlaced: 0, builderCount: 0 });
    expect(sceneData().leaderboards.fortBuilders.p1).toBeDefined(); // leaderboard untouched
    expect(store.analytics.map((a: any) => a.analyticName)).toContain("fortRestarts-castle");
  });

  test("reset leaderboard clears Fort Builders and new snow starts from zero", async () => {
    store.admins.add("p1");
    await playLake("daily", dailySeed(today()));
    expect((await post("/admin/reset-leaderboard")).status).toBe(200);
    expect(sceneData().leaderboards.fortBuilders).toEqual({});
    expect(sceneData().fortBuildersEpoch).toBe(1);
  });
});
