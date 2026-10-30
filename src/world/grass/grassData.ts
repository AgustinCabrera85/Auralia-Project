import { GEOLOGY_COMPOSITIONS } from '../geologyPresets';
import { geologyFaceExcludes } from '../geologyData';
import { waterSurfaceAt } from '../geographicFeatures';
import { biomeWeightsAt, geographyMasks, hash01, MAINLAND, ROAD_RESERVATIONS,
  sampleMainlandHeight } from '../terrainData';
import { terrainMaterialWeightsAt } from '../materials/TerrainMaterial';
import { propsForChunk } from '../worldPropsData';
import type { VegetationExclusion } from '../vegetationData';

export type GrassLod='near'|'medium';
export type GrassVariant='short'|'medium'|'tall';
export type GrassObstacle={x:number;z:number;radius:number};
export type GrassPlacement={x:number;y:number;z:number;yaw:number;
  width:number;height:number;tint:[number,number,number];flower:boolean};
export type GrassConfig=Readonly<{
  patchSize:number;nearDistance:number;farDistance:number;transitionDistance:number;
  nearCandidates:number;mediumCandidates:number;maxVisibleInstances:number;
  patchesPerFrame:number;density:number;height:number;width:number;colorVariation:number;
  windStrength:number;windSpeed:number;maxSlope:number;minGrassWeight:number;
  roadClearance:number;waterClearance:number;
}>;

export const GRASS_CONFIG:GrassConfig={
  patchSize:12,nearDistance:40,farDistance:74,transitionDistance:10,
  nearCandidates:140,mediumCandidates:24,maxVisibleInstances:12000,
  patchesPerFrame:3,density:1,height:1,width:1,colorVariation:.17,
  windStrength:.24,windSpeed:1,maxSlope:.58,minGrassWeight:.34,
  roadClearance:1.25,waterClearance:.45
};

export const GRASS_QUALITY:Record<'low'|'medium'|'high',Partial<GrassConfig>>={
  low:{nearDistance:32,farDistance:68,nearCandidates:38,mediumCandidates:11,
    maxVisibleInstances:3000,patchesPerFrame:2},
  medium:{nearDistance:40,farDistance:74,nearCandidates:140,mediumCandidates:24,
    maxVisibleInstances:12000,patchesPerFrame:3},
  high:{nearDistance:48,farDistance:90,nearCandidates:180,mediumCandidates:36,
    maxVisibleInstances:22000,patchesPerFrame:4}
};

const clamp=(value:number):number=>Math.max(0,Math.min(1,value));
const hash=(px:number,pz:number,index:number,salt:number):number=>
  hash01(px*131+index,pz*137+index*17,91731+salt);

/** Coarse, fixed terrain classification for a patch, independent of the player. */
export function grassRegionHasPotential(px:number,pz:number,
  config:GrassConfig=GRASS_CONFIG):boolean{
  for(const [dx,dz] of [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){
    const x=(px+dx)*config.patchSize,z=(pz+dz)*config.patchSize;
    const h=sampleMainlandHeight(x,z);
    if(h<MAINLAND.waterLevel+config.waterClearance)continue;
    const water=waterSurfaceAt(x,z);
    if(water&&h<water.level+config.waterClearance)continue;
    const step=1.4;
    const slope=Math.hypot(
      sampleMainlandHeight(x+step,z)-sampleMainlandHeight(x-step,z),
      sampleMainlandHeight(x,z+step)-sampleMainlandHeight(x,z-step)
    )/(2*step);
    if(slope>config.maxSlope*1.4)continue;
    if(terrainMaterialWeightsAt(x,z,h,slope)[0]>=config.minGrassWeight*.7)
      return true;
  }
  return false;
}

function distanceToRoad(x:number,z:number):number{
  let closest=Infinity;
  for(const road of ROAD_RESERVATIONS){
    if(!road.existing)continue;
    for(let i=1;i<road.points.length;i++){
      const [ax,az]=road.points[i-1],[bx,bz]=road.points[i];
      const dx=bx-ax,dz=bz-az;
      const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz));
      closest=Math.min(closest,Math.hypot(x-ax-dx*t,z-az-dz*t)-road.width*.5);
    }
  }
  return closest;
}

/** Existing rock placement data is the sole source for procedural stone avoidance. */
export function grassRockObstacles(cx:number,cz:number,
  exclusions:readonly VegetationExclusion[]):GrassObstacle[]{
  const rocks:GrassObstacle[]=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    for(const prop of propsForChunk(cx+dx,cz+dz,exclusions)){
      if(prop.kind!=='packRocas')continue;
      rocks.push({x:prop.x,z:prop.z,radius:(prop.worldRadius??(prop.rockDiameter??0)*.55)+.5});
    }
  }
  for(const composition of GEOLOGY_COMPOSITIONS)for(const piece of composition.pieces){
    const radius=piece.worldRadius??piece.rockDiameter??0;
    if(radius<=0||Math.abs(piece.x-(cx+.5)*MAINLAND.chunkSize)>MAINLAND.chunkSize*.5+radius+12||
      Math.abs(piece.z-(cz+.5)*MAINLAND.chunkSize)>MAINLAND.chunkSize*.5+radius+12)continue;
    rocks.push({x:piece.x,z:piece.z,radius:radius+.7});
  }
  return rocks;
}

