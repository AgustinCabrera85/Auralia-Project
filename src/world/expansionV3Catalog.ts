import type { AssetDefinition } from './assetCatalog';
import type { Biome } from './terrainData';

// Auralia Trees & Wetlands Expansion V3: bark/alpha atlases are embedded in each GLB.
const tree=(file:string,biomes:readonly Biome[],radius=1.1):AssetDefinition=>({
  path:`/assets/expansion-v3/${file}.glb`,category:'vegetation',biomes,
  referenceScale:1.7,collisionRadius:radius,interaction:'decorative',
  instantiation:'thin',renderDistance:560,lodDistance:150,
  lodPath:`/assets/expansion-v3/${file}_LOD1.glb`
});
const wetland=(file:string,lod=false,surface:'terrain'|'water'='terrain'):AssetDefinition=>({
  path:`/assets/expansion-v3/${file}.glb`,category:'vegetation',biomes:['nacar','valle'],
  referenceScale:1.25,collisionRadius:0,interaction:'decorative',
  instantiation:'thin',renderDistance:155,surface,
  ...(lod?{lodDistance:65,lodPath:`/assets/expansion-v3/${file}_LOD1.glb`}:{})
});

/** Flowering groves, riverbank trees and shallow-water flora, also available in the editor. */
export const EXPANSION_V3_ASSETS={
  v3TreeWillowWeeping:tree('Tree_Willow_01_Weeping',['nacar','valle'],1.25),
  v3TreeWillowOld:tree('Tree_Willow_02_Old_Spreading',['nacar'],1.4),
  v3TreeWillowLeaning:tree('Tree_Willow_03_Leaning_Bank',['nacar','valle']),
  v3TreeCherryPink:tree('Tree_Cherry_01_PinkBloom',['valle','ecos']),
  v3TreeCherryWhite:tree('Tree_Cherry_02_WhiteBloom',['valle','ecos']),
  v3TreeCherryTwin:tree('Tree_Cherry_03_TwistedTwin',['ecos','valle']),
  v3TreeJacarandaViolet:tree('Tree_Jacaranda_01_Violet',['nacar','valle']),
  v3TreeJacarandaWide:tree('Tree_Jacaranda_02_Wide_Canopy',['nacar','valle']),
  v3TreeRiverSarandi:tree('Tree_River_01_Sarandi',['nacar','valle']),
  v3TreeRiverFork:tree('Tree_River_02_Broad_Fork',['nacar','valle']),
  v3WetlandTotoraTall:wetland('Wetland_01_Totora_Tall',true),
  v3WetlandTotoraLow:wetland('Wetland_02_Totora_Low'),
  v3WetlandJuncosDense:wetland('Wetland_03_Juncos_Dense',true),
  v3WetlandJuncosSparse:wetland('Wetland_04_Juncos_Sparse'),
  v3WetlandCyperus:wetland('Wetland_05_Cyperus'),
  v3WetlandIrisYellow:wetland('Wetland_06_Iris_Yellow'),
  v3WetlandLilyWhite:wetland('Wetland_07_Nenufar_White',false,'water'),
  v3WetlandLilyPink:wetland('Wetland_08_Nenufar_Pink',false,'water'),
  v3WetlandCamalote:wetland('Wetland_09_Camalote_Violet',false,'water'),
  v3WetlandDuckweed:wetland('Wetland_10_Lenteja_Agua',false,'water'),
  v3WetlandFern:wetland('Wetland_11_Helecho_Humedo'),
  v3WetlandBankFlowers:wetland('Wetland_12_Flores_Ribera'),
  v3WetlandMixedShore:wetland('Wetland_13_Orilla_Mixta',true)
} as const;
export type ExpansionV3Id=keyof typeof EXPANSION_V3_ASSETS;
