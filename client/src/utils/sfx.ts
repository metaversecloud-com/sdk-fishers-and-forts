/**
 * UI sound effects. Files are TBD from Shelby — until they land these are no-ops,
 * so call sites are already wired up.
 */
export type SfxName = "drill" | "fish" | "specialFish" | "number" | "lakeFinished" | "perfectLake" | "brickPlaced" | "milestone";

const SOURCES: Partial<Record<SfxName, string>> = {
  // TODO(art): add Shelby's files, e.g. drill: "/assets/sfx/drill.mp3"
};

export const playSfx = (name: SfxName) => {
  const src = SOURCES[name];
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.6;
    audio.play().catch(() => undefined);
  } catch {
    // Audio unavailable — ignore.
  }
};
