/**
 * Geografía canónica de la isla mayor de Auralia (metros aproximados en el POC).
 *  +X = este; +Z = sur; origen = núcleo de Brisalia.
 *  Funciones PURAS: el atlas, las colisiones y el render comparten esta geografía.
 */
import { applyGeographicRelief, LAKE_RESERVATIONS, RIVER_RESERVATION } from './geographicFeatures';
export { LAKE_RESERVATIONS, RIVER_RESERVATION } from './geographicFeatures';
export const MAINLAND = {
  centerX: 0,
  centerZ: -1130,
  radiusX: 2000,
  radiusZ: 1500,
  waterLevel: -0.15,
  chunkSize: 72,
  visibleRadius: 4,
  terrainSubdivisions: 12,
  chunksPerFrame: 1
} as const;

export const TERRAIN_CONFIG = {
  seed: 271828,
  noise: { broadScale: 470, mediumScale: 175, fineScale: 58, broadAmplitude: 5, mediumAmplitude: 2.8, fineAmplitude: 0.75 },
  relief: { valleyBase: 8, forestDepression: 3, sierraBase: 25, sierraRidges: 31, summitBase: 65, summitRidges: 82, wetlandDepression: 7, lakeDepth: 13, riverDepression: 3.5, coastDrop: 40 },
  biomes: { blendWidth: 180, coastalBand: 160, snowLine: 82 },
  reservations: { roadHalfWidth: 9, roadBlend: 38, riverHalfWidth: 22, riverBlend: 65 }
} as const;

export type Biome = 'valle' | 'ecos' | 'sierras' | 'nacar' | 'costa' | 'cumbres';
export type Landmark = { id: string; name: string; x: number; z: number; type: 'village' | 'vista' | 'future'; biome: Biome; description: string };
export type Route = { name: string; points: readonly (readonly [number,number])[]; width: number; existing: boolean };

export const LANDMARKS: readonly Landmark[] = [
  { id:'brisalia', name:'Brisalia', x:0, z:-23, type:'village', biome:'valle', description:'Aldea inicial, talleres, recursos y vida cotidiana.' },
  { id:'hogar', name:'Claro del Hogar', x:-29, z:18, type:'village', biome:'valle', description:'La parcela de construcción del protagonista.' },
  { id:'puerto', name:'Puerto del Arroyo', x:33, z:120, type:'village', biome:'valle', description:'Muelle y acceso a la Isla de las Luciérnagas.' },
  { id:'lindebrumas', name:'Umbral de Lindebrumas', x:-350, z:-285, type:'vista', biome:'ecos', description:'Arcos y árboles del Bosque de los Ecos. Futuras aventuras.' },
  { id:'altapiedra', name:'Paso de Altapiedra', x:-275, z:-535, type:'vista', biome:'sierras', description:'Primeros restos de máquinas de montaña. Futura ciudad.' },
  { id:'nacar', name:'Orilla de Nácar', x:245, z:-250, type:'vista', biome:'nacar', description:'Lago interior, muelle y futuros oficios náuticos.' },
  { id:'altaluz', name:'Mirador de Altaluz', x:200, z:-660, type:'future', biome:'cumbres', description:'Camino hacia la ciudadela del Primer Amanecer.' }
];

