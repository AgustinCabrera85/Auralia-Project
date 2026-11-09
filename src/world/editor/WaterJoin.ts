/**
 * Auralia World Editor v0.5: non-destructive waterfall / canonical river join.
 * This file does not replace the four Water Lab v4 profiles.
 *
 * The game's canonical water stays responsible for the upstream and downstream
 * surfaces. Only the authored waterfall occupies the existing waterfall cut.
 */
import { MAIN_RIVER, WATERFALL, riverSample } from '../geographicFeatures';
import { sampleMainlandHeight } from '../terrainData';
import { visualWaterLevel, visualWaterSurfaceAt } from '../water/riverFlow';
import type { WaterPlacement } from './WorldEditState';
import { fallControlPoints, type WaterfallGeometry } from './WaterfallSpline';

// Same stable native-cut rectangle as WaterfallGeometry.ts in the new runtime.
// Kept local for compatibility with earlier Auralia GeographyStream revisions.
const WATERFALL_CUT = {minX:480,maxX:522,minZ:-1011,maxZ:-987} as const;
const OVERLAP_METERS = 8;
const TOP_STATION = WATERFALL_CUT.minZ - OVERLAP_METERS;
const BOTTOM_STATION = WATERFALL_CUT.maxZ + OVERLAP_METERS;
const EDGE_BLEND = .08;
const END_BLEND = .20;
const clamp = (v:number, lo:number, hi:number):number=>Math.max(lo,Math.min(hi,v));
const mix = (a:number,b:number,t:number):number=>a+(b-a)*t;
const smooth = (v:number):number=>{const t=clamp(v,0,1);return t*t*(3-2*t);};

/** The default join target is the already-authored valley river, not an arbitrary flat plane. */
export function canJoinWaterfallToRiver(w:WaterPlacement):boolean {
  if(w.profile!=='fall')return false;
  const points=fallControlPoints(w);
  return Math.hypot(points[0][0]-WATERFALL.x,points[0][2]-WATERFALL.topZ)<110 &&
    Math.hypot(points[3][0]-WATERFALL.x,points[3][2]-WATERFALL.bottomZ)<110;
}

/** Linear station along the canonical river control path, ordered in world Z. */
export function riverAtZ(z:number):{x:number;y:number;radius:number} {
  const way=MAIN_RIVER;
  for(let i=1;i<way.length;i++){
    const a=way[i-1],b=way[i];
    if(z<=b.z){
      const t=clamp((z-a.z)/(b.z-a.z),0,1);
      return {x:mix(a.x,b.x,t),y:mix(a.level,b.level,t),radius:mix(a.width,b.width,t)};
    }
  }
  const last=way[way.length-1];
  return {x:last.x,y:last.level,radius:last.width};
}

/** True visual waterline where possible; source route level as stable fallback. */
export function legacyWaterHeight(x:number,z:number):number {
  const ground=sampleMainlandHeight(x,z);
  const water=visualWaterSurfaceAt(x,z,ground);
  const level=water?visualWaterLevel(x,z,water):riverSample(x,z).level;
  return level+.035;
}

/**
 * Measure the connected wet corridor, avoiding guesses about a fixed width.
 * We deliberately stop at the first dry bank; distant disconnected puddles
 * are not part of the river's current cross-section.
 */
export function legacyWetWidth(x:number,z:number):number {
  const scan=(direction:-1|1):number=>{
    let lastWet=0;
    for(let d=.75;d<=38;d+=.75){
      const px=x+direction*d;
      const level=visualWaterSurfaceAt(px,z,sampleMainlandHeight(px,z));
      if(!level || sampleMainlandHeight(px,z)>level.level-.035)break;
      lastWet=d;
    }
    return lastWet;
  };
  const width=scan(-1)+scan(1);
  return clamp(width>9?width:riverSample(x,z).width*2,16,76);
}

/**
 * Adjust only endpoints and tangents of the existing authored spline.
 * Terrain strokes, material strokes, and the v4 shader parameters are untouched.
 * Returns a NEW placement, so caller can preserve Undo/Redo snapshots.
 */
