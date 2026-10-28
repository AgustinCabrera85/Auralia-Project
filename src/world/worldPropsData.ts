import { ASSET_CATALOG, type AssetId } from './assetCatalog';
import { rockDiameterForPart, rockScaleForDiameter, selectRockPart } from './rockPackData';
import { RECT_ROCK_PARTS, rectRockSizing, selectRectRockPart } from './rectRockData';
import { waterSurfaceAt } from './geographicFeatures';
import { biomeWeightsAt, chunkOf, geographyMasks, hash01, isLand, isStarterArea, MAINLAND, sampleMainlandHeight, type Biome } from './terrainData';
import type { VegetationExclusion } from './vegetationData';

export const PROP_CONFIG={
  seed:43179,renderRadiusChunks:3,scaleVariation:.2,roadMaskLimit:.38,
  respawnMs:180000,
  candidatesPerChunk:{
    formacionRocosa:2,packRocas:16,escalonRocoso:2,rocasRectangulares:2,mesetaPasto:2,acantilado2:1,
    cristalAzul:1,cristalCeleste:1,cristalFuego:1
  }
} as const;

export type PropKind=keyof typeof PROP_CONFIG.candidatesPerChunk;
export type PropPlacement={
  id:string;kind:PropKind;x:number;y:number;z:number;scale:number;yaw:number;
  partIndex?:number;rockDiameter?:number;
  pieceIndex?:number;diameterMeters?:number;scaleXZ?:number;scaleY?:number;
  worldHeight?:number;worldRadius?:number;climbable?:boolean;
};
export const PROP_KINDS=Object.keys(PROP_CONFIG.candidatesPerChunk) as PropKind[];
export const CRYSTAL_KINDS:readonly PropKind[]=['cristalAzul','cristalCeleste','cristalFuego'];

/** Hand placed deposits complement the seeded fields near already explorable landmarks. */
export const FIXED_CRYSTALS=[
  {id:'crystal:ruina-caminos',kind:'cristalAzul',x:-160,z:-210},
  {id:'crystal:orilla-nacar',kind:'cristalCeleste',x:170,z:-260},
  {id:'crystal:altapiedra',kind:'cristalFuego',x:-410,z:-565}
] as const;
export const SPECIAL_ASSETS=[
  {id:'crisol-brisalia',kind:'crisolHerrero',x:23,z:-8,yOffset:0},
  {id:'isla-flotante-altaluz',kind:'islaFlotante',x:580,z:-1130,yOffset:95}
] as const;

const DENSITY:Record<PropKind,Partial<Record<Biome,number>>>= {
  formacionRocosa:{sierras:.32,cumbres:.38,ecos:.12},packRocas:{valle:.2,ecos:.2,sierras:.26,nacar:.24,costa:.12},
  escalonRocoso:{sierras:.24,cumbres:.2},rocasRectangulares:{sierras:.22,cumbres:.3},
  mesetaPasto:{valle:.14,nacar:.26,sierras:.12},acantilado2:{sierras:.18,cumbres:.28,costa:.22},
  cristalAzul:{ecos:.16,nacar:.04},cristalCeleste:{ecos:.04,nacar:.16,cumbres:.025},
  cristalFuego:{sierras:.13,cumbres:.08}
};
const crystal=(kind:PropKind):boolean=>CRYSTAL_KINDS.includes(kind);
const sampleSlope=(x:number,z:number):number=>{
  const d=3;
  return Math.hypot(sampleMainlandHeight(x+d,z)-sampleMainlandHeight(x-d,z),
    sampleMainlandHeight(x,z+d)-sampleMainlandHeight(x,z-d))/(2*d);
};

