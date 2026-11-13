import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import { LEVELS, patchTopology, topologyHeight } from '../src/auralia-preview/terrainGeometry.mjs';
import { planTerrain, PreviewTerrainStream } from '../src/auralia-preview/terrainStream.mjs';
import { clipWaterTriangle, triangulateBoundary } from '../src/auralia-preview/waterGeometry.mjs';

for(const lod of ['far','mid','near']){
  const topology=patchTopology(lod),{offsets,indices}=topology,span=LEVELS[lod].span;
  let area=0;
  for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=[indices[i],indices[i+1],indices[i+2]].map(j=>offsets[j]);
    const twice=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    assert.ok(twice>0,`${lod}: inverted/degenerate triangle`);area+=twice/2;
  }
  assert.equal(area,span*span);
  for(const edge of [0,1])for(const end of [0,span]){
    const points=offsets.filter(p=>p[edge]===end).map(p=>p[1-edge]).sort((a,b)=>a-b);
    assert.deepEqual(points,Array.from({length:span+1},(_,i)=>i),'every edge retains every source sample');
  }
  const heights=offsets.map(([x,z])=>x*.7+z*.2);
  for(let x=0;x<=span;x+=3.17)for(let z=0;z<=span;z+=4.73)
    assert.ok(Math.abs(topologyHeight(topology,heights,x,z)-x*.7-z*.2)<1e-6);
}
const manifest=JSON.parse(await readFile(new URL('../public/auralia-preview/data/manifest.json',import.meta.url)));
let maxNear=0,maxMid=0;
for(let x=-1400;x<=1400;x+=100)for(let z=-1400;z<=1400;z+=100){
  const nodes=[...planTerrain(manifest,{x,z}).values()];
  maxNear=Math.max(maxNear,nodes.filter(n=>n.lod==='near').length);
  maxMid=Math.max(maxMid,nodes.filter(n=>n.lod==='mid').length);
}
assert.ok(maxNear<=36);assert.ok(maxMid<=36);
// Exercise real Babylon ownership, atomic coverage, source heights and disposal,
// without needing a WebGL browser or making assertions about its performance.
const engine=new NullEngine(),scene=new Scene(engine),material=new StandardMaterial('test',scene);
const atlas={manifest,size:2800,resolution:640};
const field={heightAt:(x,z)=>Math.sin(x/80)*20+Math.cos(z/55)*12};
const stream=new PreviewTerrainStream(scene,atlas,field,material);
await stream.initialize();
const verifyCoverage=()=>{
  let area=0;
  for(const r of stream.records.values())if(r.mesh.isEnabled())area+=(LEVELS[r.node.lod].span*stream.unit)**2;
  assert.ok(Math.abs(area-14000**2)<1,'no holes or double coverage while refining/coarsening');
};
for(const focus of [{x:1373,z:-438},{x:-4800,z:4700},{x:0,z:0}]){
  stream.update(focus,true);
  for(let i=0;i<360;i++){stream.tick(1/30,100);verifyCoverage();}
  for(const r of stream.records.values())if(r.node.lod==='near'){
    for(let i=0;i<r.heights.length;i+=71){
      const [x,z]=r.topology.offsets[i];
      assert.ok(Math.abs(r.heights[i]-field.heightAt(r.node.x+x*stream.unit,r.node.z+z*stream.unit))<1e-4);
    }
  }
  assert.ok(stream.records.size<=25+36+36,'old patches released after travel');
}
stream.update({x:0,z:0},false);
for(let i=0;i<60;i++){stream.tick(1/30,100);verifyCoverage();}
assert.equal(stream.records.size,25);assert.equal(stream.splits.size,0);
stream.dispose();material.dispose();scene.dispose();engine.dispose();
const clipped=clipWaterTriangle([{x:0,z:0,depth:-1,coverage:1},{x:10,z:0,depth:1,coverage:1},{x:0,z:10,depth:1,coverage:1}]);
assert.equal(clipped.length,4);assert.ok(clipped.every(p=>p.depth>=0));
assert.ok(clipped.some(p=>p.x===5&&p.z===0));assert.ok(clipped.some(p=>p.x===0&&p.z===5));
const hydrology=JSON.parse(await readFile(new URL('../public/auralia-preview/data/hidrologia_v3_6.json',import.meta.url)));
for(const lake of hydrology.lakes){
  const {points,indices}=triangulateBoundary(lake.polygonXZ_m);
  assert.equal(indices.length,(points.length-2)*3);
  assert.ok(points.every(p=>lake.polygonXZ_m.some(q=>p[0]===q[0]&&p[1]===q[1])));
}
console.log(`Preview streaming: topology, source edges, transitions, disposal and lake clipping OK; maximum near ${maxNear}, mid ${maxMid} patches`);
