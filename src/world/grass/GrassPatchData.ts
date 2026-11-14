import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import type {ActiveWorldGeography} from '../geography/ActiveGeography';
import {hash01} from '../terrainData';
import {nearTerrainHeightAt,nearTerrainSurfaceAt} from '../terrainLod';
import {grassHabitatSampler} from './GrassHabitat';
import {TRAVERSAL} from '../../game/traversalRules';
import {brisaliaPlatformWeight,brisaliaRoadEdge,inBrisaliaFootprint} from '../brisaliaLayout';

export const GRASS_PATCH={size:24,spacing:1.5,nearStart:30,nearEnd:46,
 detailFadeStart:72,detailEnd:96,fadeStart:180,farEnd:240,prefetch:48,
 maxNear:4096,maxSprites:16384,budgetMs:2.5,refreshDistance:6} as const;
export const GRASS_VARIANTS=['short','medium','tall','flower'] as const;
// SantiCharacter uses this same height to scale the avatar. Clumps have unit height.
export const GRASS_HEIGHT={min:TRAVERSAL.playerHeight*.5,max:TRAVERSAL.playerHeight*.75} as const;
export type GrassVariant=typeof GRASS_VARIANTS[number];
export type GrassPlacement={x:number;z:number;variant:GrassVariant;distant:boolean;matrix:Float32Array};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function noise(x:number,z:number,scale:number):number{
 const gx=Math.floor(x/scale),gz=Math.floor(z/scale),tx=smooth(x/scale-gx),tz=smooth(z/scale-gz);
 const a=hash01(gx,gz,784),b=hash01(gx+1,gz,784),c=hash01(gx,gz+1,784),d=hash01(gx+1,gz+1,784);
 return (a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz;
}
/** Continuous patches, independent of camera and sector boundaries. */
export function grassPatchDensity(x:number,z:number):number{
 const field=.7*noise(x,z,68)+.3*noise(x,z,23);
 return .06+.89*smooth((field-.22)/.48);
}
/** Small disposable height cache; roots sit on the same triangles as collision. */
export function* generateGrassPatchSteps(px:number,pz:number,world:ActiveWorldGeography,detail=true):Generator<void,GrassPlacement[],void>{
 const size=GRASS_PATCH.size,minX=px*size,minZ=pz*size;
 if(!world.source.isReady([minX-6,minZ-6,minX+size+6,minZ+size+6]))return [];
 const cache=new Map<string,number>(),heightAt=(x:number,z:number)=>{
  const key=x+':'+z;let h=cache.get(key);if(h===undefined){h=world.source.heightAt(x,z);cache.set(key,h);}return h;
 };
 const biome=world.biomeWeights(minX+12,minZ+12);
 const fertility=Math.max(.1,1-biome.costa*.8-biome.cumbres*.9-biome.sierras*.45);
 const isGreen=grassHabitatSampler(world.source),result:GrassPlacement[]=[];
 for(let iz=0;iz<16;iz++)for(let ix=0;ix<16;ix++){
  if(ix===0)yield;
  const gx=px*16+ix,gz=pz*16+iz;
  // A stable quarter of the same clumps supplies the distant silhouette.
  // Sparse patches skip all height/habitat work for the remaining candidates.
  const distant=gx%2===0&&gz%2===0;
  if(!detail&&!distant)continue;
  const x=(gx+.15+.7*hash01(gx,gz,300))*GRASS_PATCH.spacing;
  const z=(gz+.15+.7*hash01(gx,gz,301))*GRASS_PATCH.spacing;
  const localX=x-(world.town?.x??Infinity),localZ=z-(world.town?.z??Infinity);
  const village=world.town?brisaliaPlatformWeight(localX,localZ):0;
  // Broad, tall clumps cover the verge with fewer instances than short turf.
  const density=grassPatchDensity(x,z)*(1-village)+(.56+.18*noise(x,z,18))*village;
  if(hash01(gx,gz,302)>density*fertility)continue;
  // The old geography mask clears a whole circle around town. Only this
  // settlement uses its exact layout; other geographic road masks still apply.
  if(village>0&&(inBrisaliaFootprint(localX,localZ,.9)||brisaliaRoadEdge(localX,localZ)<1.1))continue;
  const surface=nearTerrainSurfaceAt(x,z,heightAt),slope=Math.hypot(surface.slopeX,surface.slopeZ);
  if(slope>.65||surface.height<=world.source.seaLevel+1.1)continue;
  if(!isGreen(x,z)||!isGreen(x-.6,z)||!isGreen(x+.6,z)||!isGreen(x,z-.6)||!isGreen(x,z+.6))continue;
  const water=world.waterAt(x,z),mask=world.masks(x,z);
  if(water&&surface.height<=water.level+.55||village===0&&(mask.road>.4||mask.existingRoadClearance<2))continue;
  const flowers=.015+village*(.025+.08*smooth((noise(x,z,14)-.35)/.4));
  const variant=hash01(gx,gz,303)>1-flowers?'flower':GRASS_VARIANTS[Math.floor(hash01(gx,gz,304)*3)];
  const width=.85+hash01(gx,gz,305)*.4+village*.35;
  const height=GRASS_HEIGHT.min+hash01(gx,gz,306)*(GRASS_HEIGHT.max-GRASS_HEIGHT.min);
  const matrix=Float32Array.from(Matrix.Compose(new Vector3(width,height,width),
   Quaternion.RotationAxis(Vector3.Up(),hash01(gx,gz,307)*Math.PI*2),new Vector3(x,surface.height,z)).m);
  matrix[1]=surface.slopeX*matrix[0]+surface.slopeZ*matrix[2];
  matrix[9]=surface.slopeX*matrix[8]+surface.slopeZ*matrix[10];
  // Sink a tiny margin at triangle creases, keeping the whole card footprint grounded.
  let gap=0;
  for(const [dx,dz] of [[.45,0],[-.45,0],[0,.45],[0,-.45]])
   gap=Math.max(gap,surface.height+surface.slopeX*dx+surface.slopeZ*dz-nearTerrainHeightAt(x+dx,z+dz,heightAt));
  matrix[13]-=gap+.018;
  result.push({x,z,variant,distant,matrix});
 }
 return result;
}
export function generateGrassPatch(px:number,pz:number,world:ActiveWorldGeography):GrassPlacement[]{
 const iterator=generateGrassPatchSteps(px,pz,world);let step=iterator.next();while(!step.done)step=iterator.next();return step.value;
}
