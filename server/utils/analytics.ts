import { Credentials } from "../types/index.js";

export type Analytic = { analyticName: string; profileId?: string; uniqueKey?: string; urlSlug?: string; incrementBy?: number };

/** One analytics entry carrying profileId + uniqueKey + urlSlug (spec §14). */
export const analytic = (analyticName: string, credentials: Credentials, incrementBy?: number): Analytic => {
  const { profileId, urlSlug } = credentials;
  const entry: Analytic = { analyticName, profileId, uniqueKey: profileId, urlSlug };
  if (incrementBy !== undefined) entry.incrementBy = incrementBy;
  return entry;
};

/** Count-style event (no uniqueKey), e.g. tournamentEnds-* fired once at rollover with incrementBy. */
export const countAnalytic = (analyticName: string, credentials: Credentials, incrementBy: number): Analytic => ({
  analyticName,
  urlSlug: credentials.urlSlug,
  profileId: credentials.profileId,
  incrementBy,
});
