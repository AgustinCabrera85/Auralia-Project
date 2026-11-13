import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AuraliaHeightAtlas } from '../src/auralia-preview/atlas.mjs';
import { createRiverChannelField } from '../src/auralia-preview/riverChannel.mjs';
import { FAR_SUBDIVISIONS, NEAR_SUBDIVISIONS } from '../src/auralia-preview/previewLod.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('public/auralia-preview/data/manifest.json', root)));
const splines = JSON.parse(await readFile(new URL('public/auralia-preview/data/splines.json', root)));
const atlas = new AuraliaHeightAtlas(manifest);
for (const tile of manifest.tiles) {
  const bytes = await readFile(new URL(`public${tile.heightFile}`, root));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = new Uint16Array(manifest.resolution ** 2);
  for (let i = 0; i < height.length; i++) height[i] = view.getUint16(i * 2, true);
  atlas.tiles.set(`${tile.cx},${tile.cz}`, { ...tile, height });
}
const channel = createRiverChannelField(atlas, splines);
const byCell = new Map(manifest.tiles.map(tile => [`${tile.cx},${tile.cz}`, tile]));
let checks = 0, maxGap = 0;
function coarseAt(tile, edge, index) {
  const low = Math.min(FAR_SUBDIVISIONS - 1, Math.floor(index / 4));
  const t = index / 4 - low;
  const at = i => channel.tileVertexHeight(tile,
    edge === 'west' ? 0 : edge === 'east' ? FAR_SUBDIVISIONS : i,
    edge === 'north' ? 0 : edge === 'south' ? FAR_SUBDIVISIONS : i,
    FAR_SUBDIVISIONS);
  return at(low) * (1 - t) + at(low + 1) * t;
}
function compare(a, b, edgeA, edgeB) {
  for (let i = 0; i <= NEAR_SUBDIVISIONS; i++) {
    const fine = channel.tileVertexHeight(a,
      edgeA === 'west' ? 0 : edgeA === 'east' ? NEAR_SUBDIVISIONS : i,
      edgeA === 'north' ? 0 : edgeA === 'south' ? NEAR_SUBDIVISIONS : i,
      NEAR_SUBDIVISIONS);
    const coarse = coarseAt(b, edgeB, i);
    const gap = Math.abs(fine - coarse);
    maxGap = Math.max(maxGap, gap);
    assert.ok(gap < 0.03, `${a.id}/${b.id} ${edgeA}/${edgeB} sample ${i}: ${gap} m`);
    checks++;
  }
}
for (const tile of manifest.tiles) {
  const east = byCell.get(`${tile.cx + 1},${tile.cz}`);
  const south = byCell.get(`${tile.cx},${tile.cz + 1}`);
  if (east) compare(tile, east, 'east', 'west');
  if (south) compare(tile, south, 'south', 'north');
}
assert.equal(checks, 40 * (NEAR_SUBDIVISIONS + 1));
console.log(`World Studio LOD: ${checks} edge samples, maximum gap ${maxGap.toFixed(5)} m`);
