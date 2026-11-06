/* Deterministic World Editor placements for the illustrated foliage benchmark. */
const fs = require('node:fs');
const path = require('node:path');
const { FOLIAGE_FOREST } = require('../.test-build/world/foliageForestConfig.js');
const { ASSET_CATALOG } = require('../.test-build/world/assetCatalog.js');
const { ROAD_RESERVATIONS, geographyMasks, isLand, sampleMainlandHeight } = require('../.test-build/world/terrainData.js');
const { waterSurfaceAt } = require('../.test-build/world/geographicFeatures.js');
const { geologyFaceExcludes } = require('../.test-build/world/geologyData.js');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'public/world/foliage-v4-forest.json');

let seed = 20261106;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const round = value => Math.round(value * 1000) / 1000;
const distanceToPath = (x, z, points) => {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
};
const distanceToTrail = (x, z) => distanceToPath(x, z, FOLIAGE_FOREST.trailPoints);
const visibleRoads = ROAD_RESERVATIONS.filter(route => route.existing);
const distanceToVisibleRoad = (x, z) => Math.min(...visibleRoads
  .map(route => distanceToPath(x, z, route.points) - route.width * .5));
// Broad V4 grass cards must fit on the same terrain surface, clear of cliff faces.
const groundPatchFits = (x, z, reach = 2.7) => {
  const center = sampleMainlandHeight(x, z);
  if (geologyFaceExcludes(x, z)) return false;
  for (const [dx, dz] of [[reach,0],[-reach,0],[0,reach],[0,-reach],
    [reach,reach],[reach,-reach],[-reach,reach],[-reach,-reach]]) {
    if (geologyFaceExcludes(x + dx, z + dz) ||
      Math.abs(sampleMainlandHeight(x + dx, z + dz) - center) > 1.15)
      return false;
  }
  return true;
};

const specs = [
  { id: 'v4TreeSoftEmerald', count: 135, radius: 1.6, slope: .48, trail: 10, clearing: 34 },
  { id: 'v4TreeBroadMeadow', count: 125, radius: 1.8, slope: .48, trail: 10, clearing: 34 },
  { id: 'v4TreeTallClouds', count: 120, radius: 1.5, slope: .48, trail: 10, clearing: 34 },
  { id: 'v4TreeLeaningSunlit', count: 120, radius: 1.6, slope: .48, trail: 10, clearing: 34 },
  { id: 'v4BushRoundLime', count: 100, radius: 2, slope: .55, trail: 7, clearing: 26 },
  { id: 'v4BushFlowerWhite', count: 90, radius: 2, slope: .55, trail: 7, clearing: 26 },
  { id: 'v4BushFlowerPink', count: 90, radius: 2, slope: .55, trail: 7, clearing: 26 },
  { id: 'v4HedgeSoftRectangle', count: 6, radius: .7, slope: .45, trail: 7, clearing: 25 },
  { id: 'v4HedgeFlowerWhite', count: 6, radius: .7, slope: .45, trail: 7, clearing: 25 },
  { id: 'v4HedgeFlowerBlue', count: 6, radius: .7, slope: .45, trail: 7, clearing: 25 },
  { id: 'v4GrassShort', count: 520, radius: 0, slope: .3, trail: 3, clearing: 0, clustered: true },
  { id: 'v4GrassTall', count: 300, radius: 0, slope: .3, trail: 3, clearing: 0, clustered: true },
  { id: 'v4GrassGolden', count: 220, radius: 0, slope: .3, trail: 3, clearing: 0, clustered: true },
  { id: 'v4MeadowPink', count: 90, radius: 0, slope: .28, trail: 3, clearing: 0, clustered: true },
  { id: 'v4MeadowBlue', count: 85, radius: 0, slope: .28, trail: 3, clearing: 0, clustered: true },
  { id: 'v4MeadowMixed', count: 65, radius: 0, slope: .28, trail: 3, clearing: 0, clustered: true },
  { id: 'v4GroundClover', count: 130, radius: 0, slope: .32, trail: 3, clearing: 0, clustered: true },
  { id: 'v4FlowerPink', count: 35, radius: 0, slope: .32, trail: 3, clearing: 0, clustered: true },
  { id: 'v4FlowerWhite', count: 20, radius: 0, slope: .32, trail: 3, clearing: 0, clustered: true },
  { id: 'v4FlowerBlue', count: 30, radius: 0, slope: .32, trail: 3, clearing: 0, clustered: true },
  { id: 'v4FlowerYellow', count: 20, radius: 0, slope: .32, trail: 3, clearing: 0, clustered: true },
  { id: 'v4IvyGround', count: 65, radius: 0, slope: .3, trail: 4, clearing: 0, clustered: true },
  { id: 'v4NatureIslandTree', count: 3, radius: 2.1, slope: .35, trail: 16, clearing: 45 },
  { id: 'v4NatureIslandBush', count: 3, radius: 2.1, slope: .35, trail: 9, clearing: 30 }
];

