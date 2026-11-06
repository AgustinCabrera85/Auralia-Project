/** Stable coordinates for the illustrated foliage performance forest. */
export const FOLIAGE_FOREST = {
  id: 'bosque-ilustrado',
  name: 'Bosque Ilustrado',
  x: -730,
  z: -420,
  radiusX: 330,
  radiusZ: 260,
  clearingRadius: 26,
  flowerMeadow: { id: 'pradera-florida-v4', name: 'Pradera Florida V4',
    x: -790, z: -510, radiusX: 70, radiusZ: 48 },
  trailPoints: [
    [-350,-285],[-430,-310],[-520,-340],[-620,-380],[-730,-420],[-840,-465]
  ] as readonly (readonly [number,number])[]
} as const;

/** Shared biome boundary for placement, rendering and legacy-content exclusions. */
export function insideFoliageForest(x: number, z: number): boolean {
  const dx = (x - FOLIAGE_FOREST.x) / FOLIAGE_FOREST.radiusX;
  const dz = (z - FOLIAGE_FOREST.z) / FOLIAGE_FOREST.radiusZ;
  return dx * dx + dz * dz <= 1;
}
