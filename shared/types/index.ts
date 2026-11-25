/**
 * Shared types between client and server.
 */

// ───────────────────────── Lake ─────────────────────────
export type LakeKind = "daily" | "tournament";

/** A generated lake. Server-only: fish positions never reach the client until the lake ends. */
export interface Lake {
  fish: number[]; // 7 hole indexes
  clues: number[]; // 3 pre-drilled hole indexes
  special: number | null; // daily only: one of `fish`
}

/** What the client sees for one hole. */
export type HoleView =
  | { s: "ice" } // undrilled
  | { s: "marked" } // Helper-marked empty
  | { s: "num"; n: number; clue?: true } // drilled number (clue = starter clue ring)
  | { s: "fish"; special?: true } // caught
  | { s: "missed" }; // only after the lake ends

export interface SnowBreakdown {
  fish: number; // regular fish caught × 1
  special: number; // 5 if the special fish was caught
  perfectBonus: number; // 3 on a perfect lake
  total: number;
}

export interface LakeResult {
  fishCaught: number;
  perfect: boolean;
  specialCaught: boolean | null; // null = tournament (no special fish)
  snow: SnowBreakdown;
  snowUntilNextBrick: number;
  fortComplete: boolean;
}

/** Server-only persisted progress (never sent raw to the client). */
export interface LakeProgress {
  kind: LakeKind;
  seed: string;
  dayKey: string; // ET day the lake was started
  drilled: number[]; // number holes drilled by the player (clues not included)
  caught: number[]; // fish holes drilled
  marked: number[];
  drillsLeft: number;
  finished: boolean;
  startedAt: number;
  finishedAt?: number;
  result?: LakeResult;
}

export interface LakeView {
  kind: LakeKind;
  label: string; // "DAILY LAKE • 7 FISH" | "TOURNAMENT LAKE 3/10 • 7 FISH"
  holes: HoleView[]; // 49, reading order
  drillsLeft: number;
  drillsTotal: number;
  fishCaught: number;
  fishTotal: number;
  finished: boolean;
  result?: LakeResult;
}

// ───────────────────────── Visitor / User record ─────────────────────────
export interface VisitorLifetime {
  fishCaught: number;
  lakesFinished: number;
  perfectLakes: number;
  dailyLakesFinished: number;
  specialFishCaught: number;
  tournamentLakesFinished: number;
}

export interface VisitorTournament {
  dayKey: string; // day the counters below belong to
  lakesFinished: number;
  fish: number;
  reachedAt: number;
  started: number; // lifetime tournament lakes started in this world (seeds the next lake)
  inProgress?: LakeProgress | null;
  lastFinished?: LakeProgress | null;
}

export interface VisitorWorldData {
  snowAdded: number; // all-time snow added in this world (Fort Builders)
  snowAddedAt: number;
  fortNumber: number; // fort that snowThisFort refers to
  snowThisFort: number;
  buildersEpoch: number; // Fort Builders reset epoch that buildersSnow refers to
  buildersSnow: number; // snow counted on the Fort Builders board since the last reset
  daily?: LakeProgress | null;
  tournament: VisitorTournament;
  lastSeenDay?: string; // last ET day the lazy checks ran (yesterday toast, tournament badges)
  lastOpenAt?: number;
}

/** Visitor data object (same backing record as User). Top-level keys follow the player across worlds. */
export interface VisitorDataObject {
  lifetime?: VisitorLifetime;
  badges?: Record<string, number>; // badgeName -> awardedAt (cache so most opens skip the inventory fetch)
  [urlSlug: string]: VisitorWorldData | VisitorLifetime | Record<string, number> | undefined;
}

// ───────────────────────── World data object ─────────────────────────
export type SectionKey = "foundation" | "walls" | "towers" | "keep";
export type FortVariety = "castle";
export type FortTheme = "winter";

