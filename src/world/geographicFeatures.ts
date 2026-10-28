/** Stable geographic definitions and samplers shared by terrain, streaming, collision and maps. */
export type WaterPoint={x:number;z:number;level:number;width:number};
export type LakeDefinition={name:string;x:number;z:number;radiusX:number;radiusZ:number;level:number;depth:number};
export type WaterSample={level:number;kind:'river'|'stream'|'lake'|'lagoon';distance:number;edge:number};

export const MAIN_RIVER:readonly WaterPoint[]=[
  {x:450,z:-1800,level:96,width:10},{x:520,z:-1500,level:80,width:11},
  {x:520,z:-1200,level:55,width:12},{x:500,z:-1060,level:24,width:13},
  {x:500,z:-1010,level:18,width:13},{x:500,z:-1007,level:18,width:13},
  {x:502,z:-1001,level:10,width:13},{x:500,z:-900,level:8,width:14},
  {x:430,z:-680,level:5,width:15},
  {x:450,z:-500,level:3,width:16},{x:450,z:-380,level:1.9,width:16},
  {x:500,z:-320,level:1.4,width:17},{x:385,z:-270,level:.8,width:19},
  {x:390,z:-100,level:.6,width:18},{x:220,z:50,level:.35,width:18},
  {x:150,z:200,level:.05,width:20},{x:120,z:250,level:-.15,width:23},
  {x:120,z:290,level:-.15,width:26}
];

export const STREAMS:readonly {name:string;points:readonly WaterPoint[]}[]=[
  {name:'Arroyo del Prado',points:[
    {x:110,z:-340,level:10,width:4},{x:130,z:-235,level:7,width:5},
    {x:155,z:-125,level:4,width:5},{x:230,z:-100,level:1.5,width:6},
    {x:330,z:-47,level:.5,width:7}
  ]}
];

export const RIVER_RESERVATION:readonly (readonly [number,number])[]=MAIN_RIVER.map(p=>[p.x,p.z]);
export const LAKE_RESERVATIONS:readonly LakeDefinition[]=[
  {name:'Lago de Nácar',x:335,z:-255,radiusX:160,radiusZ:132,level:.75,depth:7},
  {name:'Cuenca de los Humedales',x:800,z:-610,radiusX:245,radiusZ:190,level:.3,depth:3.5}
];
export const LAGOONS:readonly LakeDefinition[]=[
  {name:'Laguna del Juncal',x:1050,z:-365,radiusX:48,radiusZ:39,level:.35,depth:2.2},
  {name:'Laguna de las Garzas',x:1080,z:-710,radiusX:43,radiusZ:35,level:.25,depth:2}
];
export const LAKE_ISLANDS=[
  {x:350,z:-268,radius:19,rise:3.2},
  {x:325,z:-215,radius:14,rise:2.5}
] as const;

export const MOUNTAIN_FORMATIONS=[
  {kind:'ridge',x:-700,z:-1350,radiusX:210,radiusZ:85,height:17},
  {kind:'plateau',x:-440,z:-820,radiusX:90,radiusZ:95,height:9},
  {kind:'cliff',x:-950,z:-1750,radiusX:120,radiusZ:75,height:15},
  {kind:'pass',x:-520,z:-990,radiusX:80,radiusZ:155,height:-12}
] as const;
export const COAST_FORMATIONS=[
  {kind:'cove',x:-1680,z:-240,radiusX:135,radiusZ:100,height:-10},
  {kind:'cliff',x:1710,z:-720,radiusX:105,radiusZ:140,height:13},
  {kind:'beach',x:-630,z:185,radiusX:165,radiusZ:90,height:-4}
] as const;

export const BRIDGE={x:155,z:-133,level:7.8,halfLength:22,halfWidth:6,approachLength:10} as const;
export const WATERFALL={x:501,z:-1004,topZ:-1007,bottomZ:-1001,top:18,bottom:10,width:23} as const;

const RELIEF_FORMATIONS=[...MOUNTAIN_FORMATIONS,...COAST_FORMATIONS] as const;
const WATER_BASINS=[
  ...LAKE_RESERVATIONS.map(lake=>({...lake,kind:'lake' as const})),
  ...LAGOONS.map(lake=>({...lake,kind:'lagoon' as const}))
] as const;
const WATER_ROUTES=[{points:MAIN_RIVER,depth:2.4},{points:STREAMS[0].points,depth:1.1}] as const;
const PROTECTED_SITES=[
  {x:245,z:-250,r:21},{x:265,z:-205,r:18},{x:285,z:-194,r:18},
  {x:300,z:-160,r:18},{x:-350,z:-285,r:22},{x:-275,z:-535,r:24},
  {x:200,z:-660,r:25},{x:33,z:120,r:24}
] as const;

const clamp=(n:number,a:number,b:number):number=>Math.max(a,Math.min(b,n));
const smooth=(a:number,b:number,n:number):number=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
const gaussian=(x:number,z:number,cx:number,cz:number,rx:number,rz:number):number=>Math.exp(-(((x-cx)/rx)**2)-(((z-cz)/rz)**2));

