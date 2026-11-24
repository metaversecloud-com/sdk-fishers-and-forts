/**
 * Reconcile the fort pieces in the world with `bricksPlaced`.
 *
 * Every pass looks the pieces up by unique name, so deleted, duplicated or re-added blocks are handled
 * without any cached ids: pieces whose image is wrong get swapped, missing slots are reported (never fatal).
 */
import { BRICK_PARTICLE_NAME, UNIQUE_NAMES } from "@shared/constants.js";
import { SLOT_COUNT, pieceTypeForSlot } from "@shared/fort/fort.js";
import type { FortTheme } from "@shared/types/index.js";
import { getBaseUrl } from "./getBaseUrl.js";

type Piece = "brick" | "towerTop" | "flag" | "transparent";

const FILES: Record<Piece, string> = {
  brick: "brick.png",
  towerTop: "tower-top.png",
  flag: "flag.png",
  transparent: "transparent.png",
};

/** Piece art URL. Served from client/public/assets/fort/{theme}/ (override with FORT_ART_BASE_URL). */
export const pieceArtUrl = (host: string, theme: FortTheme, piece: Piece) => {
  const base = process.env.FORT_ART_BASE_URL || `${getBaseUrl(host)}/assets/fort`;
  return `${base}/${theme}/${FILES[piece]}`;
};

/** Slot number from a unique name: `Fishers&Forts_fortBlock_7` / `…_07` → 7. Null if not a valid slot. */
export const parseSlot = (uniqueName: string | undefined) => {
  if (!uniqueName?.startsWith(UNIQUE_NAMES.fortBlockPrefix)) return null;
  const suffix = uniqueName.slice(UNIQUE_NAMES.fortBlockPrefix.length).trim();
  if (!/^\d+$/.test(suffix)) return null;
  const slot = Number(suffix);
  return slot >= 1 && slot <= SLOT_COUNT ? slot : null;
};

const runLimited = async <T>(tasks: (() => Promise<T>)[], limit = 8) => {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    results.push(...(await Promise.allSettled(tasks.slice(i, i + limit).map((t) => t()))));
  }
  return results;
};

export const reconcileFortPieces = async ({
  world,
  host,
  theme,
  bricksPlaced,
  sparkleSlots = [],
}: {
  world: any;
  host: string;
  theme: FortTheme;
  bricksPlaced: number;
  /** Newly placed slots that get the sparkle particle. */
  sparkleSlots?: number[];
}) => {
  const [blocks, flags] = await Promise.all([
    world.fetchDroppedAssetsWithUniqueName({ uniqueName: UNIQUE_NAMES.fortBlockPrefix, isPartial: true }),
    world.fetchDroppedAssetsWithUniqueName({ uniqueName: UNIQUE_NAMES.fortFlag }),
  ]);

  const bySlot = new Map<number, any[]>();
  for (const asset of blocks || []) {
    const slot = parseSlot(asset?.uniqueName);
    if (slot === null) continue;
    bySlot.set(slot, [...(bySlot.get(slot) || []), asset]);
  }

  const tasks: (() => Promise<unknown>)[] = [];
  const setImage = (asset: any, url: string) => {
    if (asset.topLayerURL === url) return;
    tasks.push(() => asset.updateWebImageLayers("", url));
  };

  for (const [slot, assets] of bySlot) {
    const url = pieceArtUrl(host, theme, slot <= bricksPlaced ? pieceTypeForSlot(slot) : "transparent");
    assets.forEach((a) => setImage(a, url));
  }
  const flagUrl = pieceArtUrl(host, theme, bricksPlaced >= SLOT_COUNT ? "flag" : "transparent");
  (flags || []).forEach((a: any) => setImage(a, flagUrl));

  const results = await runLimited(tasks);
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.error(`reconcileFortPieces: ${failed} image update(s) failed; the next pass will retry`);

  const sparkleTargets = [
    ...sparkleSlots.flatMap((s) => bySlot.get(s) || []),
    ...(sparkleSlots.includes(SLOT_COUNT) ? flags || [] : []),
  ];
  sparkleTargets.forEach((asset: any) =>
    world
      .triggerParticle({ name: BRICK_PARTICLE_NAME, duration: 3, position: asset.position })
      .catch((error: unknown) => console.error("reconcileFortPieces: particle failed", error)),
  );

  const missingSlots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).filter((s) => !bySlot.has(s));
  return { missingSlots, flagFound: (flags || []).length > 0, updated: tasks.length - failed };
};
