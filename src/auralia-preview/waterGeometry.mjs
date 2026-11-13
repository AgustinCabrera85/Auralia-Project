export function polygonDistance(points,x,z){
  let inside=false,distance=Infinity;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  return distance*(inside?1:-1);
}
export function clipWaterTriangle(points){
  let polygon=points;
  // Keep the intersection of the source terrain's submerged triangle and the
  // approved water footprint. No low-resolution mask controls the shore edge.
  for(const field of ['depth','coverage']){
    const out=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      if(a[field]>=0)out.push(a);
      if((a[field]>=0)!==(b[field]>=0)){
        const t=a[field]/(a[field]-b[field]);
        out.push(Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*t])));
      }
    }
    polygon=out;
  }
  return polygon;
}
export function triangulateBoundary(raw){
  const points=raw.filter((p,i)=>!i||Math.hypot(p[0]-raw[i-1][0],p[1]-raw[i-1][1])>1e-6);
  if(Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-6)points.pop();
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area=points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0);
  const remaining=points.map((_,i)=>i);if(area<0)remaining.reverse();
  const indices=[];
  while(remaining.length>3){
    let found=false;
    for(let i=0;i<remaining.length;i++){
      const a=remaining[(i-1+remaining.length)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
      if(cross(points[a],points[b],points[c])<=1e-8)continue;
      if(remaining.some(j=>j!==a&&j!==b&&j!==c&&cross(points[a],points[b],points[j])>=-1e-8&&cross(points[b],points[c],points[j])>=-1e-8&&cross(points[c],points[a],points[j])>=-1e-8))continue;
      indices.push(a,b,c);remaining.splice(i,1);found=true;break;
    }
    if(!found)throw new Error('Invalid approved lake boundary: cannot triangulate without changing it');
  }
  indices.push(...remaining);return {points,indices};
}
export function* buildLocalWater(atlas,field,polygons,oceanAt,center,cells=142){
  const unit=atlas.size/(atlas.resolution-1),half=cells*unit/2,y=atlas.manifest.seaLevelMetres;
  const positions=[],uvs=[],indices=[],grid=[];
  for(let iz=0;iz<=cells;iz++){
    for(let ix=0;ix<=cells;ix++){
      const x=center.x-half+ix*unit,z=center.z-half+iz*unit;
      const lake=polygons.reduce((d,p)=>Math.max(d,polygonDistance(p,x,z)),-Infinity);
      const ocean=oceanAt(x,z);
      grid.push({x,z,depth:y-field.heightAt(x,z),coverage:ocean?1:lake,kind:lake>=0?3:2});
    }
    yield;
  }
  for(let iz=0;iz<cells;iz++){
    for(let ix=0;ix<cells;ix++){
      const a=iz*(cells+1)+ix,b=a+1,c=a+cells+1,d=c+1;
      for(const triangle of [[a,b,c],[b,d,c]]){
        const polygon=clipWaterTriangle(triangle.map(i=>grid[i]));
        if(polygon.length<3)continue;
        const start=positions.length/3;
        for(const p of polygon){positions.push(p.x-center.x,y,p.z-center.z);uvs.push(Math.max(0,p.depth),p.kind);}
        for(let i=1;i<polygon.length-1;i++)indices.push(start,start+i,start+i+1);
      }
    }
    yield;
  }
  return {positions:new Float32Array(positions),uvs:new Float32Array(uvs),indices:new Uint32Array(indices),half};
}
