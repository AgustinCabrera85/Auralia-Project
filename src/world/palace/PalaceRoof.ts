import {face,geometry,pavilionRoof,roofGeometry,type Geometry,type P3} from './PalaceGeometry';
import {PALACE_TOWER_CENTERS,towerRoofHole} from './PalaceTowerLayout';
import {PALACE_DESIGN} from './PalaceDesign';
type Surface={p:P3[];normal:P3;plane:P3};
const E=1e-7;
// The roof projects beyond the column axes; the ceiling stops at those axes.
// These are distinct construction edges, not coincident material layers.
export const COURTYARD_EAVE={left:-15.5,right:15.5,front:18.5,back:39.5,soffit:8.9} as const;
function clip(p:P3[],a:number,b:number,c:number,positive=true){
  const out:P3[]=[],s=positive?1:-1;
  for(let i=0;i<p.length;i++){
    const v=p[i],w=p[(i+1)%p.length],d=s*(a*v[0]+b*v[2]+c),e=s*(a*w[0]+b*w[2]+c);
    if(d>=-E)out.push(v);
    if(d>E&&e<-E||d<-E&&e>E){const t=d/(d-e);out.push(v.map((n,j)=>n+(w[j]-n)*t) as P3);}
  }return out;
}
function subtract(p:P3[],q:P3[]){
  let current=p;const out:P3[][]=[],area=q.reduce((s,v,i)=>{const w=q[(i+1)%q.length];return s+v[0]*w[2]-w[0]*v[2];},0),sign=Math.sign(area);
  if(Math.abs(area)<E)return [p];
  for(let i=0;i<q.length&&current.length>=3;i++){
    const v=q[i],w=q[(i+1)%q.length],dx=w[0]-v[0],dz=w[2]-v[2],a=-dz*sign,b=dx*sign,c=(dz*v[0]-dx*v[2])*sign;
    const outside=clip(current,a,b,c,false);if(outside.length>=3)out.push(outside);
    current=clip(current,a,b,c);
  }return out;
}
/** A continuous four-sided roof around the open courtyard. Intersecting
 * pavilion/tower roofs are clipped to the upper envelope: no stacked surfaces,
 * low internal hip ends or accidental sight holes through the roof. */