/** Pure chunk generator: coordinates and IDs never depend on loading order. */
export function propsForChunk(cx:number,cz:number,exclusions:readonly VegetationExclusion[]=[]):PropPlacement[]{
  const result:PropPlacement[]=[];
  for(const [kindIndex,kind] of PROP_KINDS.entries()){
    for(let i=0;i<PROP_CONFIG.candidatesPerChunk[kind];i++){
      const seed=PROP_CONFIG.seed+kindIndex*1009+i*29;
      // Natural small clusters instead of 17 rocks appearing as one pack.
      const cluster=i%3;
      const anchorX=(cx+hash01(cx,cz,PROP_CONFIG.seed+501+cluster*2))*MAINLAND.chunkSize;
      const anchorZ=(cz+hash01(cx,cz,PROP_CONFIG.seed+502+cluster*2))*MAINLAND.chunkSize;
      const angle=hash01(cx,cz,seed)*Math.PI*2;
      const radiusFromAnchor=2+hash01(cx,cz,seed+1)*12;
      const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
      const x=kind==='packRocas' ? clamp(anchorX+Math.cos(angle)*radiusFromAnchor,cx*MAINLAND.chunkSize+2,(cx+1)*MAINLAND.chunkSize-2)
        :kind==='rocasRectangulares'?cx*MAINLAND.chunkSize+17+hash01(cx,cz,seed)*(MAINLAND.chunkSize-34)
        :(cx+hash01(cx,cz,seed))*MAINLAND.chunkSize;
      const z=kind==='packRocas' ? clamp(anchorZ+Math.sin(angle)*radiusFromAnchor,cz*MAINLAND.chunkSize+2,(cz+1)*MAINLAND.chunkSize-2)
        :kind==='rocasRectangulares'?cz*MAINLAND.chunkSize+17+hash01(cx,cz,seed+1)*(MAINLAND.chunkSize-34)
        :(cz+hash01(cx,cz,seed+1))*MAINLAND.chunkSize;
      if(!isLand(x,z)||isStarterArea(x,z))continue;
      const h=sampleMainlandHeight(x,z),water=waterSurfaceAt(x,z);
      if(h<MAINLAND.waterLevel+.7||(water&&h<water.level+.8))continue;
      const masks=geographyMasks(x,z);
      if(masks.road>PROP_CONFIG.roadMaskLimit)continue;
      const partIndex=kind==='packRocas'?selectRockPart(hash01(cx,cz,seed+7)):undefined;
      const rockDiameter=partIndex===undefined?undefined:rockDiameterForPart(partIndex,hash01(cx,cz,seed+8));
      const pieceIndex=kind==='rocasRectangulares'?selectRectRockPart(hash01(cx,cz,seed+7)):undefined;
      const rectSize=pieceIndex===undefined?undefined:rectRockSizing(pieceIndex,hash01(cx,cz,seed+8),hash01(cx,cz,seed+9));
      const scale=rectSize?rectSize.scaleXZ:partIndex!==undefined
        ? rockScaleForDiameter(partIndex,rockDiameter!)
        : ASSET_CATALOG[kind].referenceScale*(1+PROP_CONFIG.scaleVariation*(2*hash01(cx,cz,seed+2)-1));
      const radius=rectSize?rectSize.broadphaseRadiusMeters+2:
        crystal(kind)?4:partIndex!==undefined?rockDiameter!*.55:Math.max(3,scale*.58);
      if(rectSize&&(x-cx*MAINLAND.chunkSize<radius||z-cz*MAINLAND.chunkSize<radius||
        (cx+1)*MAINLAND.chunkSize-x<radius||(cz+1)*MAINLAND.chunkSize-z<radius))continue;
      if(exclusions.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+radius))continue;
      if(rectSize&&[[radius,0],[-radius,0],[0,radius],[0,-radius]].some(([dx,dz])=>
        !isLand(x+dx,z+dz)||geographyMasks(x+dx,z+dz).road>PROP_CONFIG.roadMaskLimit))continue;
      if(sampleSlope(x,z)>(kind==='mesetaPasto'?.45:crystal(kind)?.62:kind==='acantilado2'?1.3:.9))continue;
      let baseHeight=h;
      if(!crystal(kind)){
        const foot=rectSize?rectSize.broadphaseRadiusMeters:
          partIndex!==undefined?rockDiameter!*.5:scale*(kind==='acantilado2'?.35:.32);
        const heights=[h,sampleMainlandHeight(x-foot,z),sampleMainlandHeight(x+foot,z),
          sampleMainlandHeight(x,z-foot),sampleMainlandHeight(x,z+foot)];
        if(Math.max(...heights)-Math.min(...heights)>(rectSize?Math.min(7,2+rectSize.diameterMeters*.2):kind==='acantilado2'?5:2.6))continue;
        if(rectSize)baseHeight=Math.min(...heights)-Math.min(.65,rectSize.diameterMeters*.035);
      }
      const weights=biomeWeightsAt(x,z),density=DENSITY[kind];
      let chance=0;
      for(const biome of ASSET_CATALOG[kind].biomes)chance+=weights[biome]*(density[biome]??0);
      if(hash01(cx,cz,seed+3)>chance)continue;
      if(partIndex!==undefined&&result.some(p=>p.kind==='packRocas'&&Math.hypot(p.x-x,p.z-z)<(p.rockDiameter!+rockDiameter!)*.38))continue;
      if(rectSize&&result.some(p=>p.kind==='rocasRectangulares'&&
        Math.hypot(p.x-x,p.z-z)<(p.worldRadius!+rectSize.broadphaseRadiusMeters+4)))continue;
      result.push({id:`prop:${kind}:${cx}:${cz}:${i}`,kind,x,y:baseHeight,z,scale,yaw:hash01(cx,cz,seed+4)*Math.PI*2,
        ...(partIndex===undefined?{}:{partIndex,rockDiameter}),
        ...(rectSize===undefined?{}:{pieceIndex,diameterMeters:rectSize.diameterMeters,
          scaleXZ:rectSize.scaleXZ,scaleY:rectSize.scaleY,worldHeight:rectSize.heightMeters,
          worldRadius:rectSize.broadphaseRadiusMeters,climbable:RECT_ROCK_PARTS[pieceIndex!].canHaveClimbRoute})});
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
