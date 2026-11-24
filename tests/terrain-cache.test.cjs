const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {TerrainHeightCache}=require('../.test-build/world/TerrainHeightCache.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');

let evaluations=0,offset=0;
const cache=new TerrainHeightCache(1.5,(x,z)=>{evaluations++;return x*.123456789+z+offset;});
const original=cache.at(-72,1.5);
assert.equal(cache.at(-72,1.5),original);assert.equal(evaluations,1);
assert.equal(cache.at(.2,.3),.2*.123456789+.3,'off-grid coordinates are not rounded');
offset=10;cache.clear();assert.equal(cache.at(-72,1.5),original+10);
for(let i=0;i<600000;i++)cache.at(i*1.5,-i*1.5);
assert.equal(cache.bytes,10*1024*1024,'cache allocation stays fixed after capacity is exceeded');
assert.equal(cache.at(-72,1.5),original+10,'replacement never returns another coordinate height');

const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('cache-test',scene);
let height=5;
const source={id:'cache-fixture',streamed:true,bounds:[-7000,-7000,7000,7000],seaLevel:0,meshSpacing:3,
  heightAt:()=>height,weightsAt:()=>[1,0,0,0,0,0],preserveDetail:()=>false,isReady:()=>true,prepare:async()=>{}};
const stream=new TerrainStream(scene,root,{},source);
const drain=(x,z)=>{let i=0;do{stream.update(x,z,0,0,Infinity);assert.ok(++i<2000);}while(stream.pendingCount);};
try{
  drain(10,10);
  const first=scene.getMeshByName('terreno-near-0-0');assert.ok(first?.isEnabled());
  drain(586,10);assert.ok(!first.isEnabled()&&!first.isDisposed(),'recent tiles are disabled and retained');
  drain(10,10);assert.equal(scene.getMeshByName('terreno-near-0-0'),first,'return reuses the actual GPU mesh');
  assert.ok(stream.cacheStatistics.tileReuses>0);
  const meshes=[...scene.meshes];
  for(let i=0;i<24;i++)stream.update(10,10,Math.cos(i)*27,Math.sin(i)*27,4);
  assert.deepEqual(scene.meshes,meshes,'turning in place never rebuilds the terrain');
  drain(586,10);height=12;
  stream.invalidateRegion(10,10,12);
  assert.ok(first.isDisposed(),'edits invalidate overlapping retained geometry');
  drain(10,10);
  const edited=scene.getMeshByName('terreno-near-0-0');assert.notEqual(edited,first);
  assert.equal(edited.getVerticesData('position')[1],12,'cached heights cannot undo terrain edits');
  stream.retiredBudget=512*1024;
  for(const x of [586,1162,1738])drain(x,10);
  assert.ok(stream.cacheStatistics.retainedBytes<=512*1024,'least recently used tiles obey the byte budget');
  stream.reloadEdits();assert.equal(stream.cacheStatistics.retainedTiles,0,'world reload clears inactive geometry');
  console.log('Terrain cache: exact heights, fixed memory, mesh reuse, heading stability, edit invalidation and LRU eviction passed.');
}finally{
  stream.dispose();assert.equal(stream.cacheStatistics.retainedBytes,0);
  scene.dispose();engine.dispose();
}

(async()=>{
  const source=new WorldStudioSource({schema:'auralia-worldstudio-trial-v1',resolution:640,
    tileSizeMeters:2800,seaLevelMetres:0,coordinateSystem:{boundsXZ:[0,0,5600,2800]},
    heightEncoding:{minMetres:0,maxMetres:65535,byteOrder:'little-endian'},bookmarks:[],
    tiles:[{id:'left',heightFile:'left',boundsXZ:[0,0,2800,2800]},
      {id:'right',heightFile:'right',boundsXZ:[2800,0,5600,2800]}]},[],{lakes:[]},
    async name=>new Uint16Array(640*640).fill(name==='left'?1000:2000).buffer,false);
  await source.prepare([0,0,5600,2800]);
  assert.equal(source.baseHeightAt(2801,100),2000);
  assert.equal(source.baseHeightAt(2800,100),1000,'cached right sector cannot steal the shared boundary');
  assert.equal(source.baseHeightAt(2799,100),1000);
  assert.equal(source.baseHeightAt(2801,100),2000);
  await source.prepare([0,0,2799,2800]);
  assert.throws(()=>source.baseHeightAt(2801,100),/not loaded/,'a cached lookup cannot bypass eviction');
  source.dispose();
  console.log('R16 sector cache: shared boundary ownership and unloaded data guard passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
