import {face,geometry,type Geometry,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';

type UV=[number,number];
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=(v:P3):P3=>{const l=Math.hypot(...v);return v.map(n=>n/l) as P3;};
function clip(poly:UV[],axis:0|1,at:number,above:boolean){
  const out:UV[]=[],sign=above?1:-1;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-at)*sign,db=(b[axis]-at)*sign;
    if(da>=-1e-8)out.push(a);
    if(da*db< -1e-16){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }return out;
}
/** Rounded, overlapping clay courses clipped to the actual roof envelope.
 * The sealed deck still owns continuity; these shallow skins never span the
 * courtyard, bridge a valley or introduce an independent collision surface. */
export function palaceRoofTiles(roof:Geometry):Part[]{
  const skins=[geometry(),geometry(),geometry()],width=.4,length=.65,segments=5;
  for(let triangle=0;triangle<roof.indices.length;triangle+=3){
    const ids=roof.indices.slice(triangle,triangle+3),ps=ids.map(i=>roof.positions.slice(i*3,i*3+3) as P3);
    const n=roof.normals.slice(ids[0]*3,ids[0]*3+3) as P3,h=Math.hypot(n[0],n[2]);if(h<1e-6)continue;
    const across:P3=[n[2]/h,0,-n[0]/h],down:P3=[n[0]*n[1]/h,-h,n[2]*n[1]/h],plane=dot(ps[0],n);
    const poly=ps.map(p=>[dot(p,across),dot(p,down)] as UV);
    const us=poly.map(p=>p[0]),vs=poly.map(p=>p[1]);
    for(let row=Math.floor(Math.min(...vs)/length);row<=Math.floor(Math.max(...vs)/length);row++){
      const v0=row*length,v1=v0+length,rowPoly=clip(clip(poly,1,v0,true),1,v1,false);if(rowPoly.length<3)continue;
      for(let col=Math.floor(Math.min(...us)/width);col<=Math.floor(Math.max(...us)/width);col++){
        const u0=col*width+.006,u1=(col+1)*width-.006;
        const tile=clip(clip(rowPoly,0,u0,true),0,u1,false);if(tile.length<3)continue;
        const seed=Math.abs(Math.imul(col+719,73856093)^Math.imul(row+337,19349663)),g=skins[seed%11<2?1:seed%11>8?2:0];
        const radius=.072+(seed%7)*.0015;
        const relief=(u:number,v:number)=>.018+radius*Math.sin(Math.PI*(u-u0)/(u1-u0))+.025*(v-v0)/length;
        const point=(p:UV,lift=relief(...p)):P3=>n.map((v,i)=>across[i]*p[0]+down[i]*p[1]+v*(plane+lift)) as P3;
        const normal=(u:number):P3=>unit(n.map((v,i)=>v-across[i]*radius*Math.PI/(u1-u0)*Math.cos(Math.PI*(u-u0)/(u1-u0))-down[i]*.025/length) as P3);
        for(let k=0;k<segments;k++){
          const a=u0+(u1-u0)*k/segments,b=u0+(u1-u0)*(k+1)/segments;
          const q=clip(clip(tile,0,a,true),0,b,false);if(q.length<3)continue;
          const first=g.positions.length/3;face(g,q.map(p=>point(p)),normal((a+b)/2));
          for(let i=first;i<g.positions.length/3;i++){
            const p=g.positions.slice(i*3,i*3+3),u=dot(p,across),v=dot(p,down);
            g.normals.splice(i*3,3,...normal(u));g.uvs[i*2]=u;g.uvs[i*2+1]=v;
          }
          // Exposed lower lips have thickness and a shadowed end, not a sheet.
          for(let j=0;j<q.length;j++){
            const p=q[j],r=q[(j+1)%q.length];
            if(Math.abs(p[1]-v1)<1e-7&&Math.abs(r[1]-v1)<1e-7)
              face(g,[point(p),point(r),point(r,.012),point(p,.012)],down);
          }
        }
      }
    }
  }
  return skins.map((data,i)=>({id:'roof-clay-courses'+i,material:['roofTile','roofHoney','roofRusset'][i],solid:false,detail:false,data}));
}
