import { LAKE_RESERVATIONS, streamSample } from './geographicFeatures';
import { FAROLES_RELIEF, type ReliefProfilePoint } from './regionalReliefData';

const smooth=(a:number,b:number,value:number):number=>{
  const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*(3-2*t);
};

/** Compact support with zero slope at either boundary; no global noise/caches. */
export function farolesRegionWeight(x:number,z:number):number {
  const b=FAROLES_RELIEF.bounds;
  return smooth(0,b.blend,Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z));
}

function profileAt(x:number,z:number,points:readonly ReliefProfilePoint[]):
  {distance:number;height:number} {
  let distance=Infinity,height=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
    if(d<distance){distance=d;height=a[2]+(b[2]-a[2])*t;}
  }
  return {distance,height};
}

/** Macro landforms precede the existing water/geology pass and optional edits.
 * The same result feeds terrain vertices, collisions, props and map generation.
 * roadMask protects the exact historical corridors, including near-grid vertices.
 */
export function applyRegionalRelief(x:number,z:number,base:number,roadMask:number):number {
  let weight=farolesRegionWeight(x,z);
  if(weight===0||roadMask>=1)return base;
  const core=FAROLES_RELIEF.protectedCore;
  const coreDistance=Math.hypot(Math.max(core.minX-x,0,x-core.maxX),
    Math.max(core.minZ-z,0,z-core.maxZ));
  weight*=smooth(core.margin,core.margin+core.blend,coreDistance)*(1-roadMask);
  if(weight===0)return base;
  for(const site of FAROLES_RELIEF.protectedSites)
    weight*=smooth(site.radius,site.radius+site.blend,Math.hypot(x-site.x,z-site.z));
  // Keep the existing beds and banks. P2 will design new water only after P1.
  const stream=streamSample(x,z);
  weight*=smooth(stream.width+8,stream.width+23,stream.distance);
  for(const lake of LAKE_RESERVATIONS){
    const ellipse=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
    weight*=smooth(1.08,1.32,ellipse);
  }
  if(weight===0)return base;

  let height=base;
  for(const feature of FAROLES_RELIEF.features){
    const radius=Math.hypot((x-feature.x)/feature.radiusX,(z-feature.z)/feature.radiusZ);
    const influence=(1-smooth(feature.inner,feature.outer,radius))*feature.strength;
    if(feature.kind==='ridge')height+=feature.height*influence;
    else height+=(feature.height-height)*influence;
  }
  const gorge=FAROLES_RELIEF.gorge;
  const reach=smooth(gorge.minZ,gorge.minZ+gorge.endBlend,z)*
    (1-smooth(gorge.maxZ-gorge.endBlend,gorge.maxZ,z));
  height+=gorge.rise*reach*smooth(gorge.innerBank,gorge.crest,stream.distance)*
    (1-smooth(gorge.crest,gorge.outerBank,stream.distance));

  for(const access of FAROLES_RELIEF.approaches){
    const p=profileAt(x,z,access.points);
    const influence=1-smooth(access.width,access.width+access.blend,p.distance);
    height+=(p.height-height)*influence;
  }
  return base+(height-base)*weight;
}
