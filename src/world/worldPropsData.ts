import { ASSET_CATALOG, type AssetId } from './assetCatalog';
import { rockDiameterForPart, rockScaleForDiameter, selectRockPart } from './rockPackData';
import { waterSurfaceAt } from './geographicFeatures';
import { geologyFaceExcludes } from './geologyData';
import { biomeWeightsAt, chunkOf, geographyMasks, hash01, isLand, isStarterArea,
  MAINLAND, sampleMainlandHeight, type Biome } from './terrainData';
import type { VegetationExclusion } from './vegetationData';

export const PROP_CONFIG={
  seed:43179,renderRadiusChunks:3,scaleVariation:.2,roadMaskLimit:.38,
  respawnMs:180000,
  candidatesPerChunk:{packRocas:16,cristalAzul:1,cristalCeleste:1,cristalFuego:1}
} as const;

/** Large assets are available to global compositions, not random chunk candidates. */
export const GEOLOGY_ASSET_KINDS=[
  'formacionRocosa','escalonRocoso','rocasRectangulares','mesetaPasto','acantilado2'
] as const;
export type DecorativeKind=keyof typeof PROP_CONFIG.candidatesPerChunk;
export type PropKind=DecorativeKind|typeof GEOLOGY_ASSET_KINDS[number];
export type PropPlacement={
  id:string;kind:PropKind;x:number;y:number;z:number;scale:number;yaw:number;
  partIndex?:number;rockDiameter?:number;
  pieceIndex?:number;diameterMeters?:number;scaleXZ?:number;scaleY?:number;
  worldHeight?:number;worldRadius?:number;climbable?:boolean;
};
export const PROP_KINDS=Object.keys(PROP_CONFIG.candidatesPerChunk) as DecorativeKind[];
export const CRYSTAL_KINDS:readonly PropKind[]=['cristalAzul','cristalCeleste','cristalFuego'];

export const FIXED_CRYSTALS=[
  {id:'crystal:ruina-caminos',kind:'cristalAzul',x:-160,z:-210},
  {id:'crystal:orilla-nacar',kind:'cristalCeleste',x:170,z:-260},
  {id:'crystal:altapiedra',kind:'cristalFuego',x:-410,z:-565}
] as const;
export const SPECIAL_ASSETS=[
  {id:'crisol-brisalia',kind:'crisolHerrero',x:23,z:-8,yOffset:0},
  {id:'isla-flotante-altaluz',kind:'islaFlotante',x:580,z:-1130,yOffset:95}
] as const;

const DENSITY:Record<DecorativeKind,Partial<Record<Biome,number>>>= {
  packRocas:{valle:.2,ecos:.2,sierras:.26,nacar:.24,costa:.12},
  cristalAzul:{ecos:.16,nacar:.04},cristalCeleste:{ecos:.04,nacar:.16,cumbres:.025},
  cristalFuego:{sierras:.13,cumbres:.08}
};
const sampleSlope=(x:number,z:number):number=>{
  const d=3;
  return Math.hypot(sampleMainlandHeight(x+d,z)-sampleMainlandHeight(x-d,z),
    sampleMainlandHeight(x,z+d)-sampleMainlandHeight(x,z-d))/(2*d);
};

/** Only loose stones and deposits use per-chunk candidates. */
export function propsForChunk(cx:number,cz:number,exclusions:readonly VegetationExclusion[]=[]):PropPlacement[]{
  const result:PropPlacement[]=[];
  for(const [kindIndex,kind] of PROP_KINDS.entries()){
    for(let i=0;i<PROP_CONFIG.candidatesPerChunk[kind];i++){
      const seed=PROP_CONFIG.seed+kindIndex*1009+i*29;
      const cluster=i%3;
      const anchorX=(cx+hash01(cx,cz,PROP_CONFIG.seed+501+cluster*2))*MAINLAND.chunkSize;
      const anchorZ=(cz+hash01(cx,cz,PROP_CONFIG.seed+502+cluster*2))*MAINLAND.chunkSize;
      const angle=hash01(cx,cz,seed)*Math.PI*2;
      const distance=2+hash01(cx,cz,seed+1)*12;
      const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
      const x=kind==='packRocas'
        ?clamp(anchorX+Math.cos(angle)*distance,cx*MAINLAND.chunkSize+2,(cx+1)*MAINLAND.chunkSize-2)
        :(cx+hash01(cx,cz,seed))*MAINLAND.chunkSize;
      const z=kind==='packRocas'
        ?clamp(anchorZ+Math.sin(angle)*distance,cz*MAINLAND.chunkSize+2,(cz+1)*MAINLAND.chunkSize-2)
        :(cz+hash01(cx,cz,seed+1))*MAINLAND.chunkSize;
      if(!isLand(x,z)||isStarterArea(x,z)||geologyFaceExcludes(x,z))continue;
      const h=sampleMainlandHeight(x,z),water=waterSurfaceAt(x,z);
      if(h<MAINLAND.waterLevel+.7||(water&&h<water.level+.8))continue;
      if(geographyMasks(x,z).road>PROP_CONFIG.roadMaskLimit)continue;
      const partIndex=kind==='packRocas'?selectRockPart(hash01(cx,cz,seed+7)):undefined;
      const rockDiameter=partIndex===undefined?undefined:rockDiameterForPart(partIndex,hash01(cx,cz,seed+8));
      const scale=partIndex===undefined
        ?ASSET_CATALOG[kind].referenceScale*(1+PROP_CONFIG.scaleVariation*(2*hash01(cx,cz,seed+2)-1))
        :rockScaleForDiameter(partIndex,rockDiameter!);
      const radius=partIndex===undefined?4:rockDiameter!*.55;
      if(exclusions.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+radius))continue;
      if(sampleSlope(x,z)>(kind==='packRocas'?.9:.62))continue;
      if(partIndex!==undefined){
        const foot=rockDiameter!*.5;
        const heights=[h,sampleMainlandHeight(x-foot,z),sampleMainlandHeight(x+foot,z),
          sampleMainlandHeight(x,z-foot),sampleMainlandHeight(x,z+foot)];
        if(Math.max(...heights)-Math.min(...heights)>2.6)continue;
      }
      const weights=biomeWeightsAt(x,z),density=DENSITY[kind];
      let chance=0;
      for(const biome of ASSET_CATALOG[kind].biomes)chance+=weights[biome]*(density[biome]??0);
      if(hash01(cx,cz,seed+3)>chance)continue;
      if(partIndex!==undefined&&result.some(p=>p.kind==='packRocas'&&
        Math.hypot(p.x-x,p.z-z)<(p.rockDiameter!+rockDiameter!)*.38))continue;
      result.push({id:`prop:${kind}:${cx}:${cz}:${i}`,kind,x,y:h,z,scale,
        yaw:hash01(cx,cz,seed+4)*Math.PI*2,
        ...(partIndex===undefined?{}:{partIndex,rockDiameter})});
    }
  }
  for(const fixed of FIXED_CRYSTALS){
    const cell=chunkOf(fixed.x,fixed.z);
    if(cell.cx!==cx||cell.cz!==cz)continue;
    result.push({id:fixed.id,kind:fixed.kind,x:fixed.x,y:sampleMainlandHeight(fixed.x,fixed.z),z:fixed.z,
      scale:ASSET_CATALOG[fixed.kind].referenceScale,yaw:0});
  }
  return result;
}

export function assetCategoryFor(kind:AssetId):string{return ASSET_CATALOG[kind].category;}
