// Integer source-sample coordinates: 639 = 9 * 71. No oversampling of the R16.
export const PATCH_CELLS = 71;
export const LEVELS = { far: { span: 639, step: 9 }, mid: { span: 213, step: 3 }, near: { span: 71, step: 1 } };
const cache = new Map();
export function patchTopology(lod) {
  if (cache.has(lod)) return cache.get(lod);
  const { span, step } = LEVELS[lod], n = span / step;
  const offsets = [], indices = [], vertices = new Map();
  const vertex = (x,z) => {
    const key = `${x}:${z}`;
    if (vertices.has(key)) return vertices.get(key);
    const index = offsets.length; offsets.push([x,z]); vertices.set(key,index); return index;
  };
  for (let z=0;z<=n;z++) for(let x=0;x<=n;x++) vertex(x*step,z*step);
  for (let z=0;z<n;z++) for(let x=0;x<n;x++) {
    const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;
    const top=z===0,right=x===n-1,bottom=z===n-1,left=x===0;
    if(step===1 || !(top||right||bottom||left)){ indices.push(a,b,c,b,d,c); continue; }
    const polygon=[a];
    if(top)for(let i=1;i<step;i++)polygon.push(vertex(x*step+i,z*step));
    polygon.push(b);
    if(right)for(let i=1;i<step;i++)polygon.push(vertex((x+1)*step,z*step+i));
    polygon.push(d);
    if(bottom)for(let i=step-1;i>0;i--)polygon.push(vertex(x*step+i,(z+1)*step));
    polygon.push(c);
    if(left)for(let i=step-1;i>0;i--)polygon.push(vertex(x*step,z*step+i));
    const anchor=!(top||left)?a:!(top||right)?b:!(bottom||right)?d:c;
    const start=polygon.indexOf(anchor);
    for(let i=1;i<polygon.length-1;i++)indices.push(anchor,polygon[(start+i)%polygon.length],polygon[(start+i+1)%polygon.length]);
  }
  const cells=Array.from({length:n*n},()=>[]);
  for(let i=0;i<indices.length;i+=3){
    const points=indices.slice(i,i+3).map(index=>offsets[index]);
    const cx=Math.min(n-1,Math.floor(points.reduce((s,p)=>s+p[0],0)/3/step));
    const cz=Math.min(n-1,Math.floor(points.reduce((s,p)=>s+p[1],0)/3/step));
    cells[cz*n+cx].push(i);
  }
  const result={offsets,indices:new Uint16Array(indices),cells,n,step}; cache.set(lod,result); return result;
}
// Sample the actual triangles, including the fine perimeter fans (not a bilinear substitute).
export function topologyHeight(topology, heights, x, z) {
  const {offsets,indices,cells,n,step}=topology;
  x=Math.max(0,Math.min(n*step,x));z=Math.max(0,Math.min(n*step,z));
  const cell=cells[Math.min(n-1,Math.floor(z/step))*n+Math.min(n-1,Math.floor(x/step))];
  for(const i of cell){
    const ia=indices[i],ib=indices[i+1],ic=indices[i+2];
    const a=offsets[ia],b=offsets[ib],c=offsets[ic];
    const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(det)<1e-9)continue;
    const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(z-c[1]))/det;
    const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(z-c[1]))/det;
    if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return heights[ia]*u+heights[ib]*v+heights[ic]*(1-u-v);
  }
  throw new Error(`Missing terrain triangle at ${x},${z}`);
}
export function patchDistance(p,x,z,unit) {
  const size=LEVELS[p.lod].span*unit;
  return Math.hypot(Math.max(0,p.x-x,x-p.x-size),Math.max(0,p.z-z,z-p.z-size));
}
export function childPatches(parent,unit) {
  const lod=parent.lod==='far'?'mid':'near',span=LEVELS[lod].span;
  return Array.from({length:9},(_,i)=>{
    const gx=parent.gx+(i%3)*span,gz=parent.gz+Math.floor(i/3)*span;
    return {lod,gx,gz,tile:parent.tile,x:parent.tile.boundsXZ[0]+gx*unit,
      z:parent.tile.boundsXZ[1]+gz*unit,key:`${parent.tile.id}:${lod}:${gx}:${gz}`,parent:parent.key};
  });
}
