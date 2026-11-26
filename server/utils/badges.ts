/**
 * Badges. The ecosystem inventory catalog is the source of truth for everything shown:
 * name (metadata.displayName), description, icon, group (metadata.group) and order (metadata.sortOrder).
 * The code only knows WHEN each badge is earned, keyed by the catalog item's exact `name`.
 */
import { InventoryItemInterface } from "@rtsdk/topia";
import type { BadgeView, VisitorLifetime, VisitorSceneData, SceneDataObject } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Analytic, analytic } from "./analytics.js";
import { standardizeError } from "./standardizeError.js";
import { Ecosystem } from "./topiaInit.js";
import type { VisitorInstance } from "./visitorData.js";

export interface BadgeContext {
  lifetime: VisitorLifetime;
  sceneEntry: VisitorSceneData;
  world: SceneDataObject;
  profileId: string;
  /** Best tournament finish on days not yet checked (lazy awards). */
  tournamentBestRank?: number | null;
}

const helped = (c: BadgeContext) => c.sceneEntry.snowAdded > 0;
const milestone = (c: BadgeContext, key: "foundation" | "walls" | "towers" | "keep") =>
  helped(c) && Boolean(c.world.fort.milestones?.[key]);
const rankAtMost = (c: BadgeContext, n: number) => c.tournamentBestRank != null && c.tournamentBestRank <= n;

/** Award rules keyed by the catalog item's exact `name`. Catalog badges without a rule are shown but never granted. */
export const BADGE_RULES: Record<string, (c: BadgeContext) => boolean> = {
  "First Catch": (c) => c.lifetime.fishCaught >= 1,
  "Angler": (c) => c.lifetime.fishCaught >= 25,
  "Expert Angler": (c) => c.lifetime.fishCaught >= 100,
  "Master Angler": (c) => c.lifetime.fishCaught >= 500,
  "Perfect Lake": (c) => c.lifetime.perfectLakes >= 1,
  "Sonar Pro": (c) => c.lifetime.perfectLakes >= 5,
  "Daily Catch": (c) => c.lifetime.dailyLakesFinished >= 1,
  "Special Catch": (c) => c.lifetime.specialFishCaught >= 1,
  "Five-Day Fisher": (c) => c.lifetime.dailyLakesFinished >= 5,
  "Fifteen-Day Fisher": (c) => c.lifetime.dailyLakesFinished >= 15,
  "Tournament Angler": (c) => c.lifetime.tournamentLakesFinished >= 1,
  "Top Ten": (c) => rankAtMost(c, 10),
  "On the Podium": (c) => rankAtMost(c, 3),
  "Tournament Champion": (c) => rankAtMost(c, 1),
  "Fort Builder": helped,
  "Foundation Crew": (c) => milestone(c, "foundation"),
  "Wall Crew": (c) => milestone(c, "walls"),
  "Tower Crew": (c) => milestone(c, "towers"),
  "Flag Raiser": (c) => milestone(c, "keep"),
};

/** Analytics name for a badge: "On the Podium" → "badgeEarns-onThePodium". */
export const badgeAnalyticName = (name: string) => {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return `badgeEarns-${words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join("")}`;
};

/** Badges the player qualifies for but that aren't in their badge cache yet. */
export const pendingBadges = (ctx: BadgeContext, badgeCache: Record<string, number>) =>
  Object.entries(BADGE_RULES)
    .filter(([name, earned]) => !badgeCache[name] && earned(ctx))
    .map(([name]) => name);

// ───────────────────── Ecosystem inventory cache (6h TTL) ─────────────────────
const CACHE_MS = 6 * 60 * 60 * 1000;
const inventoryCache = new Map<string, { items: InventoryItemInterface[]; timestamp: number }>();

export const getCachedInventoryItems = async ({
  credentials,
  forceRefresh = false,
}: {
  credentials: Credentials;
  forceRefresh?: boolean;
}): Promise<InventoryItemInterface[]> => {
  const key = credentials.interactivePublicKey;
  const cached = inventoryCache.get(key);
  if (cached && !forceRefresh && Date.now() - cached.timestamp < CACHE_MS) return cached.items;
  try {
    const ecosystem = Ecosystem.create({ credentials });
    await ecosystem.fetchInventoryItems();
    const items = (ecosystem.inventoryItems as InventoryItemInterface[]).filter((item) => (item as any)?.status !== "INACTIVE");
    inventoryCache.set(key, { items, timestamp: Date.now() });
    return items;
  } catch (error) {
    if (cached) {
      console.warn("Failed to fetch fresh inventory, using stale cache", error);
      return cached.items;
    }
    throw standardizeError(error);
  }
};

const findBadgeItem = (items: InventoryItemInterface[], name: string) =>
  items.find((item) => item.name === name && item.type === "BADGE");

/** Names of BADGE items the visitor holds (call after visitor.fetchInventoryItems()). */
export const ownedBadgeNames = (visitor: VisitorInstance) =>
  new Set<string>(
    ((visitor as any).inventoryItems || [])
      .filter((vi: any) => vi?.status === "ACTIVE" && vi?.item?.type === "BADGE" && vi?.item?.name)
      .map((vi: any) => vi.item.name as string),
  );

/**
 * Grant the given badges (skipping any the visitor already owns). Returns the names to record in the
 * badge cache and the badgeEarns analytics for the ones actually granted now.
 */
export const awardBadges = async ({
  credentials,
  visitor,
  names,
}: {
  credentials: Credentials;
  visitor: VisitorInstance;
  names: string[];
}): Promise<{ record: string[]; analytics: Analytic[] }> => {
  const record: string[] = [];
  const analytics: Analytic[] = [];
  if (!names.length) return { record, analytics };

  try {
    const items = await getCachedInventoryItems({ credentials });
    const available = names.filter((name) => {
      const found = findBadgeItem(items, name);
      if (!found) console.warn(`awardBadges: "${name}" is not in the ecosystem inventory yet`);
      return Boolean(found);
    });
    if (!available.length) return { record, analytics };

    await visitor.fetchInventoryItems();
    const owned = ownedBadgeNames(visitor);

    for (const name of available) {
      if (owned.has(name)) {
        record.push(name);
        continue;
      }
      try {
        const item = findBadgeItem(items, name) as any;
        await visitor.grantInventoryItem(item, 1);
        record.push(name);
        analytics.push(analytic(badgeAnalyticName(name), credentials));
        visitor
          .fireToast({
            groupId: "badges",
            title: "Badge earned!",
            text: `You earned the ${item?.metadata?.displayName || name} badge!`,
          })
          .catch(() => console.error(`Failed to fire toast for ${name} badge`));
      } catch (error) {
        console.error(`awardBadges: failed to grant ${name}`, error);
      }
    }
  } catch (error) {
    console.error("awardBadges failed", error);
  }
  return { record, analytics };
};

/** Badge grid for the Trophy drawer: every catalog BADGE, in metadata.sortOrder, grouped by metadata.group. */
export const buildBadgeViews = (items: InventoryItemInterface[], owned: Set<string>): BadgeView[] =>
  (items as any[])
    .filter((item) => item.type === "BADGE" && item.name)
    .sort((a, b) => (a.metadata?.sortOrder ?? Infinity) - (b.metadata?.sortOrder ?? Infinity))
    .map((item) => ({
      name: item.metadata?.displayName || item.name,
      description: item.description || "",
      icon: item.image_path || item.image_url || "",
      group: item.metadata?.group || "",
      earned: owned.has(item.name),
    }));