const clusterCenters = [
  [-700, -390], [-760, -455], [-810, -400], [-625, -455], [-845, -510],
  [-520, -400], [-920, -350], [-730, -310], [-730, -420], [-505, -265],
  [-570, -320], [-620, -300], [-640, -560], [-790, -580], [-930, -450],
  [-1000, -400], [-860, -270], [-690, -235], [-485, -455]
];
const treePositions = [];
const generated = [];
for (const spec of specs) {
  const entry = ASSET_CATALOG[spec.id];
  if (!entry || !fs.existsSync(path.join(root, 'public', entry.path.replace(/^\//, ''))))
    throw new Error(`Missing catalog GLB for ${spec.id}`);
  let placed = 0;
  for (let attempt = 0; attempt < spec.count * 250 && placed < spec.count; attempt++) {
    let x, z;
    if (spec.clustered) {
      const [cx, cz] = clusterCenters[Math.floor(random() * clusterCenters.length)];
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 37;
      x = cx + Math.cos(angle) * radius;
      z = cz + Math.sin(angle) * radius;
    } else {
      x = FOLIAGE_FOREST.x + (random() * 2 - 1) * FOLIAGE_FOREST.radiusX;
      z = FOLIAGE_FOREST.z + (random() * 2 - 1) * FOLIAGE_FOREST.radiusZ;
    }
    const ellipse = ((x - FOLIAGE_FOREST.x) / FOLIAGE_FOREST.radiusX) ** 2 +
      ((z - FOLIAGE_FOREST.z) / FOLIAGE_FOREST.radiusZ) ** 2;
    if (ellipse > 1 || !isLand(x, z)) continue;
    if (spec.radius === 0 && !groundPatchFits(x, z)) continue;
    if (Math.hypot(x - FOLIAGE_FOREST.x, z - FOLIAGE_FOREST.z) < spec.clearing) continue;
    if (distanceToTrail(x, z) < spec.trail) continue;
    const y = sampleMainlandHeight(x, z);
    const water = waterSurfaceAt(x, z);
    if (water && y < water.level + .8) continue;
    if (spec.radius > 0 ? geographyMasks(x, z).road > .5 :
      distanceToVisibleRoad(x, z) < 2.5) continue;
    const slope = Math.hypot(sampleMainlandHeight(x + 1, z) - sampleMainlandHeight(x - 1, z),
      sampleMainlandHeight(x, z + 1) - sampleMainlandHeight(x, z - 1)) * .5;
    if (slope > spec.slope) continue;
    if (spec.id.startsWith('v4Tree') && treePositions.some(p => Math.hypot(x - p.x, z - p.z) < 8.5)) continue;
    if (spec.id.startsWith('v4Tree')) treePositions.push({ x, z });
    generated.push({
      id: `foliage-v4-forest-${spec.id}-${placed}`,
      assetId: spec.id,
      x: round(x), z: round(z), yOffset: 0,
      yaw: round(random() * Math.PI * 2),
      scale: round(spec.id.startsWith('v4Tree') ? 1.45 + random() * .43 :
        spec.id.startsWith('v4Bush') ? 1.10 + random() * .32 :
        spec.id==='v4NatureIslandBush' ? 1.08 + random() * .25 :
        spec.id.startsWith('v4Grass') || spec.id.startsWith('v4Meadow')
          ? .9 + random() * .35 : .88 + random() * .24),
      collisionRadius: spec.radius
    });
    placed++;
  }
  if (placed < spec.count) throw new Error(`${spec.id}: only ${placed}/${spec.count} valid placements`);
}

// A jittered grid forms a continuous low meadow between the authored clusters.
// Grass sources are widened in X/Z at draw time, while their vertical size stays intact.
const fillStep = 6.25;
let fillCount = 0;
for (let gx = FOLIAGE_FOREST.x - FOLIAGE_FOREST.radiusX; gx <= FOLIAGE_FOREST.x + FOLIAGE_FOREST.radiusX; gx += fillStep)
  for (let gz = FOLIAGE_FOREST.z - FOLIAGE_FOREST.radiusZ; gz <= FOLIAGE_FOREST.z + FOLIAGE_FOREST.radiusZ; gz += fillStep) {
    const x = gx + (random() - .5) * fillStep * .55;
    const z = gz + (random() - .5) * fillStep * .55;
    const ellipse = ((x - FOLIAGE_FOREST.x) / FOLIAGE_FOREST.radiusX) ** 2 +
      ((z - FOLIAGE_FOREST.z) / FOLIAGE_FOREST.radiusZ) ** 2;
    if (ellipse > 1 || random() < .12 || !isLand(x, z)) continue;
    if (!groundPatchFits(x, z)) continue;
    if (distanceToTrail(x, z) < 3.2) continue;
    const y = sampleMainlandHeight(x, z);
    const water = waterSurfaceAt(x, z);
    if ((water && y < water.level + .8) || distanceToVisibleRoad(x, z) < 2.5) continue;
    const slope = Math.hypot(sampleMainlandHeight(x + 1, z) - sampleMainlandHeight(x - 1, z),
      sampleMainlandHeight(x, z + 1) - sampleMainlandHeight(x, z - 1)) * .5;
    if (slope > .32) continue;
    const variant = random();
    const assetId = variant < .53 ? 'v4GrassShort' : variant < .82 ? 'v4GrassTall' : 'v4GrassGolden';
    generated.push({
      id: `foliage-v4-forest-grass-fill-${fillCount}`,
      assetId, x: round(x), z: round(z), yOffset: 0,
      yaw: round(random() * Math.PI * 2),
      scale: round(.95 + random() * .22), collisionRadius: 0
    });
    fillCount++;
  }

// A compact flower meadow gives the biome a distinct destination instead of
// sprinkling single blooms uniformly across the entire forest.
const meadow = FOLIAGE_FOREST.flowerMeadow;
const meadowPoint = () => {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random());
  return [meadow.x + Math.cos(angle) * radius * meadow.radiusX,
    meadow.z + Math.sin(angle) * radius * meadow.radiusZ];
};
const validMeadowPoint = (x, z) => {
  if (!isLand(x, z) || distanceToVisibleRoad(x, z) < 2.5 ||
    !groundPatchFits(x, z)) return false;
  const y = sampleMainlandHeight(x, z), water = waterSurfaceAt(x, z);
  if (water && y < water.level + .8) return false;
  return Math.hypot(sampleMainlandHeight(x + 1, z) - sampleMainlandHeight(x - 1, z),
    sampleMainlandHeight(x, z + 1) - sampleMainlandHeight(x, z - 1)) * .5 < .3;
};
let flowerCount = 0;
for (let bouquet = 0; bouquet < 210; bouquet++) {
  let center;
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = meadowPoint();
    if (validMeadowPoint(...candidate)) { center = candidate; break; }
  }
  if (!center) throw new Error(`No valid floral bouquet ${bouquet}`);
  const stems = 4 + Math.floor(random() * 5);
  for (let stem = 0; stem < stems; stem++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 2.8;
    const x = center[0] + Math.cos(angle) * radius;
    const z = center[1] + Math.sin(angle) * radius;
    if (!validMeadowPoint(x, z)) continue;
    const color = random();
    const assetId = color < .52 ? 'v4FlowerPink' : color < .78 ? 'v4FlowerBlue' :
      color < .91 ? 'v4FlowerWhite' : 'v4FlowerYellow';
    generated.push({ id: `foliage-v4-forest-flower-meadow-${flowerCount}`,
      assetId, x: round(x), z: round(z), yOffset: 0,
      yaw: round(random() * Math.PI * 2), scale: round(1.05 + random() * .3),
      collisionRadius: 0 });
    flowerCount++;
  }
}
for (let patch = 0; patch < 180; patch++) {
  let point;
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = meadowPoint();
    if (validMeadowPoint(...candidate)) { point = candidate; break; }
  }
  if (!point) throw new Error(`No valid floral meadow patch ${patch}`);
  const type = random();
  const assetId = type < .52 ? 'v4MeadowPink' : type < .82 ? 'v4MeadowBlue' : 'v4MeadowMixed';
  generated.push({ id: `foliage-v4-forest-meadow-patch-${patch}`,
    assetId, x: round(point[0]), z: round(point[1]), yOffset: 0,
    yaw: round(random() * Math.PI * 2), scale: round(1.03 + random() * .28),
    collisionRadius: 0 });
}

fs.writeFileSync(outputPath, `${JSON.stringify({ version: 1, assets: generated }, null, 2)}\n`);
console.log(`Bosque Ilustrado: ${generated.length} V4 assets, ${treePositions.length} trees, ${fillCount} grass fill, ${flowerCount} focal flowers.`);