/** Existing roads retain their exact coordinates; later corridors reserve terrain only. */
export const ROAD_RESERVATIONS: readonly Route[] = [
  { name:'Plaza', points:[[1,9],[2,-7],[3,-21],[-7,-28]], width:6.5, existing:true },
  { name:'Claro', points:[[1,9],[-12,10],[-28,18]], width:5, existing:true },
  { name:'Cantera', points:[[1,9],[19,14],[37,8]], width:4.8, existing:true },
  { name:'Puerto', points:[[1,9],[4,33],[33,120]], width:4.8, existing:true },
  { name:'Lindebrumas', points:[[-9,-29],[-80,-105],[-170,-170],[-270,-230],[-350,-285]], width:4.3, existing:true },
  { name:'Altapiedra', points:[[-9,-29],[-30,-125],[-100,-255],[-170,-390],[-275,-535]], width:4.4, existing:true },
  { name:'Nácar', points:[[24,-22],[105,-95],[185,-155],[260,-200],[245,-250]], width:4.4, existing:true },
  { name:'Altaluz', points:[[-170,-390],[-90,-490],[35,-565],[125,-620],[200,-660]], width:4.1, existing:true },
  { name:'Senda de la Cascada', points:[[200,-660],[290,-760],[400,-865],[470,-1005]], width:4.4, existing:true },
  { name:'Mirador de Altapiedra', points:[[-275,-535],[-310,-550],[-340,-565]], width:4.2, existing:true },
  { name:'Cueva Antigua', points:[[-340,-565],[-325,-600],[-300,-640]], width:4.2, existing:true },
  { name:'Senda occidental', points:[[-350,-285],[-630,-560],[-950,-850],[-1250,-1150]], width:5, existing:false },
  { name:'Ruta de las cumbres', points:[[-275,-535],[-300,-850],[-100,-1230],[300,-1740]], width:5, existing:false },
  { name:'Paso oriental', points:[[245,-250],[520,-400],[850,-830],[1110,-1260]], width:5, existing:false }
];

const LEGACY = { centerX:0, centerZ:-340, radiusX:710, radiusZ:565 } as const;

const clamp = (v:number, a:number, b:number):number => Math.max(a,Math.min(b,v));
const smooth = (a:number,b:number,v:number):number => { const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t); };
const gaussian = (x:number,z:number,cx:number,cz:number,sx:number,sz:number):number => Math.exp(-(((x-cx)/sx)**2)-(((z-cz)/sz)**2));

