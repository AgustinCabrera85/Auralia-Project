/** Pure geometry helpers shared by the World Editor and the game runtime.
 * Water Lab v4 still provides the water shaders; this module only supplies a
 * curved 3D ribbon and an accurate impact anchor. All units are world metres.
 */
import type { WaterPlacement } from './WorldEditState';

export type FallPoint = [number, number, number];
export type FallShape = 'straight'|'arc'|'s';
export type WaterfallGeometry = {
  positions:number[]; uvs:number[]; indices:number[];
  /** World-space centerline, useful for editor guides. */
  centerline:FallPoint[];
};
const mix=(a:number,b:number,t:number):number=>a+(b-a)*t;
const clamp=(x:number,min:number,max:number):number=>Math.max(min,Math.min(max,x));

export function fallControlPoints(body:WaterPlacement):[FallPoint,FallPoint,FallPoint,FallPoint]{
  const points=body.fallControls;
  if(points?.length===4&&points.every(p=>p.length===3&&p.every(Number.isFinite)))
    return points.map(p=>[...p] as FallPoint) as [FallPoint,FallPoint,FallPoint,FallPoint];
  return makeFallPreset(body,'arc');
}

/** Default path is relative to the top lip. A bend changes *actual* geometry. */
export function makeFallPreset(body:WaterPlacement,shape:FallShape):[FallPoint,FallPoint,FallPoint,FallPoint]{
  const x=body.x,y=body.y,z=body.z,h=Math.max(1,body.length);
  const forwardX=-Math.sin(body.rotation),forwardZ=Math.cos(body.rotation);
  const rightX=Math.cos(body.rotation),rightZ=Math.sin(body.rotation);
  const point=(out:number,down:number,side=0):FallPoint=>[
    x+out*h*forwardX+side*h*rightX,
    y-down*h,
    z+out*h*forwardZ+side*h*rightZ
  ];
  if(shape==='straight')return [point(0,0),point(0,.30),point(0,.72),point(0,1)];
  if(shape==='s')return [point(0,0),point(.16,.16,-.08),point(.43,.77,.11),point(.62,1)];
  return [point(0,0),point(.26,.10),point(.65,.73),point(.72,1)];
}

/** 0..1 Bézier centerline. First/last handles are the physical lip and impact. */
export function sampleFallPoint(points:readonly FallPoint[],t:number):FallPoint {
  const q=clamp(t,0,1),u=1-q;
  const w=[u*u*u,3*u*u*q,3*u*q*q,q*q*q];
  return [0,1,2].map(axis=>w.reduce((v,k,i)=>v+k*points[i][axis],0)) as FallPoint;
}
export function sampleFallTangent(points:readonly FallPoint[],t:number):FallPoint {
  const q=clamp(t,0,1),u=1-q;
  return [0,1,2].map(axis=>3*(
    u*u*(points[1][axis]-points[0][axis])+
    2*u*q*(points[2][axis]-points[1][axis])+
    q*q*(points[3][axis]-points[2][axis])
  )) as FallPoint;
}

export function waterfallImpactPoint(body:WaterPlacement):FallPoint {
  return sampleFallPoint(fallControlPoints(body),1);
}
export function waterfallFootWidth(body:WaterPlacement):number {
  return clamp(body.fallWidthEnd??body.width*.92,.2,2000);
}

/** Continuous, local-space sheet: t=0 is lip, t=1 is impact.
 * UV.v is intentionally 1-t because Water Lab v4 uses `fallY=1.0-vUV.y`.
 */
export function createWaterfallRibbon(body:WaterPlacement,rows=64,columns=24):WaterfallGeometry {
  const anchors=fallControlPoints(body);
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],centerline:FallPoint[]=[];
  const topWidth=clamp(body.width,.2,2000),endWidth=waterfallFootWidth(body);
  const baseRightX=Math.cos(body.rotation),baseRightZ=Math.sin(body.rotation);
  let prevRightX=baseRightX,prevRightZ=baseRightZ;
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    const center=sampleFallPoint(anchors,t);
    centerline.push(center);
    // Choose a smooth, world-up-independent lateral vector. A near-vertical
    // centerline falls back to the previous frame, preventing twisting.
    const tangent=sampleFallTangent(anchors,t);
    const span=Math.hypot(tangent[0],tangent[2]);
    let rx=span>1e-4?tangent[2]/span:prevRightX;
    let rz=span>1e-4?-tangent[0]/span:prevRightZ;
    if(rx*prevRightX+rz*prevRightZ<0){rx=-rx;rz=-rz;}
    prevRightX=rx;prevRightZ=rz;
    const eased=t*t*(3-2*t);
    const width=mix(topWidth,endWidth,eased);
    for(let i=0;i<=columns;i++){
      const u=i/columns;
      const spread=(u-.5)*width;
      positions.push(center[0]+rx*spread-body.x,
        center[1]-body.y,center[2]+rz*spread-body.z);
      uvs.push(u,1-t);
      if(j<rows&&i<columns){
        const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
    }
  }
  return {positions,uvs,indices,centerline};
}