/** Pure, seeded distribution in world coordinates; generation order has no effect. */
export function grassForPatch(px:number,pz:number,lod:GrassLod,
  exclusions:readonly VegetationExclusion[]=[],rocks:readonly GrassObstacle[]=[],
  config:GrassConfig=GRASS_CONFIG):GrassPlacement[]{
  const count=lod==='near'?config.nearCandidates:config.mediumCandidates;
  // Both LODs sample the same lattice and seed. Medium keeps a spatially
  // distributed subset, so a clump never jumps when its patch changes LOD.
  const columns=Math.ceil(Math.sqrt(config.nearCandidates));
  const rows=Math.ceil(config.nearCandidates/columns);
  const placements:GrassPlacement[]=[];
  const centerX=(px+.5)*config.patchSize,centerZ=(pz+.5)*config.patchSize;
  const centerHeight=sampleMainlandHeight(centerX,centerZ);
  const step=1.4;
  const centerSlope=Math.hypot(
    sampleMainlandHeight(centerX+step,centerZ)-sampleMainlandHeight(centerX-step,centerZ),
    sampleMainlandHeight(centerX,centerZ+step)-sampleMainlandHeight(centerX,centerZ-step)
  )/(2*step);
  const centerMasks=geographyMasks(centerX,centerZ);
  const centerGrassWeight=terrainMaterialWeightsAt(centerX,centerZ,centerHeight,centerSlope)[0];
  const biome=biomeWeightsAt(centerX,centerZ);
  const affinity=biome.valle+biome.ecos*.82+biome.sierras*.38+
    biome.nacar*.62+biome.costa*.25+biome.cumbres*.12;
  const localExclusions=exclusions.filter(e=>Math.abs(centerX-e.x)<e.radius+config.patchSize&&
    Math.abs(centerZ-e.z)<e.radius+config.patchSize);
  const localRocks=rocks.filter(rock=>Math.abs(centerX-rock.x)<rock.radius+config.patchSize&&
    Math.abs(centerZ-rock.z)<rock.radius+config.patchSize);
  for(let candidate=0;candidate<count;candidate++){
    const i=lod==='near'?candidate:
      Math.floor((candidate+.5)*config.nearCandidates/config.mediumCandidates);
    const x=(px+(i%columns+.12+.76*hash(px,pz,i,1))/columns)*config.patchSize;
    const z=(pz+(Math.floor(i/columns)+.12+.76*hash(px,pz,i,2))/rows)*config.patchSize;
    if(localExclusions.some(e=>Math.abs(x-e.x)<e.radius+.55&&Math.abs(z-e.z)<e.radius+.55&&
      Math.hypot(x-e.x,z-e.z)<e.radius+.55))continue;
    if(localRocks.some(rock=>Math.abs(x-rock.x)<rock.radius&&Math.abs(z-rock.z)<rock.radius&&
      Math.hypot(x-rock.x,z-rock.z)<rock.radius))continue;
    if(geologyFaceExcludes(x,z))continue;
    const h=sampleMainlandHeight(x,z);
    if(h<MAINLAND.waterLevel+config.waterClearance)continue;
    const water=waterSurfaceAt(x,z);
    if(water&&h<water.level+config.waterClearance)continue;
    if(centerMasks.road>.15&&distanceToRoad(x,z)<config.roadClearance)continue;
    const localRelief=centerSlope>.25||Math.abs(h-centerHeight)>1.5;
    const slope=localRelief?Math.hypot(
      sampleMainlandHeight(x+step,z)-sampleMainlandHeight(x-step,z),
      sampleMainlandHeight(x,z+step)-sampleMainlandHeight(x,z-step))/(2*step):centerSlope;
    if(slope>config.maxSlope)continue;
    const grassWeight=localRelief?
      terrainMaterialWeightsAt(x,z,h,slope)[0]:centerGrassWeight;
    if(grassWeight<config.minGrassWeight)continue;
    const noise=.78+.22*Math.sin(x*.19+Math.sin(z*.13))*Math.cos(z*.17-x*.09);
    const chance=clamp(grassWeight*affinity*config.density*1.38*noise*(1-.17*centerMasks.road));
    if(hash(px,pz,i,3)>chance)continue;
    const size=.82+.4*hash(px,pz,i,4);
    const tint=(hash(px,pz,i,5)*2-1)*config.colorVariation;
    placements.push({x,y:h+.025,z,yaw:hash(px,pz,i,6)*Math.PI*2,
      width:size*config.width,height:size*config.height,
      tint:[1+tint*.7,1+tint,1-tint*.3],
      flower:lod==='near'&&hash(px,pz,i,7)<.065*biome.valle});
  }
  return placements;
}
