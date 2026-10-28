# Update 5A — Rock asset refactor

This update replaces the two remaining procedural sphere-rock sources with
individual primitives from `public/assets/world/rocks/Pack_rocas_1.glb`.
The 1K GLB remains unchanged and is imported only once.

- `TerrainStream.ts` streams **terrain only**, not procedural sphere rocks.
- `rockPackData.ts` selects one of **17** rock pieces per placement, with
  measured horizontal footprints and a target diameter in meters.
- `WorldPropSystem.ts` removes the original pack-layout offsets by centering
  each primitive on X/Z and grounding it at Y=0. Each thin-instance source
  receives only the matrix data for its own rock part.
- `WorldView.ts` reuses the GLB to visualize the existing stone and copper
  deposits. Its resource IDs, collection timers, counts and quests are unchanged.
- Copper deposits include a small amber low-poly vein; it is not a sphere.
- Procedural chunk placement uses stable seeds and remains non-persistent
  decoration. Resource nodes retain their previous IDs and save behavior.

## Verify locally

1. `npm install`, `npm run check`, `npm test`, `npm run build`.
2. Visit Brisalia stone deposits and collect stone/copper with **E**.
3. Look at the coastline and Altapiedra: no more pebble-like sphere placeholders.
4. Inspect a rocky chunk: the original group of 17 rocks must **not** appear
   together at each spawn; large, medium and gravel pieces should vary.
5. Travel away and back; decorative stones must stay in the same positions.
6. Ensure GLB textures, scale and resource nodes look right in the browser.

Limitations: terrain still uses vertex colors, other cliffs/formations remain
as separate GLBs, and the placeholder trees/buildings are not changed here.
The 1K pack is a required pre-existing asset; no binary files are replaced.
