/**
 * Reconcile a scene's fort pieces with `bricksPlaced`.
 *
 * Every pass looks the scene's pieces up and parses their unique names, so deleted, duplicated or re-added blocks are handled
 * without any cached ids: pieces whose image is wrong get swapped, missing slots are reported (never fatal).
 */
import { BRICK_PARTICLE_NAME, UNIQUE_NAMES } from "@shared/constants.js";
import { SLOT_COUNT, pieceTypeForSlot, type PieceType } from "@shared/fort/fort.js";
import type { FortTheme } from "@shared/types/index.js";

type Piece = PieceType | "transparent";

const FILES: Record<Piece, string> = {
  brick: "brick.png",
  towerTop: "tower-top.png",
  flag: "flag.png",
  transparent: "transparent.png",
};

/** Piece art lives in the sdk-fishers-and-forts S3 bucket, shared by every ecosystem (override with FORT_ART_BASE_URL). */
const FORT_ART_BASE_URL = process.env.FORT_ART_BASE_URL || "https://sdk-fishers-and-forts.s3.amazonaws.com";

export const pieceArtUrl = (theme: FortTheme, piece: Piece) => `${FORT_ART_BASE_URL}/${theme}/${FILES[piece]}`;

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
  sceneDropId,
  theme,
  bricksPlaced,
  sparkleSlots = [],
}: {
  world: any;
  /** Only this scene's blocks: another scene in the same world has its own fort. */
  sceneDropId: string;
  theme: FortTheme;
  bricksPlaced: number;
  /** Newly placed slots that get the sparkle particle. */
  sparkleSlots?: number[];
}) => {
  const blocks = await world.fetchDroppedAssetsBySceneDropId({ sceneDropId });

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
    const url = pieceArtUrl(theme, slot <= bricksPlaced ? pieceTypeForSlot(slot) : "transparent");
    assets.forEach((a) => setImage(a, url));
  }

  const results = await runLimited(tasks);
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.error(`reconcileFortPieces: ${failed} image update(s) failed; the next pass will retry`);

  sparkleSlots
    .flatMap((s) => bySlot.get(s) || [])
    .forEach((asset: any) =>
      world
        .triggerParticle({ name: BRICK_PARTICLE_NAME, duration: 3, position: asset.position })
        .catch((error: unknown) => console.error("reconcileFortPieces: particle failed", error)),
    );

  const missingSlots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).filter((s) => !bySlot.has(s));
  return { missingSlots, updated: tasks.length - failed };
};