export function palaceRoof(){
  const base=geometry(),y=9.2,h=11.8;
  const outer:P3[]=[[-36.8,y,-.8],[36.8,y,-.8],[36.8,y,56.8],[-36.8,y,56.8]];
  const ridge:P3[]=[[-26.4,h,8.6],[26.4,h,8.6],[26.4,h,48.4],[-26.4,h,48.4]];
  const eave=COURTYARD_EAVE;
  const inner:P3[]=[[eave.left,y,eave.front],[eave.right,y,eave.front],[eave.right,y,eave.back],[eave.left,y,eave.back]];
  const support:P3[]=[[-16,y,18],[16,y,18],[16,y,40],[-16,y,40]];
  const quad=(p:P3[])=>{
    const a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    let n:P3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
    n=n.map(v=>v/len*(n[1]<0?-1:1)) as P3;face(base,p,n,1.5);
  };
  for(let i=0;i<4;i++){const j=(i+1)%4;quad([outer[i],outer[j],ridge[j],ridge[i]]);quad([ridge[i],ridge[j],inner[j],inner[i]]);}
  const gallery=geometry();
  for(const s of [-1,1]){
    const a=Math.min(s*10.4,s*28),b=Math.max(s*10.4,s*28),rise=.5,run=3.7,n=Math.hypot(rise,run);
    face(gallery,[[a,8.9,-3.6],[b,8.9,-3.6],[b,9.4,.1],[a,9.4,.1]],[0,run/n,-rise/n]);
  }
  const dormers=[-23,-16,16,23].map(x=>pavilionRoof({bounds_xz:[x-1.25,x+1.25,.5,4.8],eave_y:11.25,ridge_y:12.5}).roof);
  const towers=geometry();for(const cx of [-32,32])face(towers,[[cx-4.8,PALACE_DESIGN.towerEave,-.8],[cx+4.8,PALACE_DESIGN.towerEave,-.8],[cx+4.8,PALACE_DESIGN.towerEave,10.8],[cx-4.8,PALACE_DESIGN.towerEave,10.8]],[0,1,0]);
  const inputs:Geometry[]=[base,gallery,roofGeometry(PALACE_DESIGN.pavilion),...dormers,towers];
  const surfaces:Surface[]=[];
  for(const g of inputs)for(let i=0;i<g.indices.length;i+=3){
    const ids=g.indices.slice(i,i+3),p=ids.map(n=>g.positions.slice(n*3,n*3+3) as P3),n=g.normals.slice(ids[0]*3,ids[0]*3+3) as P3;
    if(n[1]<E)continue;
    const a=-n[0]/n[1],b=-n[2]/n[1],c=p[0][1]-a*p[0][0]-b*p[0][2];surfaces.push({p,normal:n,plane:[a,b,c]});
  }
  const roof=geometry();
  surfaces.forEach((s,i)=>{
    let polys=[s.p];
    for(let j=0;j<surfaces.length&&polys.length;j++){
      if(i===j)continue;const t=surfaces[j],d=t.plane.map((v,k)=>v-s.plane[k]);
      const same=d.every(v=>Math.abs(v)<E);if(same&&j>i)continue;
      const blocker=same?t.p:clip(t.p,d[0],d[1],d[2]-E);
      if(blocker.length>=3)polys=polys.flatMap(p=>subtract(p,blocker));
    }
    if(Math.abs(s.plane[2]-PALACE_DESIGN.towerEave)<E&&Math.abs(s.normal[1]-1)<E)
      for(const cx of PALACE_TOWER_CENTERS)polys=polys.flatMap(p=>subtract(p,towerRoofHole(cx).map(([x,z])=>[x,PALACE_DESIGN.towerEave,z])));
    for(const p of polys){
      const first=roof.positions.length/3;face(roof,p,s.normal);
      const [nx,ny,nz]=s.normal,horizontal=Math.hypot(nx,nz),across=horizontal>1e-7?[nz/horizontal,0,-nx/horizontal]:[1,0,0],down=horizontal>1e-7?[nx*ny/horizontal,-horizontal,nz*ny/horizontal]:[0,0,1];
      for(let j=first;j<roof.positions.length/3;j++){
        const v=roof.positions.slice(j*3,j*3+3);
        roof.uvs[j*2]=v.reduce((sum,n,k)=>sum+n*across[k],0)/1.8;
        roof.uvs[j*2+1]=v.reduce((sum,n,k)=>sum+n*down[k],0)/1.6;
      }
    }
  });
  // The tile skin rests on a closed 18 cm roof deck. Its soffit and cut edges
  // remain visible from below; never use a two-sided paper-thin roof as a fix.
  const soffit=geometry(),fascia=geometry(),edges:{a:P3;b:P3}[]=[],thickness=.18;
  for(let i=0;i<roof.indices.length;i+=3){
    const ids=roof.indices.slice(i,i+3),p=ids.map(n=>roof.positions.slice(n*3,n*3+3) as P3),normal=roof.normals.slice(ids[0]*3,ids[0]*3+3) as P3;
    // The short courtyard overhang has a level underside. Remove that portion
    // of the inclined deck lining instead of stacking a second visible skin.
    for(const q of subtract(p,support))face(soffit,q.map(v=>[v[0],v[1]-thickness,v[2]] as P3),normal.map(v=>-v) as P3);
    for(let j=0;j<3;j++)edges.push({a:p[j],b:p[(j+1)%3]});
  }
  for(let i=0;i<4;i++){
    const j=(i+1)%4,first=soffit.positions.length/3;
    face(soffit,[support[i],support[j],inner[j],inner[i]].map(v=>[v[0],eave.soffit,v[2]] as P3),[0,-1,0]);
    const along=i%2===0?0:2,cross=along===0?2:0;
    for(let k=first;k<soffit.positions.length/3;k++){soffit.uvs[k*2]=soffit.positions[k*3+cross];soffit.uvs[k*2+1]=soffit.positions[k*3+along]/2;}
  }
  // Subtract collinear neighbouring edges too: envelope clipping creates
  // T-junctions, so cancelling only exact pairs would leave internal fins.
  for(const [i,e] of edges.entries()){
    const d=e.b.map((v,j)=>v-e.a[j]),len2=d.reduce((s,v)=>s+v*v,0);if(len2<E)continue;
    let intervals=[[0,1]];
    for(const [j,q] of edges.entries()){
      if(i===j)continue;
      const ts=[q.a,q.b].map(v=>v.reduce((s,n,k)=>s+(n-e.a[k])*d[k],0)/len2);
      if([q.a,q.b].some((v,k)=>Math.hypot(...v.map((n,a)=>n-e.a[a]-ts[k]*d[a]))>1e-5))continue;
      const lo=Math.max(0,Math.min(...ts)),hi=Math.min(1,Math.max(...ts));if(hi-lo<E)continue;
      intervals=intervals.flatMap(([a,b])=>hi<=a+E||lo>=b-E?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([a,b])=>b-a>E));
    }
    for(const [lo,hi] of intervals){
      const a=e.a.map((v,j)=>v+d[j]*lo) as P3,b=e.a.map((v,j)=>v+d[j]*hi) as P3,l=Math.hypot(d[0],d[2]);if(l<E)continue;
      const courtyardEdge=inner.some((p,k)=>{
        const q=inner[(k+1)%4],axis=p[0]===q[0]?0:2;
        return Math.abs(a[axis]-p[axis])<E&&Math.abs(b[axis]-p[axis])<E&&Math.abs(a[1]-y)<E&&Math.abs(b[1]-y)<E;
      });
      const first=fascia.positions.length/3,depth=courtyardEdge?y-eave.soffit:thickness;
      face(fascia,[a,b,[b[0],b[1]-depth,b[2]],[a[0],a[1]-depth,a[2]]],[d[2]/l,0,-d[0]/l]);
      for(let k=first;k<fascia.positions.length/3;k++){
        const p=fascia.positions.slice(k*3,k*3+3);
        fascia.uvs[k*2]=p[1];fascia.uvs[k*2+1]=(p[0]*d[0]+p[2]*d[2])/l/2;
      }
    }
  }
  // Gable plaster meets the deck underside. Extending it to the tile skin
  // would put plaster and the timber verge in exactly the same vertical plane.
  const ends=geometry();
  for(const x of [-23,-16,16,23])for(const [z,normal] of [[.5,-1],[4.8,1]])
    face(ends,[[x-1.07,11.25,z],[x+1.07,11.25,z],[x,12.32,z]],[0,0,normal]);
  // Walkable battlements use stone, sharing the same sealed envelope.
  const pitched=geometry(),terraces=geometry();
  for(let i=0;i<roof.indices.length;i+=3){
    const ids=roof.indices.slice(i,i+3),n=roof.normals.slice(ids[0]*3,ids[0]*3+3) as P3;
    const out=n[1]>.999999?terraces:pitched,base=out.positions.length/3;
    for(const j of ids){out.positions.push(...roof.positions.slice(j*3,j*3+3));out.normals.push(...roof.normals.slice(j*3,j*3+3));out.uvs.push(...roof.uvs.slice(j*2,j*2+2));}
    out.indices.push(base,base+1,base+2);
  }
  return {roof:pitched,terraces,ends,soffit,fascia};
}
