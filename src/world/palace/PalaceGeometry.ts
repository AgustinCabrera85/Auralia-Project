/** Deterministic orthogonal solids. Exterior faces are clipped against neighbours,
 * so shared walls/slab cells never leave coplanar duplicate triangles. */
export type P3=[number,number,number];
export type Box=readonly [number,number,number,number,number,number]; // xmin,xmax,ymin,ymax,zmin,zmax
export type Poly=readonly (readonly [number,number])[];
export type Geometry={positions:number[];indices:number[];uvs:number[];normals:number[]};
export const geometry=():Geometry=>({positions:[],indices:[],uvs:[],normals:[]});
const E=1e-7;
function cleanPolygon(points:readonly P3[]):P3[]{
  let p=points.filter((v,i)=>Math.hypot(...v.map((n,j)=>n-points[(i+points.length-1)%points.length][j]))>E);
  p=p.filter((b,i)=>{const a=p[(i+p.length-1)%p.length],c=p[(i+1)%p.length],u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-b[j]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>E;});
  return p;
}
export function face(g:Geometry,points:readonly P3[],normal:P3,uvScale=1):void{
  points=cleanPolygon(points);
  if(points.length<3)return;
  const a=points[0],b=points[1],c=points[2],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  // Babylon LH front faces are clockwise; normals are supplied explicitly.
  const ordered=cross.reduce((n,k,i)=>n+k*normal[i],0)>0?[...points].reverse():points;
  const base=g.positions.length/3,axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  for(const p of ordered){g.positions.push(...p);g.normals.push(...normal);
    g.uvs.push(p[axis===0?2:0]/uvScale,p[axis===1?2:1]/uvScale);}
  for(let i=1;i<ordered.length-1;i++)g.indices.push(base,base+i,base+i+1);
}
export function boxGeometry(b:Box,g=geometry(),wood=false):Geometry{unionBoxes([b],g,wood);return g;}
/** A solid dressed stone with a clipped top arris. Used for individual entry
 * treads so the stair reads as joined blocks instead of a single poured slab. */
export function wornStoneBlock(b:Box,g=geometry(),bevel=.025):Geometry{
  const [a,c,lo,hi,d,e]=b,q=bevel;
  face(g,[[a+q,hi,d+q],[c-q,hi,d+q],[c-q,hi,e-q],[a+q,hi,e-q]],[0,1,0]);
  face(g,[[a,lo,d],[c,lo,d],[c,lo,e],[a,lo,e]],[0,-1,0]);
  for(const [z,s] of [[d,-1],[e,1]]){
    face(g,[[a,lo,z],[c,lo,z],[c,hi-q,z],[a,hi-q,z]],[0,0,s]);
    face(g,[[a,hi-q,z],[c,hi-q,z],[c-q,hi,z-s*q],[a+q,hi,z-s*q]],[0,Math.SQRT1_2,s*Math.SQRT1_2]);
  }
  for(const [x,s] of [[a,-1],[c,1]]){
    face(g,[[x,lo,d],[x,lo,e],[x,hi-q,e],[x,hi-q,d]],[s,0,0]);
    face(g,[[x,hi-q,d],[x,hi-q,e],[x-s*q,hi,e-q],[x-s*q,hi,d+q]],[s*Math.SQRT1_2,Math.SQRT1_2,0]);
  }return g;
}
/** A timber cut perpendicular to its length, with longitudinal grain on every
 * side. Unlike a ramp this is a real rectangular section in its own frame. */
export function timberGeometry(a:readonly number[],b:readonly number[],width:number,depth:number):Geometry{
  const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d),along=d.map(v=>v/length),horizontal=Math.hypot(d[0],d[2]);
  const across=horizontal>1e-8?[-d[2]/horizontal,0,d[0]/horizontal]:[1,0,0];
  const up=[across[1]*along[2]-across[2]*along[1],across[2]*along[0]-across[0]*along[2],across[0]*along[1]-across[1]*along[0]];
  const g=boxGeometry([-width/2,width/2,0,length,-depth/2,depth/2],geometry(),true);
  for(let i=0;i<g.positions.length;i+=3){const p=g.positions.slice(i,i+3),n=g.normals.slice(i,i+3);
    for(let j=0;j<3;j++){g.positions[i+j]=a[j]+p[0]*across[j]+p[1]*along[j]+p[2]*up[j];g.normals[i+j]=n[0]*across[j]+n[1]*along[j]+n[2]*up[j];}}
  return g;
}
/** A single continuous handrail, cut on the angle bisector at each junction.
 * No overlapping boxes, square dangling ends, or caps between joined lengths. */
