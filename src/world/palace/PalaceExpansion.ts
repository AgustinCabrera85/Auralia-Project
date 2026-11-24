import {geometry,type Geometry,type P3} from './PalaceGeometry';
/** Enlarge circulation and the audience hall, rather than enlarging the actor
 * or every furnishing: 80 x 70 m building, 40 x 32 m court, 48 x 16 m P11. */
export const expandX=(x:number)=>Math.abs(x)<=16?x*1.25:x+Math.sign(x)*4;
export const contractX=(x:number)=>Math.abs(x)<=20?x/1.25:x-Math.sign(x)*4;
export const expandZ=(z:number)=>z<=18?z:z<=40?18+(z-18)*32/22:z<=44?z+10:z<=56?54+(z-44)*4/3:z+14;
export const contractZ=(z:number)=>z<=18?z:z<=50?18+(z-18)*22/32:z<=54?z-10:z<=70?44+(z-54)*3/4:z-14;
const dx=(x:number)=>Math.abs(x)<16?1.25:1;
const dz=(z:number)=>z>18&&z<40?32/22:z>44&&z<56?4/3:1;
type V={p:P3;n:P3;uv:[number,number]};
function split(poly:V[],axis:0|2,at:number,less:boolean){
  const out:V[]=[];for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[axis]-at)*(less?-1:1),db=(b.p[axis]-at)*(less?-1:1);
    if(da>=-1e-8)out.push(a);
    if(da<-1e-8&&db>1e-8||da>1e-8&&db<-1e-8){const t=da/(da-db);out.push({p:a.p.map((v,j)=>v+(b.p[j]-v)*t) as P3,n:a.n.map((v,j)=>v+(b.n[j]-v)*t) as P3,uv:a.uv.map((v,j)=>v+(b.uv[j]-v)*t) as [number,number]});}
  }return out;
}
export function expandGeometry(source:Geometry,rigid=false,keepUV=false):Geometry{
  if(rigid){
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(let i=0;i<source.positions.length;i+=3){x0=Math.min(x0,source.positions[i]);x1=Math.max(x1,source.positions[i]);z0=Math.min(z0,source.positions[i+2]);z1=Math.max(z1,source.positions[i+2]);}
    const x=(x0+x1)/2,z=(z0+z1)/2,ox=expandX(x)-x,oz=expandZ(z)-z;
    return {...source,positions:source.positions.map((v,i)=>v+(i%3===0?ox:i%3===2?oz:0))};
  }
  const g=geometry();
  for(let i=0;i<source.indices.length;i+=3){
    const ids=source.indices.slice(i,i+3);let polys:V[][]=[ids.map(n=>({p:source.positions.slice(n*3,n*3+3) as P3,n:source.normals.slice(n*3,n*3+3) as P3,uv:source.uvs.slice(n*2,n*2+2) as [number,number]}))];
    const original=polys[0],on=source.normals.slice(ids[0]*3,ids[0]*3+3),dominant=on.map(Math.abs).indexOf(Math.max(...on.map(Math.abs))),axes=[0,1,2].filter(a=>a!==dominant),[A,B]=axes;
    const a1=original[1].p[A]-original[0].p[A],b1=original[1].p[B]-original[0].p[B],a2=original[2].p[A]-original[0].p[A],b2=original[2].p[B]-original[0].p[B],det=a1*b2-a2*b1;
    const gradients=[0,1].map(k=>{const u1=original[1].uv[k]-original[0].uv[k],u2=original[2].uv[k]-original[0].uv[k];return Math.abs(det)>1e-10?[(u1*b2-u2*b1)/det,(a1*u2-a2*u1)/det]:[0,0];});
    for(const [axis,at] of [[0,-16],[0,16],[2,18],[2,40],[2,44],[2,56]] as const)polys=polys.flatMap(p=>{
      if(!p.some(v=>v.p[axis]<at-1e-8)||!p.some(v=>v.p[axis]>at+1e-8))return [p];return [split(p,axis,at,true),split(p,axis,at,false)].filter(p=>p.length>=3);
    });
    for(const p of polys){
      const cx=p.reduce((s,v)=>s+v.p[0],0)/p.length,cz=p.reduce((s,v)=>s+v.p[2],0)/p.length,base=g.positions.length/3;
      for(const v of p){const at=[expandX(v.p[0]),v.p[1],expandZ(v.p[2])],n=[v.n[0]/dx(cx),v.n[1],v.n[2]/dz(cz)],len=Math.hypot(...n);g.positions.push(...at);g.normals.push(...n.map(k=>k/len));
        // Preserve local authored UVs on cloth; keep material scale elsewhere.
        for(let k=0;k<2;k++)g.uvs.push(keepUV?v.uv[k]:v.uv[k]+gradients[k][0]*(at[A]-v.p[A])+gradients[k][1]*(at[B]-v.p[B]));}
      for(let j=1;j<p.length-1;j++)g.indices.push(base,base+j,base+j+1);
    }
  }return g;
}

