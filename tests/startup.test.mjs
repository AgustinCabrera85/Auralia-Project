import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=resolve('.test-build/startup');mkdirSync(dir,{recursive:true});
const js=ts.transpileModule(readFileSync('src/world/geography/WorldStudioSource.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
writeFileSync(resolve(dir,'WorldStudioSource.mjs'),js);
const {WorldStudioSource}=await import(pathToFileURL(resolve(dir,'WorldStudioSource.mjs')));
const load=name=>JSON.parse(readFileSync(`public/auralia-preview/data/${name}.json`,'utf8'));
const manifest=load('manifest'),splines=load('splines'),hydrology=load('hidrologia_v3_6');
const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=readFileSync('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const reservations=[];
const add=(points,closed,width)=>reservations.push({points,closed,width});
for(const lake of hydrology.lakes)add(lake.polygonXZ_m.map(([x,z])=>({x,z})),true,40);
for(const s of splines){const closed=s.id.startsWith('reserva-');add(s.controlPoints,closed,closed?32:Math.max(0,s.width/2)+16);}
for(const p of manifest.bookmarks.filter(p=>/Brisalia|Ferragr/i.test(p.name)))add(Array.from({length:24},(_,i)=>({x:p.x+Math.cos(i*Math.PI/12)*140,z:p.z+Math.sin(i*Math.PI/12)*140})),true,24);
function reference(x,z,base){
 let mask=smooth(source.seaLevel+6,source.seaLevel+28,base);
 for(const r of reservations){
  let closest=Infinity,inside=false;
  for(let i=0,j=r.points.length-1;i<r.points.length;j=i++){
   const a=r.points[j],b=r.points[i];
   if(r.closed&&(a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
   if(i===0&&!r.closed)continue;
   const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
   closest=Math.min(closest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  mask=Math.min(mask,smooth(r.width,r.width+48,inside?0:closest));
 }
 return mask;
}
let checked=0;
for(const [x,z] of [[-1250,1943],[1450,-520],[-3500,-3500]]){
 await source.prepare([x-2600,z-2600,x+2600,z+2600]);
 for(let dz=-1100;dz<=1100;dz+=137)for(let dx=-1100;dx<=1100;dx+=131){
  const px=x+dx,pz=z+dz,base=source.baseHeightAt(px,pz);
  assert.ok(Math.abs(source.detailMaskAt(px,pz,base)-reference(px,pz,base))<1e-12,`Spatial query changed relief at ${px}, ${pz}`);checked++;
 }
}
// Include exact hash-cell edges and polygon vertices, where spatial pruning is fragile.
for(const [x,z] of [[0,0],[-256,256],[256,-256],[-1280,2048],...hydrology.lakes.flatMap(l=>l.polygonXZ_m.filter((_,i)=>i%70===0))]){
 assert.ok(Math.abs(source.detailMaskAt(x,z,100)-reference(x,z,100))<1e-12);checked++;
}
source.dispose();
console.log(`Startup geography: ${checked} indexed samples match the original full polygon scan, including borders and protected water.`);