export function handrailGeometry(path:readonly P3[],width=.12,depth=.12):Geometry{
  const g=geometry(),dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0),unit=(a:number[])=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
  const directions=path.slice(1).map((p,i)=>unit(p.map((v,k)=>v-path[i][k])));let length=0;
  for(let i=0;i<directions.length;i++){
    const a=path[i],b=path[i+1],along=directions[i],across=unit([-along[2],0,along[0]]),up=[across[1]*along[2]-across[2]*along[1],across[2]*along[0]-across[0]*along[2],across[0]*along[1]-across[1]*along[0]];
    const ring=(p:P3,neighbour:number[]|undefined)=>{
      const n=neighbour?unit(along.map((v,k)=>v+neighbour[k])):along;
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
        const offset=across.map((k,j)=>k*u*width/2+up[j]*v*depth/2),t=-dot(n,offset)/dot(n,along);
        return p.map((k,j)=>k+offset[j]+along[j]*t) as P3;
      });
    };
    const start=ring(a,directions[i-1]),end=ring(b,directions[i+1]),segmentLength=Math.hypot(...b.map((v,k)=>v-a[k]));
    for(let j=0;j<4;j++){
      const k=(j+1)%4,n=(j===0?up.map(v=>-v):j===1?across:j===2?up:across.map(v=>-v)) as P3,first=g.positions.length/3;
      face(g,[start[j],start[k],end[k],end[j]],n);
      for(let v=first;v<g.positions.length/3;v++){const q=g.positions.slice(v*3,v*3+3).map((v,k)=>v-a[k]);g.uvs[v*2]=dot(q,j%2?up:across)/.35;g.uvs[v*2+1]=(length+dot(q,along))/2;}
    }
    if(i===0)face(g,start,along.map(v=>-v) as P3);
    if(i===directions.length-1)face(g,end,along as P3);
    length+=segmentLength;
  }return g;
}
/** A stepped masonry flight with a continuous inclined underside. The worn
 * leading arris is cut into the tread, without raising the walking surface. */
