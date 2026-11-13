import { readFile, writeFile } from 'node:fs/promises';
import { AuraliaHeightAtlas } from '../src/auralia-preview/atlas.mjs';
import { createRiverChannelField } from '../src/auralia-preview/riverChannel.mjs';
import { planTerrain, TERRAIN_BUFFER_BUDGET } from '../src/auralia-preview/terrainStream.mjs';
import { patchTopology, LEVELS } from '../src/auralia-preview/terrainGeometry.mjs';
const manifest=JSON.parse(await readFile('public/auralia-preview/data/manifest.json'));
const splines=JSON.parse(await readFile('public/auralia-preview/data/splines.json'));
const atlas=new AuraliaHeightAtlas(manifest);
for(const tile of manifest.tiles){const b=await readFile(`public${tile.heightFile}`);atlas.tiles.set(`${tile.cx},${tile.cz}`,{...tile,height:new Uint16Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))});}
const field=createRiverChannelField(atlas,splines),unit=2800/639;
const views=[['costa',1373,-438],['isla',1369,-303],['ladera',2500,-3500],['vegetacion',-1250,1920]];
const rows=[...field.rowsByRiver.values()].find(rows=>rows.length>100);
for(const [name,p]of[['nacimiento',rows[0]],['desembocadura',rows.at(-1)]])views.push([name,p.x+p.normalX*24,p.z+p.normalZ*24]);
const result={schema:'auralia-preview-geometry-audit-v1',method:'Topology counts and planner, NOT GPU/process memory or measured frame times',terrainBufferBudgetBytes:TERRAIN_BUFFER_BUDGET,
  mainTopology:{near:{spacing:6,vertices:169,triangles:288},mid:{spacing:18,vertices:145,triangles:192},far:{spacing:36,vertices:241,triangles:288}},
  sourceR16Spacing:unit,views:[]};
for(const [name,x,z] of views){
  const nodes=[...planTerrain(manifest,{x,z}).values()],parents=new Set(nodes.map(n=>n.parent));
  const lods={};
  for(const lod of ['far','mid','near']){
    const topology=patchTopology(lod),resident=nodes.filter(n=>n.lod===lod).length,enabled=nodes.filter(n=>n.lod===lod&&!parents.has(n.key)).length;
    lods[lod]={spacing:unit*LEVELS[lod].step,resident,enabled,visible:null,
      vertices:resident*topology.offsets.length,triangles:resident*topology.indices.length/3,
      enabledTriangles:enabled*topology.indices.length/3,visibleTriangles:null,
      gpuBufferBytes:resident*(topology.offsets.length*28+topology.indices.byteLength),samplerHeightBytes:resident*topology.offsets.length*4};
  }
  const nearTiles=manifest.tiles.map(t=>({tile:t,d:Math.hypot(t.centerXZ[0]-x,t.centerXZ[1]-z)})).filter(t=>t.d<2650).sort((a,b)=>a.d-b.d).slice(0,2).map(t=>t.tile.id);
  const errors=[];
  for(let gz=Math.ceil((z-310+7000)/unit);gz<=Math.floor((z+310+7000)/unit);gz++)for(let gx=Math.ceil((x-310+7000)/unit);gx<=Math.floor((x+310+7000)/unit);gx++){
    const px=-7000+gx*unit,pz=-7000+gz*unit,tile=atlas.tileAt(px,pz);if(!tile)continue;
    errors.push(Math.abs(field.renderedHeightAt(px,pz,nearTiles.includes(tile.id)?384:96)-field.heightAt(px,pz)));
  }
  errors.sort((a,b)=>a-b);
  result.views.push({name,x,z,lods,baseline:{nearTiles:nearTiles.length,residentVertices:25*9409+nearTiles.length*148225,residentTriangles:25*18432+nearTiles.length*294912,
    gpuBufferBytes:25*(9409*24+18432*12)+nearTiles.length*(148225*24+294912*12),
    errorAtR16Vertices:{samples:errors.length,medianM:errors[Math.floor(errors.length*.5)],p95M:errors[Math.floor(errors.length*.95)],maxM:errors.at(-1),rmsM:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length)}},
    newNearErrorAtR16VerticesM:0});
}
const riverErrors=[];
for(const [id,rows]of field.rowsByRiver){
  const depth=rows.map(p=>p.waterY-field.heightAt(p.x,p.z));
  riverErrors.push({id,samples:depth.length,submergedCenterSamples:depth.filter(d=>d>0).length,dryCenterSamples:depth.filter(d=>d<=0).length,minCenterDepthM:Math.min(...depth)});
}
result.riverProfileAudit=riverErrors;
await writeFile('artifacts/world-preview/geometry-audit.json',JSON.stringify(result,null,2)+'\n');
for(const v of result.views)console.log(v.name,JSON.stringify({lods:v.lods,baselineError:v.baseline.errorAtR16Vertices}));
console.log('Dry river center samples',riverErrors.reduce((sum,r)=>sum+r.dryCenterSamples,0),'/',riverErrors.reduce((sum,r)=>sum+r.samples,0));