export interface FortState {
  fortNumber: number;
  variety: FortVariety;
  theme: FortTheme;
  worldSnow: number;
  bricksPlaced: number; // 0..50, never decreases within a fort
  /** Brick spacing anchor: bricks after `fromBricks` are spread evenly between `fromSnow` and the goal (re-spacing on goal change). */
  spacing: { fromSnow: number; fromBricks: number };
  milestones: Partial<Record<SectionKey, number>>; // reachedAt
  builderCount: number;
  startedAt: number;
  completedAt?: number | null;
}

export type FortGoal = 1000 | 10000 | 30000 | 50000 | 100000;
export type TournamentLakesPerDay = 5 | 10 | 20 | null;

export interface WorldSettings {
  fortGoal: FortGoal;
  tournamentLakesPerDay: TournamentLakesPerDay;
}

export interface WorldLeaderboards {
  tournament: Record<string, string>; // profileId -> "displayName|fish|reachedAt"
  dailyLake: Record<string, string>; // profileId -> "displayName|fish|drillsLeft|finishedAt"
  fortBuilders: Record<string, string>; // profileId -> "displayName|snow|reachedAt"
  yesterday?: { dayKey: string; tournament: Record<string, string>; dailyLake: Record<string, string> } | null;
}

export interface WorldDataObject {
  fort: FortState;
  settings: WorldSettings;
  dayKey: string;
  leaderboards: WorldLeaderboards;
  tournamentHistory: Record<string, string[]>; // dayKey -> final top-10 profileIds
  fortBuildersEpoch: number; // bumped by the admin Fort Builders reset
}

// ───────────────────────── API payloads ─────────────────────────
export interface FortSummary {
  worldSnow: number;
  goal: number;
  bricksPlaced: number;
  snowUntilNextBrick: number;
  complete: boolean;
}

export interface TournamentSummary {
  unlocked: boolean;
  rank: number | null;
  rankDelta?: number;
  fish: number;
  lakesLeft: number | null; // null = no limit
  lakesPerDay: number | null;
  outOfLakes: boolean;
}

export interface FishingState {
  isAdmin: boolean;
  lake: LakeView;
  dailyRank: number | null;
  tournament: TournamentSummary;
  fort: FortSummary;
}

export interface DrillResponse {
  lake: LakeView;
  fort?: FortSummary;
  tournament?: TournamentSummary;
  dailyRank?: number | null;
  newlyMarked: number[];
  caughtFish: boolean;
  caughtSpecial: boolean;
  justFinished: boolean;
  addedBrick: boolean;
}

export interface FortSectionView {
  key: SectionKey;
  name: string;
  bricks: number; // cumulative brick count at which it finishes (8, 20, 34, 50)
  reached: boolean;
  snowToGo: number;
}

export interface FortView {
  isAdmin: boolean;
  fort: FortSummary;
  variety: FortVariety;
  youAdded: number;
  builderCount: number;
  sections: FortSectionView[];
}

export type LeaderboardKey = "tournament" | "dailyLake" | "fortBuilders";

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: string; // preformatted: "58 fish" | "7 fish · 3 left" | "1,240 snow"
  isYou: boolean;
}

export interface LeaderboardView {
  rows: LeaderboardRow[]; // top 25
  you: LeaderboardRow | null; // only when outside the top 25
}

export interface BadgeView {
  name: string;
  description: string;
  icon: string; // from the ecosystem catalog
  group: string;
  earned: boolean;
}

export interface TrophyState {
  isAdmin: boolean;
  lakesPerDay: number | null;
  leaderboards: {
    tournament: { today: LeaderboardView; yesterday: LeaderboardView | null };
    dailyLake: { today: LeaderboardView; yesterday: LeaderboardView | null };
    fortBuilders: LeaderboardView;
  };
  yesterdayDayKey: string | null;
  badges: BadgeView[];
}

export interface AdminState {
  settings: WorldSettings;
  missingSlots: number[]; // fort blocks with no asset in the world (admin warning)
  fortNumber: number;
}
