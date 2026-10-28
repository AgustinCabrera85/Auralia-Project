/** Internal pieces of the 1K Pack_rocas_1.glb; keep source node positions out of instances. */
export type RockPartGroup = 'large' | 'medium' | 'gravel';

// Horizontal GLB bounds measured from the 17 mesh primitives. Do not re-use
// the original pack's scene layout (each mesh has a different node offset).
export const ROCK_PART_FOOTPRINTS = [
  0.234840, 0.497070, 0.328766, 0.497070, 0.240707, 0.189827, 0.221130,
  0.152641, 0.168297, 0.107632, 0.041096, 0.056751, 0.033268,
  0.211357, 0.166344, 0.221130, 0.140900
] as const;
export const ROCK_PART_COUNT = ROCK_PART_FOOTPRINTS.length;

const LARGE = [0, 1, 2, 3, 4, 5, 6] as const;
const MEDIUM = [7, 8, 9, 13, 14, 15, 16] as const;
const GRAVEL = [10, 11, 12] as const;

export function rockPartGroup(index: number): RockPartGroup {
  if (index >= 0 && index <= 6) return 'large';
  if (index >= 10 && index <= 12) return 'gravel';
  return 'medium';
}

/** Stable selector: 35% large, 45% medium, 20% gravel. */
export function selectRockPart(value: number): number {
  const u = Math.max(0, Math.min(0.999999999, value));
  if (u < 0.35) return LARGE[Math.floor(u / 0.35 * LARGE.length)];
  if (u < 0.80) return MEDIUM[Math.floor((u - 0.35) / 0.45 * MEDIUM.length)];
  return GRAVEL[Math.floor((u - 0.80) / 0.20 * GRAVEL.length)];
}

/** Actual in-world diameter. Never flatten models by reducing only Y. */
export function rockDiameterForPart(partIndex: number, u: number): number {
  const t = Math.max(0, Math.min(1, u));
  switch (rockPartGroup(partIndex)) {
    case 'large': return 1.4 + 1.8 * t;
    case 'medium': return 0.45 + 0.80 * t;
    case 'gravel': return 0.12 + 0.28 * t;
  }
}

export function rockScaleForDiameter(partIndex: number, diameter: number): number {
  const width = ROCK_PART_FOOTPRINTS[partIndex];
  if (!width || !Number.isFinite(diameter) || diameter <= 0)
    throw new Error(`Invalid rock dimensions: part=${partIndex}, diameter=${diameter}`);
  return diameter / width;
}
