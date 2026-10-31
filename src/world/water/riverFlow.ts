import { LAKE_RESERVATIONS, LAGOONS, MAIN_RIVER, STREAMS, WATERFALL, riverSample, streamSample, waterSurfaceAt, type WaterPoint, type WaterSample } from '../geographicFeatures';

export type FlowSample = Readonly<{
  directionX: number;
  directionZ: number;
  velocity: number;
  turbulence: number;
  curvature: number;
}>;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const calm: FlowSample = { directionX: 0, directionZ: 0, velocity: 0, turbulence: .02, curvature:0 };
const basins=[...LAKE_RESERVATIONS,...LAGOONS];

/** Cover the already-carved, submerged bank without changing gameplay geography. */
export function visualWaterSurfaceAt(x:number,z:number,ground:number):WaterSample|null{
  const canonical=waterSurfaceAt(x,z);
  if(canonical)return canonical;
  const river=riverSample(x,z),stream=streamSample(x,z);
  const candidates=[{...river,kind:'river' as const},{...stream,kind:'stream' as const}];
  let selected:WaterSample|null=null;
  for(const route of candidates){
    // A short apron covers the abrupt visual edge without flooding the full
    // 18 m terrain-carving shoulder or changing the canonical river width.
    const apron=Math.min(8,route.width*.55);
    if(route.distance>=route.width+apron||ground>=route.level-.035)continue;
    const t=clamp((route.distance-route.width)/apron,0,1);
    const taper=t*t*(3-2*t);
    const level=route.level-(route.level-ground)*taper;
    if(level-ground<=.035)continue;
    if(!selected||level>selected.level)selected={
      level,kind:route.kind,distance:route.distance,
      edge:clamp((level-ground)/.5,0,1)
    };
  }
  return selected;
}

function lakeApproach(x:number,z:number):number{
  let factor=1;
  for(const lake of basins){
    const ellipse=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
    const distance=(ellipse-.94)*Math.min(lake.radiusX,lake.radiusZ);
    const t=clamp(distance/18,0,1);
    factor=Math.min(factor,t*t*(3-2*t));
  }
  return factor;
}

/** Smooth only the rendered river-to-lake join; canonical water levels stay intact. */
export function visualWaterLevel(x:number,z:number,surface:WaterSample):number{
  if(surface.kind==='lake'||surface.kind==='lagoon')return surface.level;
  let level=surface.level;
  for(const lake of basins){
    const ellipse=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
    const distance=(ellipse-.94)*Math.min(lake.radiusX,lake.radiusZ);
    if(distance>=18)continue;
    const t=clamp(distance/18,0,1);
    const blend=t*t*(3-2*t);
    level=Math.min(level,lake.level+(surface.level-lake.level)*blend);
  }
  return level;
}

/** Deterministic direction/velocity field driven by the actual river or stream route. */
export function sampleRiverFlow(x: number, z: number, kind: WaterSample['kind']): FlowSample {
  if (kind === 'lake' || kind === 'lagoon') return calm;
  const route: readonly WaterPoint[] = kind === 'stream' ? STREAMS[0].points : MAIN_RIVER;
  let best = Infinity;
  let selected = 0;
  let segmentT = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i], b = route[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = Math.max(1e-8, dx * dx + dz * dz);
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
    const distance2 = (x - (a.x + dx * t)) ** 2 + (z - (a.z + dz * t)) ** 2;
    if (distance2 < best) { best = distance2; selected = i; segmentT = t; }
  }
  const a = route[selected], b = route[selected + 1];
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.max(1e-5, Math.hypot(dx, dz));
  const baseX=dx/length,baseZ=dz/length;
  const slope = Math.max(0, (a.level - b.level) / length);
  const prev = route[Math.max(0, selected - 1)];
  const next = route[Math.min(route.length - 1, selected + 2)];
  const pdx=a.x-prev.x,pdz=a.z-prev.z,pLen=Math.hypot(pdx,pdz);
  const ndx=next.x-b.x,ndz=next.z-b.z,nLen=Math.hypot(ndx,ndz);
  const prevX=pLen>1e-5?pdx/pLen:baseX,prevZ=pLen>1e-5?pdz/pLen:baseZ;
  const nextX=nLen>1e-5?ndx/nLen:baseX,nextZ=nLen>1e-5?ndz/nLen:baseZ;
  const startT=clamp(segmentT/.35,0,1),endT=clamp((segmentT-.65)/.35,0,1);
  const startWeight=1-startT*startT*(3-2*startT);
  const endWeight=endT*endT*(3-2*endT);
  const vx=baseX*(1-.5*startWeight-.5*endWeight)+prevX*.5*startWeight+nextX*.5*endWeight;
  const vz=baseZ*(1-.5*startWeight-.5*endWeight)+prevZ*.5*startWeight+nextZ*.5*endWeight;
  const vLength=Math.max(1e-5,Math.hypot(vx,vz));
  const directionX=vx/vLength,directionZ=vz/vLength;
  const prevSlope=pLen>1e-5?Math.max(0,(prev.level-a.level)/pLen):slope;
  const nextSlope=nLen>1e-5?Math.max(0,(b.level-next.level)/nLen):slope;
  const smoothSlope=slope*(1-.5*startWeight-.5*endWeight)+
    prevSlope*.5*startWeight+nextSlope*.5*endWeight;
  const width = a.width + (b.width - a.width) * segmentT;
  // Wider/deeper water usually looks calmer; steep, narrow reaches create rapids.
  const narrowing = clamp((18 - width) / 18, 0, 1);
  const velocity = clamp(.50 + 10 * smoothSlope + narrowing * .7, .3, 4.0);
  const bendStart=1-clamp(prevX*baseX+prevZ*baseZ,-1,1);
  const bendEnd=1-clamp(nextX*baseX+nextZ*baseZ,-1,1);
  const curveTurbulence=clamp((bendStart*startWeight+bendEnd*endWeight)*1.6,0,.65);
  const slopeTurbulence = clamp(smoothSlope * 8, 0, .85);
  const falls = kind === 'river'
    ? 1 - clamp(Math.hypot(x - WATERFALL.x, z - WATERFALL.z) / 35, 0, 1)
    : 0;
  const turbulence = clamp(.04 + .45 * narrowing + curveTurbulence + slopeTurbulence + .85 * falls, .02, 1);
  // River motion tapers into existing lakes instead of switching abruptly
  // at the route/lake boundary and drawing a zigzag foam seam.
  const approach=lakeApproach(x,z);
  return {
    directionX:directionX*approach,
    directionZ:directionZ*approach,
    velocity:velocity*approach,
    turbulence:.02+(turbulence-.02)*approach,
    curvature:curveTurbulence*approach
  };
}
