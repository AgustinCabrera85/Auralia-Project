import {face,geometry,type Geometry,type P3} from './PalaceGeometry';

export function joinSculpture(out:Geometry,g:Geometry){
  const offset=out.positions.length/3;
  out.positions.push(...g.positions);out.normals.push(...g.normals);out.uvs.push(...g.uvs);out.indices.push(...g.indices.map(i=>i+offset));
}

/** Small closed sculpted volumes, with analytic normals instead of flat facets. */
export function ellipsoid(center:P3,radii:P3,angle=0,segments=16,rings=10){
  const g=geometry(),c=Math.cos(angle),s=Math.sin(angle);
  const point=(u:number,v:number):P3=>{
    const x=Math.cos(u)*Math.sin(v)*radii[0],y=Math.cos(v)*radii[1];
    return [center[0]+x*c-y*s,center[1]+x*s+y*c,center[2]+Math.sin(u)*Math.sin(v)*radii[2]];
  };
  const normal=(p:P3):P3=>{
    const x=p[0]-center[0],y=p[1]-center[1],nx=(x*c+y*s)/radii[0]**2,ny=(-x*s+y*c)/radii[1]**2,nz=(p[2]-center[2])/radii[2]**2;
    const l=Math.hypot(nx,ny,nz);return [(nx*c-ny*s)/l,(nx*s+ny*c)/l,nz/l];
  };
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
    const u=i*Math.PI*2/segments,uu=(i+1)*Math.PI*2/segments,v=j*Math.PI/rings,vv=(j+1)*Math.PI/rings;
    const start=g.positions.length/3;face(g,[point(u,v),point(uu,v),point(uu,vv),point(u,vv)],normal(point((u+uu)/2,(v+vv)/2)));
    for(let n=start;n<g.positions.length/3;n++)g.normals.splice(n*3,3,...normal(g.positions.slice(n*3,n*3+3) as P3));
  }return g;
}

/** A closed tube along a curve: used for stems, scrolls and carved feathers. */
export function sculptedTube(points:readonly P3[],radius:number,sides=8){
  const g=geometry(),rings:P3[][]=[],directions:P3[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=b.map((v,k)=>v-a[k]),l=Math.hypot(...d),n=d.map(v=>v/l) as P3;
    const axis=Math.abs(n[1])<.9?[0,1,0]:[1,0,0],x=[n[1]*axis[2]-n[2]*axis[1],n[2]*axis[0]-n[0]*axis[2],n[0]*axis[1]-n[1]*axis[0]],xl=Math.hypot(...x);x.forEach((v,k)=>x[k]=v/xl);
    const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]];
    rings.push(Array.from({length:sides},(_,j)=>points[i].map((v,k)=>v+radius*(Math.cos(j*Math.PI*2/sides)*x[k]+Math.sin(j*Math.PI*2/sides)*y[k])) as P3));directions.push(n);
  }
  for(let i=1;i<rings.length;i++)for(let j=0;j<sides;j++){
    const k=(j+1)%sides,n=rings[i][j].map((v,k)=>v-points[i][k]),l=Math.hypot(...n),start=g.positions.length/3;
    face(g,[rings[i-1][j],rings[i][j],rings[i][k],rings[i-1][k]],n.map(v=>v/l) as P3);
    for(let q=start;q<g.positions.length/3;q++){
      const p=g.positions.slice(q*3,q*3+3),near=[i-1,i].sort((a,b)=>Math.hypot(...p.map((v,k)=>v-rings[a][j][k]))-Math.hypot(...p.map((v,k)=>v-rings[b][j][k])))[0];
      const v=p.map((v,k)=>v-points[near][k]),length=Math.hypot(...v);g.normals.splice(q*3,3,...v.map(n=>n/length));
    }
  }
  face(g,rings[0],directions[0].map(v=>-v) as P3);face(g,rings.at(-1)!,directions.at(-1)!);return g;
}
