import type { Biome } from './terrainData';

export type AssetCategory='vegetation'|'rocks'|'cliffs'|'crystals'|'structures'|'landmarks';
export type AssetInteraction='decorative'|'resource'|'landmark';
export type AssetInstantiation='thin'|'individual';
export type AssetDefinition={
  path:string;category:AssetCategory;biomes:readonly Biome[];
  referenceScale:number;interaction:AssetInteraction;instantiation:AssetInstantiation;
};

/** One URL per GLB. Existing trees keep their original project paths. */
export const ASSET_CATALOG={
  arbolito1:{path:'/assets/vegetation/Arbolito_1.glb',category:'vegetation',biomes:['valle','ecos'],referenceScale:15,interaction:'decorative',instantiation:'thin'},
  arbolito2:{path:'/assets/vegetation/Arbolito_2.glb',category:'vegetation',biomes:['ecos','valle'],referenceScale:17,interaction:'decorative',instantiation:'thin'},
  arbolito3:{path:'/assets/vegetation/Arbolito_3.glb',category:'vegetation',biomes:['ecos','valle','nacar'],referenceScale:20,interaction:'decorative',instantiation:'thin'},
  plantitas1:{path:'/assets/vegetation/plantitas_1.glb',category:'vegetation',biomes:['valle','ecos','nacar'],referenceScale:2.4,interaction:'decorative',instantiation:'thin'},
  arbolitoSeco:{path:'/assets/world/vegetation/Arbolito_sin_hojas.glb',category:'vegetation',biomes:['ecos','sierras'],referenceScale:14,interaction:'decorative',instantiation:'thin'},
  tronco1:{path:'/assets/world/vegetation/Tronco_1.glb',category:'vegetation',biomes:['ecos','valle'],referenceScale:7,interaction:'decorative',instantiation:'thin'},
  formacionRocosa:{path:'/assets/world/rocks/Formacion_rocosa_1.glb',category:'rocks',biomes:['sierras','cumbres','ecos'],referenceScale:9,interaction:'decorative',instantiation:'thin'},
  packRocas:{path:'/assets/world/rocks/Pack_rocas_1.glb',category:'rocks',biomes:['valle','ecos','nacar','sierras'],referenceScale:8,interaction:'decorative',instantiation:'thin'},
  escalonRocoso:{path:'/assets/world/rocks/Escalon_rocoso.glb',category:'rocks',biomes:['sierras','cumbres'],referenceScale:9,interaction:'decorative',instantiation:'thin'},
  rocasRectangulares:{path:'/assets/world/rocks/Set_Rocas_Rectanculares.glb',category:'rocks',biomes:['sierras','cumbres'],referenceScale:9,interaction:'decorative',instantiation:'thin'},
  mesetaPasto:{path:'/assets/world/rocks/Meseta_rocosa_pasto.glb',category:'rocks',biomes:['valle','nacar','sierras'],referenceScale:12,interaction:'decorative',instantiation:'thin'},
  acantilado2:{path:'/assets/world/cliffs/Acantilado_2.glb',category:'cliffs',biomes:['sierras','cumbres','costa'],referenceScale:19,interaction:'decorative',instantiation:'thin'},
  cristalAzul:{path:'/assets/world/crystals/Cristal_azul_flotante.glb',category:'crystals',biomes:['ecos','nacar'],referenceScale:4.8,interaction:'resource',instantiation:'individual'},
  cristalCeleste:{path:'/assets/world/crystals/Cristal_celeste_1.glb',category:'crystals',biomes:['ecos','nacar','cumbres'],referenceScale:6,interaction:'resource',instantiation:'individual'},
  cristalFuego:{path:'/assets/world/crystals/Cristal_de_Fuego.glb',category:'crystals',biomes:['sierras','cumbres'],referenceScale:5,interaction:'resource',instantiation:'individual'},
  crisolHerrero:{path:'/assets/world/structures/Crisol_Herrero.glb',category:'structures',biomes:['valle'],referenceScale:5,interaction:'decorative',instantiation:'individual'},
  islaFlotante:{path:'/assets/world/landmarks/Isla_flotante_2.glb',category:'landmarks',biomes:['cumbres'],referenceScale:90,interaction:'landmark',instantiation:'individual'}
} as const satisfies Record<string,AssetDefinition>;

export type AssetId=keyof typeof ASSET_CATALOG;
