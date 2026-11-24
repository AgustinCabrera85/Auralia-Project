export type ImpactPoint={x:number;y:number;z:number};
export type ImpactSupport={height:number;normalY:number;surface?:string};
export type ImpactProbe=(x:number,z:number,nearY:number,range:number)=>ImpactSupport|null;

/** Capture support once per impact; the FX only interpolates this small immutable grid. */
export function captureImpactGround(center:ImpactPoint,requestedRadius:number,probe:ImpactProbe){
  const hit=probe(center.x,center.z,center.y,.4);
  if(!hit||hit.normalY<.55)return null;
  const dx=probe(center.x+.08,center.z,hit.height,.4),dz=probe(center.x,center.z+.08,hit.height,.4);
  if(!dx||!dz)return null;
  const sx=(dx.height-hit.height)/.08,sz=(dz.height-hit.height)/.08,L=Math.hypot(sx,1,sz);
  if(1/L<.55)return null;
  const normal={x:-sx/L,y:1/L,z:-sz/L},radius=Math.max(.6,Math.min(7,requestedRadius));
  const extent=radius+1.1,N=17,step=2*extent/(N-1),heights=new Float64Array(N*N);
  let safeRadius=radius;
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){
    const ox=x*step-extent,oz=z*step-extent,predicted=hit.height+sx*ox+sz*oz;
    const sample=probe(center.x+ox,center.z+oz,predicted,1);
    heights[z*N+x]=sample?.height??NaN;
    if(!sample||sample.normalY<.55||Math.abs(sample.height-predicted)>.7)
      safeRadius=Math.min(safeRadius,Math.hypot(ox,oz)-1.1-step*Math.SQRT2);
  }
  if(safeRadius<.6)return null;
  const sampleHeight=(x:number,z:number):number|undefined=>{
    const u=(x-center.x+extent)/step,v=(z-center.z+extent)/step;
    if(u<0||v<0||u>N-1||v>N-1)return;
    const ix=Math.min(N-2,Math.floor(u)),iz=Math.min(N-2,Math.floor(v)),a=u-ix,b=v-iz;
    const h=heights[iz*N+ix]*(1-a)*(1-b)+heights[iz*N+ix+1]*a*(1-b)+
      heights[(iz+1)*N+ix]*(1-a)*b+heights[(iz+1)*N+ix+1]*a*b;
    return Number.isFinite(h)?h:undefined;
  };
  return {point:{x:center.x,y:hit.height,z:center.z},normal,radius:safeRadius,surface:hit.surface,sampleHeight};
}
