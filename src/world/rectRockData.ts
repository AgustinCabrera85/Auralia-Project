/** Auralia – Update 5B: 21 piezas rocosas independientes, textura compartida 1K.
 * Magnitudes físicas expresadas en metros del mundo, no multiplicadores arbitrarios.
 * Este módulo es independiente de Babylon.js y permite pruebas de regresión.
 */
export type RockClass = 'column' | 'block' | 'boulder';
export type RectRockDefinition = Readonly<{
  name: string;
  kind: RockClass;
  footprint: number;
  sourceHeight: number;
  minDiameter: number;
  maxDiameter: number;
  hero: boolean;
  canHaveClimbRoute: boolean;
}>;
export const RECT_ROCK_PARTS: readonly RectRockDefinition[] = [
  {name:'rect_rock_00_column',kind:'column',footprint:0.21875,sourceHeight:0.2470703,minDiameter:18,maxDiameter:28,hero:true,canHaveClimbRoute:true},
  {name:'rect_rock_01_column',kind:'column',footprint:0.2409668,sourceHeight:0.2563477,minDiameter:18,maxDiameter:28,hero:true,canHaveClimbRoute:true},
  {name:'rect_rock_02_column',kind:'column',footprint:0.2211914,sourceHeight:0.1713867,minDiameter:18,maxDiameter:28,hero:false,canHaveClimbRoute:true},
  {name:'rect_rock_03_column',kind:'column',footprint:0.2280274,sourceHeight:0.2558594,minDiameter:18,maxDiameter:28,hero:true,canHaveClimbRoute:true},
  {name:'rect_rock_04_column',kind:'column',footprint:0.2070313,sourceHeight:0.1855469,minDiameter:18,maxDiameter:28,hero:false,canHaveClimbRoute:true},
  {name:'rect_rock_05_block',kind:'block',footprint:0.2006836,sourceHeight:0.0634766,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_06_block',kind:'block',footprint:0.1501465,sourceHeight:0.081543,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_07_block',kind:'block',footprint:0.1650391,sourceHeight:0.0664062,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_08_block',kind:'block',footprint:0.1694336,sourceHeight:0.0913086,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_09_block',kind:'block',footprint:0.1560059,sourceHeight:0.1162109,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_10_block',kind:'block',footprint:0.1787109,sourceHeight:0.1201172,minDiameter:12,maxDiameter:19,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_11_boulder',kind:'boulder',footprint:0.1166992,sourceHeight:0.0598145,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_12_boulder',kind:'boulder',footprint:0.105957,sourceHeight:0.0686035,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_13_boulder',kind:'boulder',footprint:0.0888672,sourceHeight:0.0493164,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_14_boulder',kind:'boulder',footprint:0.1054688,sourceHeight:0.0390625,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_15_boulder',kind:'boulder',footprint:0.0834961,sourceHeight:0.0366211,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_16_boulder',kind:'boulder',footprint:0.0656738,sourceHeight:0.0229492,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_17_boulder',kind:'boulder',footprint:0.0654297,sourceHeight:0.0297852,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_18_boulder',kind:'boulder',footprint:0.0527344,sourceHeight:0.0214844,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_19_boulder',kind:'boulder',footprint:0.0507812,sourceHeight:0.0175781,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
  {name:'rect_rock_20_boulder',kind:'boulder',footprint:0.0415039,sourceHeight:0.0195312,minDiameter:7.5,maxDiameter:12,hero:false,canHaveClimbRoute:false},
];
export const RECT_ROCK_PART_COUNT = RECT_ROCK_PARTS.length;
export const RECT_ROCK_SOURCE = '/assets/world/rocks/Set_Rocas_Rectanculares_Piezas_1K.glb';

/** Stable per-position part selection; monumental columns remain less frequent. */
export function selectRectRockPart(random01: number): number {
  const u = Math.max(0, Math.min(.99999999, random01));
  if (u < .18) return Math.floor(u/.18*5);                // columns
  if (u < .50) return 5+Math.floor((u-.18)/.32*6);        // blocks
  return 11+Math.floor((u-.50)/.50*10);                   // boulders
}
export type RockSizing = Readonly<{
  pieceIndex: number;
  diameterMeters: number;
  heightMeters: number;
  scaleXZ: number;
  scaleY: number;
  broadphaseRadiusMeters: number;
}>;
const clamp01=(u:number)=>Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));

/** Respect footprint for lateral scale and source height for vertical scale.
 * Columns grow taller without making their footprint impractically wide.
 * NOTE: a maximum Y stretch of about 2x is an artistic tradeoff; review close-ups.
 */
export function rectRockSizing(pieceIndex:number, uDiameter:number, uHeight:number):RockSizing {
  const part=RECT_ROCK_PARTS[pieceIndex];
  if(!part)throw new RangeError(`Unknown rock piece ${pieceIndex}`);
  const diameter=part.minDiameter+(part.maxDiameter-part.minDiameter)*clamp01(uDiameter);
  const scaleXZ=diameter/part.footprint;
  const naturalHeight=part.sourceHeight*scaleXZ;
  const t=clamp01(uHeight);
  let heightMeters:number;
  if(part.kind==='column'){
    const factor=(part.hero?1.62:1.40)+(part.hero?.36:.30)*t;
    heightMeters=Math.max(part.hero?30:23,Math.min(62,naturalHeight*factor));
  }else if(part.kind==='block'){
    heightMeters=Math.max(5,naturalHeight*(1+.17*t));
  }else{
    heightMeters=Math.max(2.5,naturalHeight*(1+.10*t));
  }
  const scaleY=heightMeters/part.sourceHeight;
  return {pieceIndex,diameterMeters:diameter,heightMeters,scaleXZ,scaleY,broadphaseRadiusMeters:diameter/2};
}
/** Only surfaces whose actual triangle normals and clearances allow it are walkable. */
export const ROCK_SLOPE_MAX_DEG=42;
export const ROCK_SLOPE_MIN_NORMAL_Y=Math.cos(ROCK_SLOPE_MAX_DEG*Math.PI/180);
export function isWalkableRockFace(normalY:number):boolean {
  return Number.isFinite(normalY)&&normalY>=ROCK_SLOPE_MIN_NORMAL_Y;
}
