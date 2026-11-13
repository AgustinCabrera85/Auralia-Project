import type { StudioSpline } from './WorldStudioSource';
import type { GeographicBounds } from './GeographicSource';
import { STUDIO_RIVER_LEVELS } from './StudioRiverLevels';
export type RiverStation={x:number;z:number;level:number;width:number;dx:number;dz:number;along:number};
export type RiverStrip={a:RiverStation;b:RiverStation;capStart:boolean;capEnd:boolean};
type Segment={route:string;ax:number;az:number;bx:number;bz:number;ay:number;by:number;width:number;length:number;
  tx0:number;tz0:number;tx1:number;tz1:number;along:number;first:boolean;last:boolean};
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function intersects(s:Segment,b:GeographicBounds,pad:number):boolean{
  let lo=0,hi=1;
  for(const [a,d,min,max] of [[s.ax,s.bx-s.ax,b[0]-pad,b[2]+pad],[s.az,s.bz-s.az,b[1]-pad,b[3]+pad]]){
    if(Math.abs(d)<1e-9){if(a<min||a>max)return false;continue;}
    const p=(min-a)/d,q=(max-a)/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
    if(lo>hi)return false;
  }return true;
}
/** Authored axes and monotone levels shared by beds, water, currents and LOD. */
export class StudioRivers {
  private readonly cells=new Map<string,Segment[]>();
  constructor(splines:StudioSpline[],sea:number,lakeLevel:(x:number,z:number)=>number|null){
    for(const spline of splines.filter(s=>s.type==='river')){
      const p=spline.controlPoints;if(p.length<2)continue;
      const baked=spline.resolvedLevels?undefined:STUDIO_RIVER_LEVELS[spline.id];
      const levels=p.map((q,i)=>Math.max(sea,lakeLevel(q.x,q.z)??(baked?.length===p.length?baked[i]:q.y)??sea));
      // Enforce downstream flow; the source profile is an authored guide, not
      // a fluid simulation. Lake mouths share the lake's exact datum.
      for(let i=1;i<levels.length;i++)levels[i]=Math.min(levels[i],levels[i-1]);
      const tangent=(i:number)=>{const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)];
        const l=Math.hypot(b.x-a.x,b.z-a.z)||1;return [(b.x-a.x)/l,(b.z-a.z)/l];};
      let along=0;
      for(let i=1;i<p.length;i++){
        const a=p[i-1],b=p[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)continue;
        const [tx0,tz0]=tangent(i-1),[tx1,tz1]=tangent(i);
        const s:Segment={route:spline.id,ax:a.x,az:a.z,bx:b.x,bz:b.z,ay:levels[i-1],by:levels[i],width:spline.width/2,
          length,tx0,tz0,tx1,tz1,along,first:i===1,last:i===p.length-1};along+=length;
        const pad=s.width+52;
        for(let z=Math.floor((Math.min(a.z,b.z)-pad)/128);z<=Math.floor((Math.max(a.z,b.z)+pad)/128);z++)
          for(let x=Math.floor((Math.min(a.x,b.x)-pad)/128);x<=Math.floor((Math.max(a.x,b.x)+pad)/128);x++){
            const key=`${x}:${z}`,list=this.cells.get(key)??[];list.push(s);this.cells.set(key,list);
          }
      }
    }
  }
  private station(s:Segment,t:number):RiverStation{
    const dx=s.tx0+(s.tx1-s.tx0)*t,dz=s.tz0+(s.tz1-s.tz0)*t,l=Math.hypot(dx,dz)||1;
    return {x:s.ax+(s.bx-s.ax)*t,z:s.az+(s.bz-s.az)*t,level:s.ay+(s.by-s.ay)*t,
      width:s.width,dx:dx/l,dz:dz/l,along:s.along+s.length*t};
  }
  at(x:number,z:number){
    let best:(RiverStation&{distance:number})|null=null;
    let weight=0,level=0;
    for(const s of this.cells.get(`${Math.floor(x/128)}:${Math.floor(z/128)}`)??[]){
      const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(s.length*s.length)));
      const d=Math.hypot(x-s.ax-t*dx,z-s.az-t*dz);if(d>s.width+52)continue;
      // Compact, continuous weights include both sides of a bend. Selecting
      // only the nearest segment makes the waterline jump at its bisector.
      const w=(1-smooth(s.width+14,s.width+52,d))**2/(1+(d/s.width)**2);
      weight+=w;level+=(s.ay+(s.by-s.ay)*t)*w;
      if(!best||d<best.distance)best={...this.station(s,t),distance:d};
    }
    if(best&&weight>0)best.level=level/weight;
    return best;
  }
  /** Incision only. Original terrain is an upper bound, including both banks. */
  bedAt(x:number,z:number,base:number):number{
    const r=this.at(x,z);if(!r)return base;
    const depth=4+r.width*.16,crest=r.level+3+r.width*.12;
    const bed=r.level-depth,channel=bed+(crest-bed)*smooth(r.width*.45,r.width+14,r.distance);
    return Math.min(base,channel+(base-channel)*smooth(r.width+14,r.width+52,r.distance));
  }
  private candidates(bounds:GeographicBounds):Set<Segment>{
    const found=new Set<Segment>();
    for(let z=Math.floor(bounds[1]/128);z<=Math.floor(bounds[3]/128);z++)
      for(let x=Math.floor(bounds[0]/128);x<=Math.floor(bounds[2]/128);x++)
        for(const s of this.cells.get(`${x}:${z}`)??[])found.add(s);
    return found;
  }
  touches(bounds:GeographicBounds,padding=52):boolean{
    for(const s of this.candidates(bounds))if(intersects(s,bounds,s.width+padding))return true;
    return false;
  }
  near(x:number,z:number,size:number){return this.touches([x,z,x+size,z+size],35);}
  *strips(bounds:GeographicBounds):Generator<RiverStrip>{
    for(const s of this.candidates(bounds)){
      if(!intersects(s,bounds,s.width+35))continue;
      // World-anchored stations match in every chunk and water LOD.
      const steps=Math.ceil(s.length/3);
      for(let i=0;i<steps;i++){
        const a=this.station(s,i/steps),b=this.station(s,(i+1)/steps),pad=s.width+35;
        if(Math.max(a.x,b.x)+pad<bounds[0]||Math.min(a.x,b.x)-pad>bounds[2]||
          Math.max(a.z,b.z)+pad<bounds[1]||Math.min(a.z,b.z)-pad>bounds[3])continue;
        yield {a,b,capStart:s.first&&i===0,capEnd:s.last&&i===steps-1};
      }
    }
  }
}