/** Misma irregularidad en todos los chunks y en el mapa regional. */
export function coastlineRadius(angle:number):number {
  const bayAngle=Math.atan2(Math.sin(angle-1.72),Math.cos(angle-1.72));
  return 0.985 + 0.052*Math.sin(angle*4+0.28) + 0.035*Math.sin(angle*9-0.45)
    + 0.022*Math.cos(angle*15+0.1) - 0.13*Math.exp(-Math.pow(bayAngle/0.24,2));
}
export function radialPosition(x:number,z:number): {radial:number;angle:number;coast:number} {
  const u=(x-MAINLAND.centerX)/MAINLAND.radiusX;
  const v=(z-MAINLAND.centerZ)/MAINLAND.radiusZ;
  const angle=Math.atan2(v,u);
  return {radial:Math.hypot(u,v),angle,coast:coastlineRadius(angle)};
}
function valueNoise(x:number,z:number,seed:number):number {
  const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(0,1,x-ix),fz=smooth(0,1,z-iz);
  const a=hash01(ix,iz,seed),b=hash01(ix+1,iz,seed),c=hash01(ix,iz+1,seed),d=hash01(ix+1,iz+1,seed);
  return 2*((a+(b-a)*fx)*(1-fz)+(c+(d-c)*fx)*fz)-1;
}
function noise(x:number,z:number,scale:number,offset:number):number {
  return valueNoise(x/scale,z/scale,TERRAIN_CONFIG.seed+offset);
}
function distanceToRoute(x:number,z:number,points:readonly (readonly [number,number])[]):number {
  let best=Infinity;
  for(let i=1;i<points.length;i++){
    const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
    const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return best;
}
/** Continuous masks shared by relief, vegetation and the map. */
export function geographyMasks(x:number,z:number):{lake:number;river:number;road:number}{
  let lake=0;
  for(const p of LAKE_RESERVATIONS)lake=Math.max(lake,gaussian(x,z,p.x,p.z,p.radiusX,p.radiusZ));
  const river=1-smooth(TERRAIN_CONFIG.reservations.riverHalfWidth,TERRAIN_CONFIG.reservations.riverHalfWidth+TERRAIN_CONFIG.reservations.riverBlend,distanceToRoute(x,z,RIVER_RESERVATION));
  let road=0;
  for(const route of ROAD_RESERVATIONS){
    const distance=distanceToRoute(x,z,route.points);
    road=Math.max(road,1-smooth(route.width+TERRAIN_CONFIG.reservations.roadHalfWidth,route.width+TERRAIN_CONFIG.reservations.roadHalfWidth+TERRAIN_CONFIG.reservations.roadBlend,distance));
  }
  return {lake,river,road};
}

/** Blend regional influences before applying relief; no biome boundary changes height abruptly. */
export function biomeWeightsAt(x:number,z:number):Readonly<Record<Biome,number>>{
  const {radial,coast}=radialPosition(x,z);
  const shoreDistance=Math.abs(coast-radial)*MAINLAND.radiusZ;
  const starter=1-smooth(150,230,Math.hypot(x,z));
  const blend=Math.max(1,TERRAIN_CONFIG.biomes.blendWidth)/180;
  const regionalSmooth=(a:number,b:number,v:number):number=>{
    const center=(a+b)/2,half=(b-a)*blend/2;
    return smooth(center-half,center+half,v);
  };
  const scores:Record<Biome,number>={
    valle:1.15,
    ecos:2.25*(1-regionalSmooth(-850,-200,x))*regionalSmooth(-250,100,-z)+2.4*gaussian(x,z,-350,-285,210,190),
    sierras:2.2*(1-regionalSmooth(-1250,-650,z))*(1-regionalSmooth(-420,250,x))+2.6*gaussian(x,z,-275,-535,240,240),
    nacar:2.5*regionalSmooth(180,750,x)*regionalSmooth(-1500,-650,z)+2.9*gaussian(x,z,245,-250,260,210),
    cumbres:2.6*(1-regionalSmooth(-1550,-850,z))*regionalSmooth(-350,250,x)*(1-regionalSmooth(800,1300,x))+2.8*gaussian(x,z,200,-660,230,220),
    costa:3.0*(1-smooth(25,TERRAIN_CONFIG.biomes.coastalBand,shoreDistance))*(1-starter)
  };
  const total=Object.values(scores).reduce((a,b)=>a+b,0);
  for(const key of Object.keys(scores) as Biome[])scores[key]/=total;
  return scores;
}

/** Exact v0.2 heights where existing buildings, paths and saved structures stand. */
function legacyHeight(x:number,z:number):number {
  const u=(x-LEGACY.centerX)/LEGACY.radiusX,v=(z-LEGACY.centerZ)/LEGACY.radiusZ;
  const a=Math.atan2(v,u),radial=Math.hypot(u,v);
  const oldCoast=0.965+0.055*Math.sin(a*4+0.28)+0.037*Math.sin(a*9-0.45)+0.023*Math.cos(a*15+0.1);
  const undulations=0.55*Math.sin(x*.026)*Math.cos(z*.020)+0.32*Math.sin(x*.064+z*.031);
  const softHills=2.4*Math.sin(x*.007+z*.012)**2+1.2*Math.cos(x*.012-z*.009);
  const mountains=32*gaussian(x,z,-270,-555,220,170)+43*gaussian(x,z,185,-665,185,175);
  const westernHills=8*gaussian(x,z,-385,-300,230,220);
  const easternHills=9*gaussian(x,z,390,-375,225,250);
  const lake=19*gaussian(x,z,335,-255,112,103);
  const estuary=12*gaussian(x,z,40+10*Math.sin(z*.017),112,24,95)*smooth(30,85,z);
  return 7.1+undulations+softHills+mountains+westernHills+easternHills-lake-estuary-40*smooth(oldCoast-.18,oldCoast+.07,radial);
}

export function sampleMainlandHeight(x:number,z:number):number {
  const oldRadial=Math.hypot((x-LEGACY.centerX)/LEGACY.radiusX,(z-LEGACY.centerZ)/LEGACY.radiusZ);
  const preserve=Math.max(1-smooth(.72,1.02,oldRadial),1-smooth(155,240,Math.hypot(x,z)));
  if(preserve>=1)return applyGeographicRelief(x,z,legacyHeight(x,z));
  const weights=biomeWeightsAt(x,z),masks=geographyMasks(x,z),n=TERRAIN_CONFIG.noise,r=TERRAIN_CONFIG.relief;
  const broad=noise(x,z,n.broadScale,1),medium=noise(x,z,n.mediumScale,2),fine=noise(x,z,n.fineScale,3);
  const ridge=1-Math.abs(noise(x,z,115,4));
  const rolling=n.broadAmplitude*broad+n.mediumAmplitude*medium*(1-.7*masks.road)+n.fineAmplitude*fine*(1-.85*masks.road);
  let height=r.valleyBase+rolling+weights.ecos*(-r.forestDepression+2.5*medium)
    +weights.sierras*(r.sierraBase+r.sierraRidges*ridge*(1-.55*masks.road))
    +weights.cumbres*(r.summitBase+r.summitRidges*ridge*(1-.5*masks.road))
    -weights.nacar*r.wetlandDepression-r.lakeDepth*masks.lake-r.riverDepression*masks.river;
  const {radial,angle,coast}=radialPosition(x,z);
  const coastWidth=.055+.035*(.5+.5*Math.sin(angle*7));
  height-=r.coastDrop*smooth(coast-coastWidth*.5,coast+coastWidth,radial);
  const old=oldRadial<1.1 ? legacyHeight(x,z) : 0;
  const blended=preserve>0 ? old*preserve+height*(1-preserve) : height;
  // Existing traversable shoreline remains traversable for saved player positions.
  const compatible=oldRadial<1.1 && old>MAINLAND.waterLevel+.6 ? Math.max(blended,old) : blended;
  return applyGeographicRelief(x,z,compatible);
}
export function isLand(x:number,z:number):boolean {
  return sampleMainlandHeight(x,z) > MAINLAND.waterLevel + 0.6;
}
export function biomeAt(x:number,z:number):Biome {
  const weights=biomeWeightsAt(x,z);
  return (Object.keys(weights) as Biome[]).reduce((best,key)=>weights[key]>weights[best]?key:best,'valle');
}
export const BIOME_NAMES:Readonly<Record<Biome,string>> = {
  valle:'Valle de los Faroles', ecos:'Bosque de los Ecos', sierras:'Sierras de los Engranajes',
  nacar:'Humedales de Nácar', costa:'Costa de Auralia', cumbres:'Cumbres del Primer Amanecer'
};

/** Hash estable que no depende de Math.random ni del orden de carga. */
export function hash01(x:number,z:number,seed=0):number {
  let v=(Math.imul(x|0,374761393) + Math.imul(z|0,668265263) + Math.imul(seed|0,2246822519))|0;
  v=Math.imul(v ^ (v>>>13),1274126177);
  v=(v^(v>>>16))>>>0;
  return v/4294967296;
}
export function chunkOf(x:number,z:number): {cx:number;cz:number} {
  return {cx:Math.floor(x/MAINLAND.chunkSize),cz:Math.floor(z/MAINLAND.chunkSize)};
}
export function chunkKey(cx:number,cz:number):string {return `${cx}:${cz}`;}
export function desiredChunks(x:number,z:number,radius=MAINLAND.visibleRadius):{cx:number;cz:number}[] {
  const p=chunkOf(x,z),found:{cx:number;cz:number}[]=[];
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    // Optional circular cut reduces draw calls at the corners.
    if(dx*dx+dz*dz>(radius+.35)*(radius+.35))continue;
    found.push({cx:p.cx+dx,cz:p.cz+dz});
  }
  return found;
}
export function isStarterArea(x:number,z:number):boolean {
  // Reservar la aldea, la parcela y las rutas inmediatas libres de bosque procedural.
  return Math.abs(x)<125 && z>-125 && z<170;
}
export function islandOutline(samples=120):Array<{x:number;z:number}> {
  const out:Array<{x:number;z:number}>=[];
  for(let i=0;i<samples;i++){
    const a=i*2*Math.PI/samples,edge=coastlineRadius(a);
    out.push({x:MAINLAND.centerX+Math.cos(a)*edge*MAINLAND.radiusX,z:MAINLAND.centerZ+Math.sin(a)*edge*MAINLAND.radiusZ});
  }
  return out;
}