export function stairFlightGeometry(steps:readonly {bounds_xz:readonly number[];top_y:number}[],start:readonly number[],end:readonly number[],thickness=.3):Geometry{
  if(Math.abs(end[0]-start[0])<1e-7){
    const rotate=(p:readonly number[])=>[p[2],p[1],-p[0]];
    const g=stairFlightGeometry(steps.map(s=>({...s,bounds_xz:[s.bounds_xz[2],s.bounds_xz[3],-s.bounds_xz[1],-s.bounds_xz[0]]})),rotate(start),rotate(end),thickness);
    for(const values of [g.positions,g.normals])for(let i=0;i<values.length;i+=3){const x=values[i];values[i]=-values[i+2];values[i+2]=x;}
    return g;
  }
  const g=geometry(),slope=(end[1]-start[1])/(end[0]-start[0]),direction=Math.sign(end[0]-start[0]),length=Math.hypot(slope,1);
  const bottom=(x:number)=>start[1]+(x-start[0])*slope-thickness;
  const sorted=[...steps].sort((a,b)=>direction*(a.bounds_xz[0]-b.bounds_xz[0]));
  for(const [index,step] of sorted.entries()){
    const [a,b,c,d]=step.bounds_xz,y=step.top_y,ya=bottom(a),yb=bottom(b),lead=direction>0?a:b,trail=direction>0?b:a;
    const chamfer=.025,inner=lead+direction*chamfer;
    face(g,[[inner,y,c],[trail,y,c],[trail,y,d],[inner,y,d]],[0,1,0]);
    face(g,[[lead,y-chamfer,c],[inner,y,c],[inner,y,d],[lead,y-chamfer,d]],[-direction/Math.SQRT2,1/Math.SQRT2,0]);
    face(g,[[a,ya,c],[b,yb,c],[b,yb,d],[a,ya,d]],[slope/length,-1/length,0]);
    for(const [z,n] of [[c,-1],[d,1]])face(g,[[lead,bottom(lead),z],[trail,bottom(trail),z],[trail,y,z],[inner,y,z],[lead,y-chamfer,z]],[0,0,n]);
    const previous=index?sorted[index-1].top_y:bottom(lead);
    face(g,[[lead,previous,c],[lead,y-chamfer,c],[lead,y-chamfer,d],[lead,previous,d]],[-direction,0,0]);
    if(index===sorted.length-1)face(g,[[trail,bottom(trail),c],[trail,y,c],[trail,y,d],[trail,bottom(trail),d]],[direction,0,0]);
  }
  return g;
}
export function turnedGeometry(x:number,z:number,profile:readonly (readonly [number,number])[],sides=12,smooth=false,profileUV=false):Geometry{
  const g=geometry();
  const distances=[0];for(let j=1;j<profile.length;j++)distances.push(distances[j-1]+Math.hypot(profile[j][0]-profile[j-1][0],profile[j][1]-profile[j-1][1]));
  for(let j=1;j<profile.length;j++)for(let i=0;i<sides;i++){
    const a=i*Math.PI*2/sides,b=(i+1)*Math.PI*2/sides,[r0,y0]=profile[j-1],[r1,y1]=profile[j];
    const n:P3=[Math.cos((a+b)/2)*(y1-y0),r0-r1,Math.sin((a+b)/2)*(y1-y0)],l=Math.hypot(...n);
    if(l<1e-8)continue;
    const first=g.positions.length/3;
    face(g,[[x+r0*Math.cos(a),y0,z+r0*Math.sin(a)],[x+r0*Math.cos(b),y0,z+r0*Math.sin(b)],[x+r1*Math.cos(b),y1,z+r1*Math.sin(b)],[x+r1*Math.cos(a),y1,z+r1*Math.sin(a)]],n.map(v=>v/l) as P3);
    if(smooth)for(let k=first;k<g.positions.length/3;k++){
      const angle=Math.atan2(g.positions[k*3+2]-z,g.positions[k*3]-x),len=Math.hypot(y1-y0,r0-r1);
      g.normals.splice(k*3,3,Math.cos(angle)*(y1-y0)/len,(r0-r1)/len,Math.sin(angle)*(y1-y0)/len);
      g.uvs[k*2]=angle*.24;g.uvs[k*2+1]=g.positions[k*3+1];
      if(profileUV){
        // Follow the meridian, including horizontal rims. Height-only V collapses
        // their UV triangles and makes normal/parallax derivatives undefined.
        const radius=Math.hypot(g.positions[k*3]-x,g.positions[k*3+2]-z),y=g.positions[k*3+1];
        const continuous=angle+Math.round(((a+b)/2-angle)/(Math.PI*2))*Math.PI*2;
        g.uvs[k*2]=continuous*.75;g.uvs[k*2+1]=distances[j-1]+((radius-r0)*(r1-r0)+(y-y0)*(y1-y0))/len;
      }
    }
  }return g;
}
/** Central pavilion follows the user's final reference: a front-facing gable.
 * The footprint, eaves and maximum ridge height remain those of the plan. */
