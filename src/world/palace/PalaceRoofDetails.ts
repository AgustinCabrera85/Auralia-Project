import {face,geometry,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {PALACE_DESIGN as D} from './PalaceDesign';

/** Rounded clay caps give the ridges and eaves a silhouette at player distance.
 * The continuous watertight roof below remains the structural surface. */
export function palaceRoofDetails(parts:Part[]){
  const g=geometry();
  const cap=(a:P3,b:P3,r=.14)=>{
    const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta),along=delta.map(v=>v/length),h=Math.hypot(along[0],along[2]);
    if(h<1e-7)return;
    const across=[-along[2]/h,0,along[0]/h],up=[-along[0]*along[1]/h,h,-along[2]*along[1]/h];
    const p=(t:number,angle:number):P3=>a.map((v,i)=>v+along[i]*t+across[i]*Math.cos(angle)*r+up[i]*Math.sin(angle)*r) as P3;
    for(let k=0;k<8;k++){
      const u=k*Math.PI/8,v=(k+1)*Math.PI/8,n=across.map((a,i)=>a*Math.cos((u+v)/2)+up[i]*Math.sin((u+v)/2)) as P3;
      face(g,[p(0,u),p(length,u),p(length,v),p(0,v)],n);
    }
    for(const t of [0,length])face(g,Array.from({length:9},(_,k)=>p(t,k*Math.PI/8)),along.map(n=>n*(t===0?-1:1)) as P3);
  };
  const run=(a:P3,b:P3)=>{
    const n=Math.ceil(Math.hypot(...b.map((v,i)=>v-a[i]))/.5);
    for(let i=0;i<n;i++)cap(a.map((v,k)=>v+(b[k]-v)*i/n) as P3,a.map((v,k)=>v+(b[k]-v)*Math.min(1,(i+1.04)/n)) as P3);
  };
  for(const r of [D.pavilion]){
    const [a,b,c,d]=r.bounds_xz,y=r.eave_y+.025,h=r.ridge_y+.025;
    const e:P3=r.ridge_axis==='X'?[a+r.hip_run,h,(c+d)/2]:[(a+b)/2,h,c+r.hip_run];
    const f:P3=r.ridge_axis==='X'?[b-r.hip_run,h,(c+d)/2]:[(a+b)/2,h,d-r.hip_run];
    run(e,f);
    for(const [corner,peak] of [[[a,y,c],e],[[b,y,c],r.ridge_axis==='X'?f:e],[[b,y,d],f],[[a,y,d],r.ridge_axis==='X'?e:f]] as [P3,P3][])run(corner,peak);
    for(let x=a+.17;x<b;x+=.34)cap([x,y,c],[x,y+.14,c+.34],.12);
  }
  for(const s of [-1,1])for(let x=10.7;x<27.8;x+=.34)cap([s*x,8.92,-3.6],[s*x,9.0,-3.07],.11);
  parts.push({id:'clay-ridge-and-eave-caps',material:'roof',data:g,solid:false,detail:false});
}
