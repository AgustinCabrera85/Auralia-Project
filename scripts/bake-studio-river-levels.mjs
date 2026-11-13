// Derived hydraulic data only: never writes the approved splines or R16 tiles.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=name=>JSON.parse(readFileSync(`public/auralia-preview/data/${name}.json`));
// Altaluz describes the falling reach of Cumbres, not a parallel water body.
const manifest=read('manifest'),splines=read('splines').filter(s=>s.type==='river'&&s.id!=='catarata-alta-altaluz'),hydrology=read('hidrologia_v3_6');
const cache=new Map(),hash=createHash('sha256');
// A Windows checkout may convert text to CRLF; hydraulic inputs are unchanged.
for(const name of ['manifest','splines','hidrologia_v3_6'])hash.update(readFileSync(`public/auralia-preview/data/${name}.json`,'utf8').replace(/\r\n/g,'\n'));
// Hash all inputs, but retain at most four height sectors during the bake.
for(const tile of manifest.tiles)hash.update(readFileSync('public'+tile.heightFile));
function height(x,z){
 const tile=manifest.tiles.find(t=>x>=t.boundsXZ[0]&&x<=t.boundsXZ[2]&&z>=t.boundsXZ[1]&&z<=t.boundsXZ[3]);
 if(!tile)return manifest.seaLevelMetres;
 let data=cache.get(tile.id);if(!data){data=readFileSync('public'+tile.heightFile);if(cache.size===4)cache.delete(cache.keys().next().value);cache.set(tile.id,data);}
 const n=manifest.resolution,u=(x-tile.boundsXZ[0])/manifest.tileSizeMeters*(n-1),v=(z-tile.boundsXZ[1])/manifest.tileSizeMeters*(n-1);
 const ix=Math.min(n-2,Math.floor(u)),iz=Math.min(n-2,Math.floor(v)),a=u-ix,b=v-iz;
 const at=(i,j)=>data.readUInt16LE((j*n+i)*2);
 const raw=(at(ix,iz)*(1-a)+at(ix+1,iz)*a)*(1-b)+(at(ix,iz+1)*(1-a)+at(ix+1,iz+1)*a)*b;
 return manifest.heightEncoding.minMetres+raw/65535*(manifest.heightEncoding.maxMetres-manifest.heightEncoding.minMetres);
}
function inside(p,x,z){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
 const a=p[j],b=p[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
const sea=manifest.seaLevelMetres;
const lakes=hydrology.lakes.filter(l=>l.id!=='tres-vertientes').map(l=>{
 const heights=l.polygonXZ_m.map(([x,z])=>height(x,z)).sort((a,b)=>a-b);
 return {...l,level:Math.max(sea,Math.round(heights[Math.floor(heights.length/2)]))};
});
const nodes=[],routes=[],segments=[];
for(const spline of splines){
 const route=[];
 for(let i=0;i<spline.controlPoints.length;i++){
  const p=spline.controlPoints[i],a=spline.controlPoints[Math.max(0,i-1)],b=spline.controlPoints[Math.min(spline.controlPoints.length-1,i+1)];
  const len=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
  const lake=lakes.find(l=>inside(l.polygonXZ_m,p.x,p.z));
  let level=Math.max(sea,lake?.level??p.y??sea);
  // Fit below both original banks. A depth request must excavate the bed,
  // never raise the water or manufacture an embankment to contain it.
  if(!lake)for(const side of [-1,1])for(const offset of [spline.width/2+14,spline.width/2+22])
   level=Math.min(level,Math.max(sea,height(p.x+nx*side*offset,p.z+nz*side*offset)-.8));
  route.push(nodes.length);nodes.push({...p,level,initial:level,route:spline.id,links:[]});
 }
 for(let i=1;i<route.length;i++){
  const ai=route[i-1],bi=route[i],a=nodes[ai],b=nodes[bi],length=Math.hypot(b.x-a.x,b.z-a.z);
  // Downstream never rises. Corrections spread upstream at 2 cm/m beyond
  // the original geographic gradient, preserving designed steep reaches.
  a.links.push([bi,0]);b.links.push([ai,Math.max(0,a.initial-b.initial)+length*.02]);
  segments.push({ai,bi,width:spline.width/2});
 }routes.push({id:spline.id,indices:route});
}
function distance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
// Join intersecting wet corridors. Endpoint envelopes create a shared datum
// over the junction, before their strips would overlap. No XZ axes are moved.
let joins=0;
for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
 const a=segments[i],b=segments[j],p=nodes[a.ai],q=nodes[a.bi],r=nodes[b.ai],s=nodes[b.bi];
 if(p.route===r.route)continue;
 const pad=a.width+b.width+28;
 if(Math.max(p.x,q.x)+pad<Math.min(r.x,s.x)||Math.min(p.x,q.x)-pad>Math.max(r.x,s.x)||Math.max(p.z,q.z)+pad<Math.min(r.z,s.z)||Math.min(p.z,q.z)-pad>Math.max(r.z,s.z))continue;
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const crossing=cross(p,q,r)*cross(p,q,s)<=0&&cross(r,s,p)*cross(r,s,q)<=0;
 if(!crossing&&Math.min(distance(p,r,s),distance(q,r,s),distance(r,p,q),distance(s,p,q))>pad)continue;
 for(const ai of [a.ai,a.bi])for(const bi of [b.ai,b.bi]){nodes[ai].links.push([bi,0]);nodes[bi].links.push([ai,0]);}joins++;
}
for(let pass=0;pass<nodes.length;pass++){
 let changed=false;for(const node of nodes)for(const [i,cost] of node.links)if(nodes[i].level>node.level+cost+1e-9){nodes[i].level=node.level+cost;changed=true;}
 if(!changed)break;if(pass===nodes.length-1)throw new Error('River level relaxation failed');
}
const levels=Object.fromEntries(routes.map(r=>[r.id,r.indices.map(i=>Number(nodes[i].level.toFixed(6)))]));
const text=`// Generated by scripts/bake-studio-river-levels.mjs; do not edit.\n// R16 bank clearance + monotone network junctions. Input SHA256: ${hash.digest('hex')}\nexport const STUDIO_RIVER_LEVELS:Readonly<Record<string,readonly number[]>>=${JSON.stringify(levels,null,2)};\n`;
const target='src/world/geography/StudioRiverLevels.ts';
if(process.argv.includes('--check')){if(readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==text)throw new Error('Stale river levels; run the bake');}else writeFileSync(target,text);
console.log(JSON.stringify({routes:routes.length,stations:nodes.length,joins,lowered:nodes.filter(n=>n.level<n.y-.001).length,retainedR16:cache.size,check:process.argv.includes('--check')}));
