import crypto from "crypto";

/** ET day key (YYYY-MM-DD in America/New_York). Handles DST via Intl. From sdk-birdwatch. */
export const etDayKey = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** Injectable clock so rollover and the ET boundary are testable. */
export const clock = { now: () => Date.now() };

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seeds are HMAC'd with the app secret so the lakes can't be computed from the (public) source code.
 * Daily: same for every player in every world on a given day. Tournament: per player, per world, per lake.
 */
const hmac = (value: string) =>
  crypto
    .createHmac("sha256", process.env.INTERACTIVE_SECRET || "fishers-and-forts")
    .update(value)
    .digest("hex")
    .slice(0, 24);

export const dailySeed = (dayKey: string) => hmac(`daily-${dayKey}`);

export const tournamentSeed = (profileId: string, urlSlug: string, lakeNumber: number) =>
  hmac(`tournament-${urlSlug}-${profileId}-${lakeNumber}`);
