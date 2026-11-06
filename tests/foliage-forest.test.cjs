const assert = require('node:assert/strict');
const fs = require('node:fs');
const { installFoliageForestAssets } = require('../.test-build/world/foliageForestData.js');
const { FOLIAGE_FOREST, insideFoliageForest } = require('../.test-build/world/foliageForestConfig.js');
const { emptyWorldDocument, getWorldDocument, setWorldDocument } =
  require('../.test-build/world/editor/WorldEditState.js');
const { vegetationForChunk } = require('../.test-build/world/vegetationData.js');
const { propsForChunk } = require('../.test-build/world/worldPropsData.js');
const { chunkOf } = require('../.test-build/world/terrainData.js');
const { geologyFaceExcludes } = require('../.test-build/world/geologyData.js');
const { ASSET_CATALOG } = require('../.test-build/world/assetCatalog.js');

const glbInfo = file => {
  const bytes = fs.readFileSync(file);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  return { faces: json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce(
    (subtotal, primitive) => subtotal + json.accessors[primitive.indices].count / 3, 0), 0),
  materials: json.materials.map(material => material.name).sort() };
};

const data = JSON.parse(fs.readFileSync('public/world/foliage-v4-forest.json', 'utf8'));
const original = { id: 'editor-rock', assetId: 'packRocas', x: 400, z: -900,
  yOffset: 0, yaw: 0, scale: 1 };
setWorldDocument({ ...emptyWorldDocument(), assets: [original,
  { ...original, id: 'foliage-v4-forest-stale', assetId: 'v4TreeSoftEmerald' }] });
const count = installFoliageForestAssets(data);
const placements = getWorldDocument().assets;
assert.equal(count, 9306);
assert.equal(placements.length, count + 1);
assert.deepEqual(placements[0], original, 'unrelated editor assets remain');
assert.ok(!placements.some(p => p.id === 'foliage-v4-forest-stale'));
assert.equal(new Set(placements.map(p => p.id)).size, placements.length);
assert.ok(data.assets.every(p => insideFoliageForest(p.x, p.z)));
assert.ok(insideFoliageForest(-507, -260), 'the area in the reference screenshot belongs to the V4 biome');
assert.ok(!insideFoliageForest(-350, -285));
const trees = data.assets.filter(p => p.assetId.startsWith('v4Tree'));
const grass = data.assets.filter(p => p.assetId.startsWith('v4Grass') ||
  p.assetId.startsWith('v4Meadow'));
assert.equal(trees.length, 500);
assert.ok(grass.length > 6900);
assert.ok(data.assets.filter(p => p.collisionRadius === 0)
  .every(p => !geologyFaceExcludes(p.x, p.z)),
  'ground cover is clear of the structural cliff face');
assert.equal(grass.filter(p => Math.hypot(p.x + 448, p.z + 522) < 20).length, 0,
  'the visibly floating cliff-edge grass is removed');
assert.ok(trees.every(p => p.scale >= 1.45 && p.scale <= 1.88),
  'trees use the taller scale range');
assert.ok(grass.filter(p => Math.hypot(p.x + 507, p.z + 260) < 40).length >= 120,
  'the entry visible in the screenshot has continuous V4 grass');
assert.ok(grass.filter(p => Math.hypot(p.x + 504, p.z + 426) < 40).length >= 150,
  'the second screenshot area has meadow cover');
const bushes = data.assets.filter(p => p.assetId.startsWith('v4Bush'));
assert.equal(bushes.length, 280);
assert.ok(bushes.every(p => p.scale >= 1.1 && p.scale <= 1.42),
  'round bushes use the larger scale range');
const flowerCenter = FOLIAGE_FOREST.flowerMeadow;
const focalFlowers = data.assets.filter(p => p.id.includes('flower-meadow-'));
assert.ok(focalFlowers.length > 1200);
assert.ok(focalFlowers.every(p => Math.hypot(
  (p.x - flowerCenter.x) / flowerCenter.radiusX,
  (p.z - flowerCenter.z) / flowerCenter.radiusZ) < 1.1));

for (const id of ['v4GrassShort', 'v4GrassTall', 'v4GrassGolden',
  'v4MeadowPink', 'v4MeadowBlue', 'v4MeadowMixed']) {
  const asset = ASSET_CATALOG[id];
  assert.ok(asset.lodPath && asset.lodDistance < asset.renderDistance);
  const source = glbInfo(`public${asset.path}`);
  const lod = glbInfo(`public${asset.lodPath}`);
  assert.deepEqual(lod.materials, source.materials, `${id} keeps its V4 palette`);
  assert.ok(lod.faces / source.faces > .15 && lod.faces / source.faces < .30,
    `${id} uses an appropriately cheaper distant mesh`);
}

for (let x = FOLIAGE_FOREST.x - FOLIAGE_FOREST.radiusX; x < FOLIAGE_FOREST.x + FOLIAGE_FOREST.radiusX; x += 60)
  for (let z = FOLIAGE_FOREST.z - FOLIAGE_FOREST.radiusZ; z < FOLIAGE_FOREST.z + FOLIAGE_FOREST.radiusZ; z += 60) {
    const { cx, cz } = chunkOf(x, z);
    assert.ok(vegetationForChunk(cx, cz).every(p => !insideFoliageForest(p.x, p.z)),
      'legacy trees and plants stay out of the V4 biome');
    assert.ok(propsForChunk(cx, cz).every(p => !insideFoliageForest(p.x, p.z)),
      'legacy decorative props stay out of the V4 biome');
  }
console.log('✓ dense illustrated biome replaces legacy vegetation and props');
