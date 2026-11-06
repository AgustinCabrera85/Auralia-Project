import type { Biome } from './terrainData';
import type { AssetDefinition } from './assetCatalog';

const foliage = (
  file: string,
  biomes: readonly Biome[],
  referenceScale: number,
  collisionRadius: number,
  renderDistance: number,
  lodDistance?: number,
  horizontalScale?: number
): AssetDefinition => ({
  path: `/assets/foliage-v4/${file}.glb`,
  category: 'vegetation',
  biomes,
  referenceScale,
  interaction: 'decorative',
  instantiation: 'thin',
  collisionRadius,
  renderDistance,
  ...(horizontalScale === undefined ? {} : { horizontalScale }),
  ...(lodDistance === undefined ? {} : {
    lodPath: `/assets/foliage-v4/${file}_LOD1.glb`,
    lodDistance
  })
});

/** Illustrated V4 models are paintable in World Editor; their GLBs load on demand. */
export const FOLIAGE_V4_ASSETS = {
  v4TreeSoftEmerald: foliage('Tree_01_Soft_Emerald', ['valle', 'ecos'], 1.7, 1.6, 650, 180),
  v4TreeBroadMeadow: foliage('Tree_02_Broad_Meadow', ['valle', 'nacar'], 1.7, 1.8, 650, 180),
  v4TreeTallClouds: foliage('Tree_03_Tall_Clouds', ['valle', 'ecos'], 1.7, 1.5, 650, 180),
  v4TreeLeaningSunlit: foliage('Tree_04_Leaning_Sunlit', ['valle', 'nacar'], 1.7, 1.6, 650, 180),
  v4BushRoundLime: foliage('Bush_01_Round_Lime', ['valle', 'ecos'], 1.65, 2, 260, 85),
  v4BushFlowerWhite: foliage('Bush_02_Round_Flower_White', ['valle', 'nacar'], 1.75, 2, 260, 85),
  v4BushFlowerPink: foliage('Bush_03_Round_Flower_Pink', ['valle', 'ecos'], 2.1, 2, 260, 85),
  v4HedgeSoftRectangle: foliage('Hedge_01_Soft_Rectangle', ['valle'], 1.2, 0.7, 260, 85),
  v4HedgeFlowerWhite: foliage('Hedge_02_Flower_White', ['valle', 'nacar'], 1.2, 0.7, 260, 85),
  v4HedgeFlowerBlue: foliage('Hedge_03_Flower_Blue', ['valle', 'nacar'], 1.2, 0.7, 260, 85),
  v4IvyHorizontal: foliage('Ivy_01_Horizontal', ['valle', 'ecos'], 1, 0, 150),
  v4IvyHanging: foliage('Ivy_02_Hanging', ['valle', 'ecos'], 1, 0, 150),
  v4IvyCorner: foliage('Ivy_03_Corner', ['valle', 'ecos'], 1, 0, 150),
  v4IvyGround: foliage('Ivy_04_Ground', ['valle', 'ecos'], 1, 0, 150),
  v4GrassShort: foliage('Grass_01_Short', ['valle', 'nacar'], 1.3, 0, 255, 92, 1.6),
  v4GrassTall: foliage('Grass_02_Tall', ['valle', 'ecos'], 1.25, 0, 255, 92, 1.6),
  v4GrassGolden: foliage('Grass_03_Golden', ['valle', 'sierras'], 1.25, 0, 255, 92, 1.6),
  v4MeadowPink: foliage('Meadow_01_Pink', ['valle', 'ecos'], 1.25, 0, 240, 88, 1.35),
  v4MeadowBlue: foliage('Meadow_02_Blue', ['valle', 'nacar'], 1.25, 0, 240, 88, 1.35),
  v4MeadowMixed: foliage('Meadow_03_Mixed', ['valle'], 1.25, 0, 240, 88, 1.35),
  v4GroundClover: foliage('Ground_01_Clover', ['valle', 'nacar'], 1.2, 0, 110),
  v4FlowerPink: foliage('Flower_01_Pink', ['valle', 'ecos'], 1, 0, 120),
  v4FlowerWhite: foliage('Flower_02_White', ['valle', 'nacar'], 1, 0, 120),
  v4FlowerBlue: foliage('Flower_03_Blue', ['valle', 'nacar'], 1, 0, 120),
  v4FlowerYellow: foliage('Flower_04_Yellow', ['valle', 'sierras'], 1, 0, 120),
  v4NatureIslandTree: foliage('Nature_Island_01_Tree', ['valle', 'ecos'], 1.3, 2.1, 550, 180),
  v4NatureIslandBush: foliage('Nature_Island_02_Bush', ['valle', 'ecos'], 1.6, 2.1, 300, 100)
} as const;
