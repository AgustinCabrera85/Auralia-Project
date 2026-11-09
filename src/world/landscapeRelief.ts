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
  {id:'colinas-del-sur',x:-510,z:30,rx:300,rz:170,rise:62,kind:'hills'}
] as const;

/** Broad geological structure, resolved by the existing terrain grid. The
 * crests meander, have saddles and buttresses, instead of circular domes.
 * Fine cracks belong to materials; these features are tens of metres wide. */
export function landformShape(dx:number,dz:number,kind:string,phase:number):number {
  const angle=phase*.61,c=Math.cos(angle),s=Math.sin(angle);
  const u=dx*c-dz*s,v=dx*s+dz*c;
  const warpedU=u+.10*Math.sin(v*4+phase);
  const warpedV=v+.11*Math.sin(u*3-phase);
  const radius=Math.hypot(warpedU,warpedV);
  const edge=1-smooth(.05,1.25,Math.hypot(dx,dz));
  if(kind==='hills'){
    const lobes=.66+.17*Math.cos(u*5+.7)+.17*Math.cos(v*6-u*2);
    return edge*lobes;
  }
  if(kind==='volcano'){
    const cone=1-smooth(0,1.25,radius);
    const caldera=.33*(1-smooth(.08,.28,radius));
    const angle=Math.atan2(warpedV,warpedU);
    const gullies=(.5+.5*Math.cos(angle*7+radius*3))*.10*
      smooth(.24,.55,radius)*(1-smooth(.85,1.25,radius));
    return Math.max(0,cone-caldera-gullies)*edge**.15;
  }
  if(kind==='mesa'){
    const rim=radius+.05*Math.sin(u*8+v*4)+.035*Math.sin(v*11);
    return (1-smooth(.32,1.17,rim))*edge**.12;
  }
  const spine=warpedV-.12*Math.sin(warpedU*5+phase);
  const ridge=Math.exp(-spine*spine*5.5);
  const saddles=.75+.25*Math.cos(warpedU*7+phase*.7);
  const spurs=.5+.5*Math.cos(warpedU*9+Math.sin(v*3)*1.4+phase);
  // Raised shoulders break up the flank, but fade at the summit and boundary.
  return edge*(.22+.72*ridge*saddles+.24*spurs*(1-ridge));
}
const WATER_BASINS=[...LAKE_RESERVATIONS,...LAGOONS];
const SITES=[...FAROLES_RELIEF.protectedSites,{x:-300,z:-640,radius:38,blend:65},
  {x:-340,z:-565,radius:38,blend:65},{x:470,z:-1005,radius:60,blend:80}];

export function applyLandscapeRelief(x:number,z:number,base:number,roadMask:number,
  existingRoadClearance?:number):number {
  let risePower=0;
  for(const [index,f] of LANDSCAPE_LANDFORMS.entries()){
    const dx=(x-f.x)/f.rx,dz=(z-f.z)/f.rz;
    if(Math.abs(dx)>1.25||Math.abs(dz)>1.25)continue;
    const radius=Math.hypot(dx,dz);
    if(radius>=1.25)continue;
    const shape=landformShape(dx,dz,f.kind,index+1);
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