export function joinWaterfallToRiver(w:WaterPlacement):WaterPlacement|null {
  if(!canJoinWaterfallToRiver(w))return null;
  const previous=fallControlPoints(w);
  const top=riverAtZ(TOP_STATION),bottom=riverAtZ(BOTTOM_STATION);
  const start:[number,number,number]=[top.x,legacyWaterHeight(top.x,TOP_STATION),TOP_STATION];
  const end:[number,number,number]=[bottom.x,legacyWaterHeight(bottom.x,BOTTOM_STATION),BOTTOM_STATION];
  const range=BOTTOM_STATION-TOP_STATION;
  const a=previous[1];const b=previous[2];
  const firstZ=clamp(a[2],TOP_STATION+range*.22,TOP_STATION+range*.44);
  const secondZ=clamp(b[2],TOP_STATION+range*.56,TOP_STATION+range*.80);
  const spanY=Math.max(.1,start[1]-end[1]);
  const firstY=clamp(a[1],end[1]+spanY*.66,start[1]);
  const secondY=clamp(b[1],end[1],Math.min(firstY-.05,end[1]+spanY*.48));
  const first:[number,number,number]=[clamp(a[0],top.x-15,top.x+15),firstY,firstZ];
  const second:[number,number,number]=[clamp(b[0],bottom.x-15,bottom.x+15),secondY,secondZ];
  // The native water mesh reserves a 42-m-wide cut. Cover that cut without
  // leaving narrow open strips along the lateral borders.
  const cutCoverage=WATERFALL_CUT.maxX-WATERFALL_CUT.minX+4;
  const topWidth=Math.max(cutCoverage,legacyWetWidth(start[0],TOP_STATION));
  const footWidth=Math.max(cutCoverage,legacyWetWidth(end[0],BOTTOM_STATION));
  return {...w,x:start[0],y:start[1],z:start[2],
    length:Math.max(1,start[1]-end[1]),rotation:0,
    width:topWidth,fallWidthEnd:footWidth,
    fallControls:[start,first,second,end],joinToLegacyRiver:true};
}

/**
 * The edit spline retains its curve; at both ends vertices converge to the
 * CURRENT native river surface. This prevents a horizontal plane from
 * intersecting a sloping shoreline when the user's terrain has been sculpted.
 */
export function conformJoinedFall(w:WaterPlacement, geometry:WaterfallGeometry):void {
  if(!w.joinToLegacyRiver)return;
  const rows=geometry.centerline.length-1;
  if(rows<2)return;
  const columns=geometry.positions.length/(3*(rows+1))-1;
  if(!Number.isInteger(columns)||columns<1)return;
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    if(t>=END_BLEND&&t<=1-END_BLEND)continue;
    const weight=smooth(Math.min(t,1-t)/END_BLEND);
    for(let i=0;i<=columns;i++){
      const p=3*(j*(columns+1)+i);
      const x=geometry.positions[p]+w.x,z=geometry.positions[p+2]+w.z;
      const native=legacyWaterHeight(x,z)-w.y;
      geometry.positions[p+1]=mix(native,geometry.positions[p+1],weight);
    }
  }
}

/**
 * Wrap the *unchanged* Water Lab v4 GLSL with a final alpha fade at joins.
 * It is a separate shader variant, and never rewrites the original lab file.
 * Softens the material transition over the 8-metre overlapped river sections.
 */
export function joinedFallShaders(vertex:string,fragment:string):{vertex:string;fragment:string} {
  const out=/gl_FragColor\s*=\s*vec4\(\s*col\s*,\s*alpha\s*\)\s*;/g;
  const matches=[...fragment.matchAll(out)];
  if(matches.length!==1)throw new Error('Water Lab v4: no se halló una salida alpha compatible para unir la cascada.');
  const fade=`float auraliaT=1.0-vUV.y;
    float auraliaJoin=smoothstep(0.0,${END_BLEND.toFixed(2)},auraliaT)*
      smoothstep(0.0,${END_BLEND.toFixed(2)},1.0-auraliaT);
    float auraliaEdge=smoothstep(0.0,${EDGE_BLEND.toFixed(2)},vUV.x)*
      smoothstep(0.0,${EDGE_BLEND.toFixed(2)},1.0-vUV.x);
    alpha*=auraliaJoin*auraliaEdge;
    gl_FragColor=vec4(col,alpha);`;
  const joinedFragment=fragment.replace(out,fade);
  // The Lab v4 vertex shader has a very small forward flutter in fall mode.
  // Disable it at join borders so source vertices meet the canonical river.
  const flutter=/pos\.z\s*\+=\s*waves\(vec2\(wp\.x,\s*wp\.y\s*\*\s*1\.35\),\s*uTime\s*\*\s*1\.7\)\s*\*\s*0\.22\s*;/;
  const joinedVertex=vertex.replace(flutter,matched=>matched.replace(/0\.22/,`0.22 * smoothstep(0.0,${END_BLEND.toFixed(2)},1.0-uv.y) * smoothstep(0.0,${END_BLEND.toFixed(2)},uv.y)`));
  return {vertex:joinedVertex,fragment:joinedFragment};
}
