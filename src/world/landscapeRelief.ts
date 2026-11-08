import { FOLIAGE_FOREST } from './foliageForestConfig';
import { GEOLOGY_FORMATIONS, geologyLocal } from './geologyData';
import { LAKE_RESERVATIONS, LAGOONS, riverSample, streamSample } from './geographicFeatures';
import { FAROLES_RELIEF } from './regionalReliefData';

const smooth=(a:number,b:number,n:number):number=>{
  const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);
};

/** Large, named silhouettes; the canonical sampler supplies every terrain LOD and collider. */
export const LANDSCAPE_LANDFORMS = [
  {id:'paredes-occidentales',x:-1040,z:-840,rx:350,rz:290,rise:145,kind:'ridge'},
  {id:'cordon-engranajes',x:-740,z:-1180,rx:420,rz:380,rise:200,kind:'ridge'},
  {id:'agujas-amanecer',x:235,z:-850,rx:290,rz:290,rise:235,kind:'ridge'},
  {id:'macizo-amanecer',x:275,z:-1310,rx:390,rz:420,rise:300,kind:'ridge'},
  {id:'crisol',x:-180,z:-1640,rx:440,rz:470,rise:420,kind:'volcano'},
  {id:'mesas-ocaso',x:-1330,z:-1690,rx:480,rz:580,rise:125,kind:'mesa'},
  {id:'escarpes-malditos',x:1050,z:-1790,rx:380,rz:460,rise:190,kind:'ridge'},
  {id:'pared-cascadas',x:1220,z:-910,rx:300,rz:270,rise:135,kind:'mesa'},
  {id:'colinas-del-sur',x:-510,z:30,rx:300,rz:170,rise:62,kind:'ridge'}
] as const;
const WATER_BASINS=[...LAKE_RESERVATIONS,...LAGOONS];
const SITES=[...FAROLES_RELIEF.protectedSites,{x:-300,z:-640,radius:38,blend:65},
  {x:-340,z:-565,radius:38,blend:65},{x:470,z:-1005,radius:60,blend:80}];

export function applyLandscapeRelief(x:number,z:number,base:number,roadMask:number,
  existingRoadClearance?:number):number {
  let risePower=0;
  for(const f of LANDSCAPE_LANDFORMS){
    const dx=(x-f.x)/f.rx,dz=(z-f.z)/f.rz;
    if(Math.abs(dx)>1.25||Math.abs(dz)>1.25)continue;
    const radius=Math.hypot(dx,dz);
    if(radius>=1.25)continue;
    let shape=1-smooth(f.kind==='mesa'?.35:0,1.25,radius);
    if(f.kind==='ridge')shape*=.9+.1*Math.cos(dx*4+dz*3);
    if(f.kind==='volcano')shape-=.32*(1-smooth(.06,.24,radius));
    // A smooth union avoids the hard crease produced by max(A, B) where two
    // mountain profiles meet, while keeping their large silhouettes.
    risePower+=Math.pow(Math.max(0,f.rise*shape),8);
  }
  const rise=Math.pow(risePower,1/8);
  if(rise===0||(existingRoadClearance===undefined?roadMask>=1:existingRoadClearance<=0))return base;
  // A 300 m mountain cannot meet a preserved road in a 38 m shoulder. Future
  // routes do not cut channels at all; existing ones retain their exact cores
  // with a transition whose width grows with the added elevation.
  const shoulderWidth=Math.max(90,rise*1.4);
  const roadWeight=existingRoadClearance===undefined?Math.pow(1-roadMask,2):
    smooth(0,shoulderWidth,existingRoadClearance);
  // Retain P1's access profiles and the inhabited core including triangle support.
  const core=FAROLES_RELIEF.protectedCore;
  const coreDistance=Math.hypot(Math.max(core.minX-x,0,x-core.maxX),
    Math.max(core.minZ-z,0,z-core.maxZ));
  const b=FAROLES_RELIEF.bounds;
  const pilotDistance=Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));
  let weight=Math.min(smooth(core.margin,core.margin+80,coreDistance),
    smooth(0,Math.max(160,shoulderWidth),pilotDistance),roadWeight);
  if(weight===0)return base;
  const forestDistance=Math.hypot((x-FOLIAGE_FOREST.x)/FOLIAGE_FOREST.radiusX,
    (z-FOLIAGE_FOREST.z)/FOLIAGE_FOREST.radiusZ);
  weight=Math.min(weight,smooth(1.04,1.40,forestDistance));
  for(const p of SITES)weight=Math.min(weight,
    smooth(p.radius,p.radius+Math.max(p.blend,shoulderWidth),Math.hypot(x-p.x,z-p.z)));
  for(const f of GEOLOGY_FORMATIONS){
    const p=geologyLocal(f,x,z),lo=f.kind==='canyon'?-f.depth*.5-65:-44;
    const hi=f.kind==='canyon'?f.depth*.5+65:f.depth+28;
    const distance=Math.hypot(Math.max(0,Math.abs(p.along)-f.length*.5-25),
      Math.max(0,lo-p.across,p.across-hi));
    weight=Math.min(weight,smooth(8,Math.max(100,shoulderWidth),distance));
  }
  for(const lake of WATER_BASINS)
    weight=Math.min(weight,smooth(1.08,1.5,Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ)));
  const river=riverSample(x,z),stream=streamSample(x,z);
  // The upper river's rendered shoreline searches banks up to 90 m away.
  // Preserve that complete valley floor, not only the narrow gameplay channel.
  const shoulder=river.width+22+(90-river.width-22)*smooth(18,24,river.level);
  weight=Math.min(weight,smooth(shoulder,shoulder+shoulderWidth,river.distance),
    smooth(stream.width+15,stream.width+Math.max(65,shoulderWidth),stream.distance));
  // Keep original sea and beaches instead of extending the island with mountains.
  weight*=smooth(.5,10,base);
  return base+rise*weight;
}