function routeSample(x:number,z:number,points:readonly WaterPoint[]):{distance:number;level:number;width:number}{
  let best={distance:Infinity,level:0,width:0};
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
    if(distance<best.distance)best={distance,level:a.level+(b.level-a.level)*t,width:a.width+(b.width-a.width)*t};
  }
  return best;
}

export function riverSample(x:number,z:number):{distance:number;level:number;width:number}{return routeSample(x,z,MAIN_RIVER);}
export function streamSample(x:number,z:number):{distance:number;level:number;width:number}{
  return STREAMS.map(s=>routeSample(x,z,s.points)).reduce((a,b)=>a.distance<b.distance?a:b);
}

export function waterSurfaceAt(x:number,z:number):WaterSample|null{
  const river=riverSample(x,z),stream=streamSample(x,z);
  let result:WaterSample|null=river.distance<river.width?{
    level:river.level,kind:'river',distance:river.distance,edge:clamp((river.width-river.distance)/3,0,1)
  }:null;
  if(stream.distance<stream.width&&(!result||stream.level>result.level))result={
    level:stream.level,kind:'stream',distance:stream.distance,edge:clamp((stream.width-stream.distance)/2,0,1)
  };
  for(const lake of WATER_BASINS){
      const ellipse=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
      if(ellipse<.94&&(!result||lake.level>result.level))result={
        level:lake.level,kind:lake.kind,distance:ellipse,edge:clamp((.94-ellipse)/.07,0,1)
      };
  }
  return result;
}

export function bridgeDeckAt(x:number,z:number):number|null{
  const dx=x-BRIDGE.x,dz=z-BRIDGE.z;
  const along=dx*.8-dz*.6,across=-dx*.6-dz*.8;
  if(Math.abs(across)>=BRIDGE.halfWidth)return null;
  if(along>=-BRIDGE.halfLength&&along<=BRIDGE.halfLength)return BRIDGE.level;
  if(along>=-BRIDGE.halfLength-BRIDGE.approachLength&&along<-BRIDGE.halfLength){
    return BRIDGE.level-.8*(-BRIDGE.halfLength-along)/BRIDGE.approachLength;
  }
  return null;
}

/** Apply local relief only; existing town and outpost foundations remain at their old heights. */
export function applyGeographicRelief(x:number,z:number,base:number):number{
  if(Math.abs(x)<125&&z>-125&&z<170)return base;
  let height=base;
  for(const feature of RELIEF_FORMATIONS){
    const ellipse=Math.hypot((x-feature.x)/feature.radiusX,(z-feature.z)/feature.radiusZ);
    if(feature.kind==='plateau'){
      const blend=1-smooth(.5,1,ellipse);
      height=height*(1-blend)+32*blend;
    } else if(feature.kind==='cliff'){
      height+=feature.height*(1-smooth(.45,.73,ellipse));
    } else {
      height+=feature.height*gaussian(x,z,feature.x,feature.z,feature.radiusX,feature.radiusZ);
    }
  }
  for(const lake of WATER_BASINS){
    const ellipse=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
    if(ellipse>=1)continue;
    const blend=1-smooth(.73,1,ellipse);
    const bed=lake.level-lake.depth*(1-ellipse*ellipse);
    height=Math.min(height,height*(1-blend)+bed*blend);
  }
  for(const route of WATER_ROUTES){
    const {distance,level,width}=routeSample(x,z,route.points);
    if(distance>=width+18)continue;
    const blend=1-smooth(width*.72,width+18,distance);
    height=Math.min(height,height*(1-blend)+(level-route.depth)*blend);
  }
  for(const island of LAKE_ISLANDS){
    const d=Math.hypot(x-island.x,z-island.z);
    const rise=island.rise*(1-smooth(island.radius*.4,island.radius,d));
    if(rise>0)height=Math.max(height,LAKE_RESERVATIONS[0].level-.35+rise);
  }
  // Existing route to Nácar stays above the widened lake as a low causeway.
  const causeway=1-smooth(16,36,Math.hypot(x-237,z+186));
  if(causeway>0)height=Math.max(height,LAKE_RESERVATIONS[0].level+1.4*causeway);
  // The old lakeside homes and landmarks become dry banks or small islands.
  let protection=0;
  for(const p of PROTECTED_SITES)protection=Math.max(protection,1-smooth(p.r,p.r+18,Math.hypot(x-p.x,z-p.z)));
  return height*(1-protection)+base*protection;
}

export function isInlandWater(x:number,z:number,ground:number):boolean{
  const water=waterSurfaceAt(x,z);
  return water!==null&&ground<water.level-.03&&bridgeDeckAt(x,z)===null;
}

/** Cheap broad-phase for a 72 m terrain cell. */
export function waterNearChunk(cx:number,cz:number,size:number):boolean{
  const x=(cx+.5)*size,z=(cz+.5)*size,r=size*.72+35;
  if(riverSample(x,z).distance<r||streamSample(x,z).distance<r)return true;
  return WATER_BASINS.some(l=>Math.abs(x-l.x)<l.radiusX+r&&Math.abs(z-l.z)<l.radiusZ+r);
}
