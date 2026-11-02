import { VertexData } from '@babylonjs/core';
import { WATERFALL, riverSample } from '../geographicFeatures';
import { sampleMainlandHeight } from '../terrainData';
import { nearTerrainHeightAt } from '../terrainLod';
import { dryWaterHeight, visualWaterLevel, visualWaterSurfaceAt } from './riverFlow';

// The boundaries sit on both the 1.5 m near grid and the 3 m far grid.
export const WATERFALL_CUT = Object.freeze({ minX: 480, maxX: 522, minZ: -1011, maxZ: -987 });
const STEP = .25;
const NX = (WATERFALL_CUT.maxX - WATERFALL_CUT.minX) / STEP;
const NZ = (WATERFALL_CUT.maxZ - WATERFALL_CUT.minZ) / STEP;
const EPS = 1e-6;
const clamp = (v:number,a:number,b:number) => Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{
  const t=clamp((v-a)/(b-a),0,1);
  return t*t*(3-2*t);
};
const waterfallLean=(x:number,z:number):number=>{
  const side=Math.min(smooth(0,3,x-WATERFALL_CUT.minX),
    smooth(0,3,WATERFALL_CUT.maxX-x));
  const along=z<=-1000?smooth(-1009,-1000,z):1-smooth(-1000,-987,z);
  return 4.5*side*along;
};
const terrainGrid=new Map<string,number>();
const terrainAtGrid=(x:number,z:number):number=>{
  const key=`${x}:${z}`;
  let h=terrainGrid.get(key);
  if(h===undefined){h=sampleMainlandHeight(x,z);terrainGrid.set(key,h);}
  return h;
};

/** Match the near terrain's six-metre triangles along the cascade banks. */
export function waterfallGroundAt(x:number,z:number):number{
  const analytic=sampleMainlandHeight(x,z);
  if(x<WATERFALL_CUT.minX-6||x>WATERFALL_CUT.maxX+6||
    z<WATERFALL_CUT.minZ-6||z>WATERFALL_CUT.maxZ+6)return analytic;
  const rendered=nearTerrainHeightAt(x,z,terrainAtGrid);
  return Math.max(analytic,rendered);
}

export function waterfallCutContainsCell(x:number,z:number,size:number):boolean{
  return x>=WATERFALL_CUT.minX-EPS && x+size<=WATERFALL_CUT.maxX+EPS &&
    z>=WATERFALL_CUT.minZ-EPS && z+size<=WATERFALL_CUT.maxZ+EPS;
}

export function waterfallCutTouchesChunk(cx:number,cz:number,size:number):boolean{
  const x=cx*size,z=cz*size;
  return x<WATERFALL_CUT.maxX && x+size>WATERFALL_CUT.minX &&
    z<WATERFALL_CUT.maxZ && z+size>WATERFALL_CUT.minZ;
}

type Point={x:number;z:number;drawZ:number;ground:number;raw:number;wet:boolean;shore:number;dryHeight:number};

/** A single indexed surface with quarter-metre spacing through the drop. */
export function createWaterfallGeometry():VertexData{
  const stride=NX+1;
  const points:Point[]=[];
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[];
  const index=(ix:number,iz:number)=>iz*stride+ix;
  for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){
    const x=WATERFALL_CUT.minX+ix*STEP,z=WATERFALL_CUT.minZ+iz*STEP;
    const drawZ=z+waterfallLean(x,z);
    const sourceGround=waterfallGroundAt(x,z);
    const ground=Math.max(sourceGround,waterfallGroundAt(x,drawZ));
    const surface=visualWaterSurfaceAt(x,z,sourceGround);
    const raw=surface?visualWaterLevel(x,z,surface):ground-.05;
    const depth=raw-ground;
    const wet=!!surface&&depth>.035;
    const renderedGround=nearTerrainHeightAt(x,drawZ,terrainAtGrid);
    const waterline=surface?raw:riverSample(x,z).level;
    const dryHeight=dryWaterHeight(ground,renderedGround,waterline);
    points.push({x,z,drawZ,ground,raw,wet,shore:wet?1-clamp(depth/.5,0,1):1,dryHeight});
  }
  const dirX=(502-500)/Math.hypot(2,6),dirZ=6/Math.hypot(2,6);
  for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){
    const p=points[index(ix,iz)];
    const border=Math.min(ix*STEP,(NX-ix)*STEP,iz*STEP,(NZ-iz)*STEP);
    const interior=clamp(border/1.5,0,1);
    const submerged=clamp((p.raw-p.ground-.25)/.9,0,1);
    let level=p.raw;
    if(p.wet&&interior>0&&submerged>0){
      let sum=0,count=0;
      for(let dz=-4;dz<=4;dz+=2)for(let dx=-4;dx<=4;dx+=2){
        const xx=ix+dx,zz=iz+dz;
        if(xx<0||xx>NX||zz<0||zz>NZ)continue;
        const near=points[index(xx,zz)];
        if(near.wet){sum+=near.raw;count++;}
      }
      if(count){
        const lower=Math.min(p.raw,sum/count);
        level=Math.max(p.ground+.15,p.raw-(p.raw-lower)*.7*interior*submerged);
      }
    }
    const fallT=clamp((WATERFALL.top-level)/(WATERFALL.top-WATERFALL.bottom),0,1);
    positions.push(p.x,p.wet?level+.035:p.dryHeight,p.drawZ);
    normals.push(0,1,0);
    const along=(p.x-500)*dirX+(p.drawZ-WATERFALL.topZ)*dirZ;
    const across=-(p.x-500)*dirZ+(p.drawZ-WATERFALL.topZ)*dirX;
    // The second UV follows approximate surface distance, including descent.
    uvs.push(across,along+Math.max(0,WATERFALL.top-level)*.5);
    const impact=clamp((fallT-.7)/.3,0,1)*interior;
    colors.push(p.shore,clamp((level-p.ground)/5,0,1),impact,1);
  }
  for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){
    const a=index(ix,iz),b=index(ix+1,iz),c=index(ix+1,iz+1),d=index(ix,iz+1);
    if(!points[a].wet&&!points[b].wet&&!points[c].wet&&!points[d].wet)continue;
    indices.push(a,b,c,a,c,d);
  }
  VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();
  data.positions=positions;data.normals=normals;data.uvs=uvs;data.colors=colors;data.indices=indices;
  return data;
}
