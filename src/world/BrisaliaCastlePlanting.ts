import { ASSET_CATALOG } from './assetCatalog';
import { BRISALIA_BUILDINGS, BRISALIA_SCALE, brisaliaRoadEdge } from './brisaliaLayout';
import { hash01, MAINLAND } from './terrainData';
import { terrainFootprintAt } from './terrainLod';
import type { VegetationExclusion, VegetationPlacement } from './vegetationData';

const castle=BRISALIA_BUILDINGS.find(b=>b.id==='B28')!;
const towers=[[-30,-26,5.22],[-30,26,5.22],[30,-26,5.22],[30,26,5.22],[-11.4,-27,4.45],[11.4,-27,4.45]];

/** Signed distance to the outside of the curtain and tower bases, in source metres.
 * The castle's rectangular culling footprint includes empty space beside its walls. */
export function castleExteriorDistance(x:number,z:number):number {
  const dx=Math.abs(x)-30.48,dz=Math.abs(z)-26.48;
  let distance=Math.hypot(Math.max(dx,0),Math.max(dz,0))+Math.min(Math.max(dx,dz),0);
  for(const [tx,tz,radius] of towers)distance=Math.min(distance,Math.hypot(x-tx,z-tz)-radius);
  return distance;
}

type Candidate=Omit<VegetationPlacement,'y'>;
let candidates:Candidate[]|undefined;
/** Seeded groups form a narrow, uneven border, with a clear stair/door corridor. */
export function castleBorderCandidates():readonly Candidate[] {
  if(candidates)return candidates;
  candidates=[];
  const yaw=castle.yaw*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw),spacing=.7;
  for(let iz=-52;iz<=50;iz++)for(let ix=-55;ix<=55;ix++){
    let x=(ix+.1+.8*hash01(ix,iz,821))*spacing,z=(iz+.1+.8*hash01(ix,iz,822))*spacing;
    const distance=castleExteriorDistance(x,z);
    if(distance<.26||distance>2.05||z<-24&&Math.abs(x)<8.8)continue;
    const patch=hash01(Math.floor(x/3.4),Math.floor(z/3.4),823);
    const outer=Math.max(0,(distance-.8)/1.25);
    if(hash01(ix,iz,824)>(.82+.18*patch)*(1-.82*outer))continue;
    const species=hash01(Math.floor(x/1.6),Math.floor(z/1.6),825);
    const kind=species<.62?'brisaliaMatorral':species<.92?'brisaliaYuyos':'brisaliaMargaritas';
    const scale=ASSET_CATALOG[kind].referenceScale*(1.02+.52*hash01(ix,iz,826))*(1-.28*outer);
    const radius=(kind==='brisaliaMatorral'?.52:.45)*scale;
    if(distance<(radius+.12)/BRISALIA_SCALE)continue;
    // Pull the seeded groups against the actual wall/tower outline. Roots stay
    // outside, while the back of the foliage meets the stone instead of leaving
    // a walkable strip between the wall and the plants.
    const contact=radius*(.38+.12*hash01(ix,iz,828))/BRISALIA_SCALE;
    for(let step=0;step<4;step++){
      const d=castleExteriorDistance(x,z),epsilon=.001;
      const nx=castleExteriorDistance(x+epsilon,z)-castleExteriorDistance(x-epsilon,z);
      const nz=castleExteriorDistance(x,z+epsilon)-castleExteriorDistance(x,z-epsilon);
      const length=Math.hypot(nx,nz);
      if(length<1e-8)break;
      x-=(d-contact)*nx/length;z-=(d-contact)*nz/length;
    }
    if(z<-24&&Math.abs(x)<8.8)continue;
    const localX=castle.x+(c*x+s*z)*BRISALIA_SCALE,localZ=castle.z+(-s*x+c*z)*BRISALIA_SCALE;
    if(brisaliaRoadEdge(localX,localZ)<radius+.4)continue;
    candidates.push({kind,x:localX,z:localZ,scale,yaw:hash01(ix,iz,827)*Math.PI*2,
      obstacleRadius:0,castleBorder:true});
  }
  return candidates;
}

/** Uses the existing streamed plant assets, LODs and terrain support. Only B28's
 * coarse tree exclusion is bypassed; player structures and other obstacles still win. */
export function castlePlantsForChunk(cx:number,cz:number,town:{x:number;z:number},
  exclusions:readonly VegetationExclusion[],heightAt:(x:number,z:number)=>number):VegetationPlacement[] {
  const result:VegetationPlacement[]=[],size=MAINLAND.chunkSize;
  if(Math.abs((cx+.5)*size-town.x-castle.x)>150+size/2||
    Math.abs((cz+.5)*size-town.z-castle.z)>150+size/2)return result;
  for(const candidate of castleBorderCandidates()){
    const x=town.x+candidate.x,z=town.z+candidate.z;
    if(Math.floor(x/size)!==cx||Math.floor(z/size)!==cz)continue;
    const radius=(candidate.kind==='brisaliaMatorral'?.52:.45)*candidate.scale;
    if(exclusions.some(e=>e.buildingId!=='B28'&&Math.hypot(x-e.x,z-e.z)<e.radius+radius))continue;
    const support=terrainFootprintAt(x,z,radius*.65,heightAt);
    if(support.maxSlope>.55||support.maxHeight-support.minHeight>.6)continue;
    result.push({...candidate,x,z,y:support.minHeight-.035});
  }
  return result;
}
