import type { AssetDefinition } from './assetCatalog';

/** Shared road furniture. Keep the supplied GLBs intact; inscriptions are per site. */
export const WAYFINDING_ASSETS={
  wayfindingBoard:{path:'/assets/wayfinding/Board.glb',category:'structures',biomes:['valle','ecos','sierras','cumbres','costa','nacar'],referenceScale:1,interaction:'decorative',instantiation:'individual',collisionRadius:.35,renderDistance:220},
  wayfindingLamp:{path:'/assets/wayfinding/Lamp.glb',category:'structures',biomes:['valle','ecos','sierras','cumbres','costa','nacar'],referenceScale:1,interaction:'decorative',instantiation:'individual',collisionRadius:.35,renderDistance:220},
  wayfindingPointer1:{path:'/assets/wayfinding/Pointer1.glb',category:'structures',biomes:['valle','ecos','sierras','cumbres','costa','nacar'],referenceScale:1,interaction:'decorative',instantiation:'individual',collisionRadius:.18,renderDistance:220},
  wayfindingPointer2:{path:'/assets/wayfinding/Pointer2.glb',category:'structures',biomes:['valle','ecos','sierras','cumbres','costa','nacar'],referenceScale:1,interaction:'decorative',instantiation:'individual',collisionRadius:.18,renderDistance:220}
} as const satisfies Record<string,AssetDefinition>;
export type WayfindingAsset=keyof typeof WAYFINDING_ASSETS;
