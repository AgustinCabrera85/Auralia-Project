import { insideFoliageForest } from './foliageForestConfig';
import { getWorldDocument, parseWorldDocument } from './editor/WorldEditState';

const FOREST_PREFIX = 'foliage-v4-forest-';

/** Keep the generated benchmark in a tracked file, separate from editor saves. */
export function installFoliageForestAssets(data: unknown): number {
  const parsed = parseWorldDocument(data);
  const forest = parsed.assets.filter(asset =>
    asset.id.startsWith(FOREST_PREFIX) && asset.assetId.startsWith('v4') &&
    insideFoliageForest(asset.x, asset.z));
  if (forest.length === 0) throw new Error('Bosque Ilustrado sin colocaciones V4');
  const world = getWorldDocument();
  world.assets = [
    ...world.assets.filter(asset => !asset.id.startsWith(FOREST_PREFIX)),
    ...forest
  ];
  return forest.length;
}

export async function loadFoliageForestAssets(): Promise<number> {
  const response = await fetch('/world/foliage-v4-forest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Bosque Ilustrado HTTP ${response.status}`);
  return installFoliageForestAssets(await response.json());
}
