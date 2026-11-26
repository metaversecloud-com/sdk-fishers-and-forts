import { LEADERBOARD_ROWS } from "@shared/constants.js";
import type { LeaderboardRow, LeaderboardView } from "@shared/types/index.js";

/** Pipe-delimited leaderboard entries. Names have pipes stripped before writing. */
export const cleanName = (name: string) => (name || "Player").replace(/\|/g, " ").trim().slice(0, 40) || "Player";

type Entry = { profileId: string; name: string; values: number[] };

const parse = (board: Record<string, string> | undefined): Entry[] =>
  Object.entries(board || {}).map(([profileId, raw]) => {
    const [name, ...rest] = String(raw).split("|");
    return { profileId, name, values: rest.map(Number) };
  });

/** Sorting rules. */
const SORTS = {
  // fish desc, reachedAt asc
  tournament: (a: Entry, b: Entry) => b.values[0] - a.values[0] || a.values[1] - b.values[1],
  // fish desc, drills left desc, finishedAt asc
  dailyLake: (a: Entry, b: Entry) => b.values[0] - a.values[0] || b.values[1] - a.values[1] || a.values[2] - b.values[2],
  // snow desc, reachedAt asc
  fortBuilders: (a: Entry, b: Entry) => b.values[0] - a.values[0] || a.values[1] - b.values[1],
};
export type BoardKey = keyof typeof SORTS;

const fmt = (n: number) => n.toLocaleString("en-US");
const SCORES: Record<BoardKey, (e: Entry) => string> = {
  tournament: (e) => `${fmt(e.values[0])} fish`,
  dailyLake: (e) => `${e.values[0]} fish · ${e.values[1]} left`,
  fortBuilders: (e) => `${fmt(e.values[0])} snow`,
};

export const rankedEntries = (key: BoardKey, board: Record<string, string> | undefined) =>
  parse(board).sort(SORTS[key]);

/** 1-based rank of a profile, or null if not on the board. */
export const rankOf = (key: BoardKey, board: Record<string, string> | undefined, profileId: string) => {
  const idx = rankedEntries(key, board).findIndex((e) => e.profileId === profileId);
  return idx < 0 ? null : idx + 1;
};

export const topProfileIds = (key: BoardKey, board: Record<string, string> | undefined, n: number) =>
  rankedEntries(key, board)
    .slice(0, n)
    .map((e) => e.profileId);

export const buildLeaderboardView = (
  key: BoardKey,
  board: Record<string, string> | undefined,
  profileId: string,
): LeaderboardView => {
  const ranked = rankedEntries(key, board);
  const toRow = (e: Entry, i: number): LeaderboardRow => ({
    rank: i + 1,
    name: e.name,
    score: SCORES[key](e),
    isYou: e.profileId === profileId,
  });
  const rows = ranked.slice(0, LEADERBOARD_ROWS).map(toRow);
  const myIdx = ranked.findIndex((e) => e.profileId === profileId);
  const you = myIdx >= LEADERBOARD_ROWS ? toRow(ranked[myIdx], myIdx) : null;
  return { rows, you };
};