export function pavilionRoof(r:{bounds_xz:readonly number[];eave_y:number;ridge_y:number}){
  const [a,b,c,d]=r.bounds_xz,y=r.eave_y,h=r.ridge_y,x=(a+b)/2,roof=geometry(),ends=geometry();
  const slope=(h-y)/(x-a),length=Math.hypot(1,slope);
  face(roof,[[a,y,c],[x,h,c],[x,h,d],[a,y,d]],[-slope/length,1/length,0],1.5);
  face(roof,[[x,h,c],[b,y,c],[b,y,d],[x,h,d]],[slope/length,1/length,0],1.5);
  face(ends,[[a,y,c],[b,y,c],[x,h,c]],[0,0,-1]);
  face(ends,[[a,y,d],[b,y,d],[x,h,d]],[0,0,1]);
  return {roof,ends};
}
export function unionBoxes(boxes:readonly Box[],g=geometry(),wood=false,occluders:readonly Box[]=[]):Geometry{
  boxes=boxes.filter(b=>b[1]-b[0]>E&&b[3]-b[2]>E&&b[5]-b[4]>E);
  boxes.forEach((b,index)=>{
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const other=[0,1,2].filter(a=>a!==axis),u=other[0],v=other[1],at=b[axis*2+(sign>0?1:0)];
      const blockers=boxes.filter((q,j)=>j!==index&&q[u*2]<b[u*2+1]-E&&q[u*2+1]>b[u*2]+E&&q[v*2]<b[v*2+1]-E&&q[v*2+1]>b[v*2]+E&&
        (sign>0?q[axis*2]<=at+E&&q[axis*2+1]>at+E:q[axis*2]<at-E&&q[axis*2+1]>=at-E||false));
      // Neighbouring assemblies own the touching/buried surface. This removes
      // plaster caps at the exact level of a slab without moving either part.
      blockers.push(...occluders.filter(q=>q[u*2]<b[u*2+1]-E&&q[u*2+1]>b[u*2]+E&&q[v*2]<b[v*2+1]-E&&q[v*2+1]>b[v*2]+E&&q[axis*2]<=at+E&&q[axis*2+1]>=at-E));
      // Identical exterior planes are owned by exactly one source box.
      boxes.forEach((q,j)=>{if(j<index&&Math.abs(q[axis*2+(sign>0?1:0)]-at)<E&&
        q[u*2]<b[u*2+1]-E&&q[u*2+1]>b[u*2]+E&&q[v*2]<b[v*2+1]-E&&q[v*2+1]>b[v*2]+E)blockers.push(q);});
      let rects:number[][]=[[b[u*2],b[u*2+1],b[v*2],b[v*2+1]]];
      for(const q of blockers)rects=rects.flatMap(r=>subtractRect(r,[q[u*2],q[u*2+1],q[v*2],q[v*2+1]]));
      const normal:P3=[0,0,0];normal[axis]=sign;
      for(const r of rects){const p=(a:number,c:number):P3=>{const out:P3=[0,0,0];out[axis]=at;out[u]=a;out[v]=c;return out;};
        const first=g.positions.length/3;face(g,[p(r[0],r[2]),p(r[1],r[2]),p(r[1],r[3]),p(r[0],r[3])],normal);
        if(wood){const lengths=[b[1]-b[0],b[3]-b[2],b[5]-b[4]],long=lengths.indexOf(Math.max(...lengths)),across=[0,1,2].find(a=>a!==long&&a!==axis)??u;
          for(let n=first;n<g.positions.length/3;n++){g.uvs[n*2]=g.positions[n*3+across]/.35;g.uvs[n*2+1]=g.positions[n*3+(long===axis?v:long)]/2;}}
      }
    }
  });return g;
}
export function subtractRect(a:readonly number[],b:readonly number[]):number[][]{
  const x0=Math.max(a[0],b[0]),x1=Math.min(a[1],b[1]),z0=Math.max(a[2],b[2]),z1=Math.min(a[3],b[3]);
  if(x1-x0<E||z1-z0<E)return [[...a]];
  return [[a[0],x0,a[2],a[3]],[x1,a[1],a[2],a[3]],[x0,x1,a[2],z0],[x0,x1,z1,a[3]]].filter(r=>r[1]-r[0]>E&&r[3]-r[2]>E);
}
export function inPoly(p:Poly,x:number,z:number):boolean{
  let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function slabBoxes(outer:Poly,holes:readonly Poly[],bottom:number,top:number):Box[]{
  const ps=[outer,...holes].flat(),xs=[...new Set(ps.map(p=>p[0]))].sort((a,b)=>a-b),zs=[...new Set(ps.map(p=>p[1]))].sort((a,b)=>a-b),result:Box[]=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2;
    if(inPoly(outer,x,z)&&!holes.some(h=>inPoly(h,x,z)))result.push([xs[i-1],xs[i],bottom,top,zs[j-1],zs[j]]);
  }return result;
}
export function rampGeometry(start:readonly number[],end:readonly number[],width:number,thickness=.12,baseY?:number):Geometry{
  const [x,y,z]=start,[ex,ey,ez]=end,dx=ex-x,dz=ez-z,len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2;
  const a:P3=[x+nx,y,z+nz],b:P3=[ex+nx,ey,ez+nz],c:P3=[ex-nx,ey,ez-nz],d:P3=[x-nx,y,z-nz];
  const slope=(ey-y)/len,norm=Math.hypot(1,slope),g=geometry();
  face(g,[a,b,c,d],[-dx/len*slope/norm,1/norm,-dz/len*slope/norm]);
  const lower=(p:P3):P3=>[p[0],baseY??p[1]-thickness,p[2]];
  face(g,[lower(a),lower(b),lower(c),lower(d)],baseY===undefined?[dx/len*slope/norm,-1/norm,dz/len*slope/norm]:[0,-1,0]);
  for(const [p,q] of [[a,b],[b,c],[c,d],[d,a]]){const xx=q[0]-p[0],zz=q[2]-p[2],l=Math.hypot(xx,zz);face(g,[p,q,lower(q),lower(p)],[zz/l,0,-xx/l]);}
  return g;
}
/** Clip a roof polygon against one half-plane in XZ, interpolating height. */
function clip(p:readonly P3[],axis:0|2,k:number,keepLess:boolean):P3[]{
  const out:P3[]=[];for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],da=(a[axis]-k)*(keepLess?1:-1),db=(b[axis]-k)*(keepLess?1:-1);
    if(da<=E)out.push(a);if((da<-E&&db>E)||(da>E&&db<-E)){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t) as P3);}
  }return out;
}
export function roofGeometry(r:{bounds_xz:readonly number[];eave_y:number;ridge_y:number;ridge_axis:string;hip_run:number;cutouts_xz:readonly (readonly number[])[]}):Geometry{
  const [x0,x1,z0,z1]=r.bounds_xz,y=r.eave_y,h=r.ridge_y;
  const a:P3=[x0,y,z0],b:P3=[x1,y,z0],c:P3=[x1,y,z1],d:P3=[x0,y,z1];
  const e:P3=r.ridge_axis==='X'?[x0+r.hip_run,h,(z0+z1)/2]:[(x0+x1)/2,h,z0+r.hip_run];
  const f:P3=r.ridge_axis==='X'?[x1-r.hip_run,h,(z0+z1)/2]:[(x0+x1)/2,h,z1-r.hip_run];
  let polys:P3[][]=r.ridge_axis==='X'?[[a,b,f,e],[b,c,f],[c,d,e,f],[d,a,e]]:[[a,b,e],[b,c,f,e],[c,d,f],[d,a,e,f]];
  for(const cut of r.cutouts_xz)polys=polys.flatMap(p=>{
    const left=clip(p,0,cut[0],true),right=clip(p,0,cut[1],false),middle=clip(clip(p,0,cut[0],false),0,cut[1],true);
    return [left,right,clip(middle,2,cut[2],true),clip(middle,2,cut[3],false)].filter(q=>q.length>=3);
  });
  const g=geometry();for(let p of polys){p=cleanPolygon(p);if(p.length<3)continue;
    const a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    let n:P3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);if(len<E)continue;
    n=n.map(v=>v/len*(n[1]<0?-1:1)) as P3;face(g,p,n,1.5);
    // Close the vertical roof abutment left by each tower cut-out. Adjacent
    // hip roofs have different eave heights, so a cut alone exposes the attic.
    for(let i=0;i<p.length;i++)for(const cut of r.cutouts_xz){
      const a=p[i],b=p[(i+1)%p.length];let normal:P3|null=null;
      if(Math.abs(a[0]-cut[1])<E&&Math.abs(b[0]-cut[1])<E&&Math.min(a[2],b[2])>=cut[2]-E&&Math.max(a[2],b[2])<=cut[3]+E)normal=[-1,0,0];
      if(Math.abs(a[2]-cut[3])<E&&Math.abs(b[2]-cut[3])<E&&Math.min(a[0],b[0])>=cut[0]-E&&Math.max(a[0],b[0])<=cut[1]+E)normal=[0,0,-1];
      if(Math.abs(a[0]-cut[0])<E&&Math.abs(b[0]-cut[0])<E&&Math.min(a[2],b[2])>=cut[2]-E&&Math.max(a[2],b[2])<=cut[3]+E)normal=[1,0,0];
      if(normal)face(g,[a,b,[b[0],y,b[2]],[a[0],y,a[2]]],normal,1.5);
    }
  }return g;
}
