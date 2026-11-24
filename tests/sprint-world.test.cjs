const fs=require('node:fs');
const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {GeographicPrefetch}=require('../.test-build/world/geography/GeographicPrefetch.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const read=name=>JSON.parse(fs.readFileSync('public/auralia-preview/data/'+name+'.json','utf8'));
(async()=>{
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology);
  const prefetch=new GeographicPrefetch(world,world.windowRadius);
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('probe',scene);
  const terrain=new TerrainStream(scene,root,{},world);
  let x=-1566,z=1711;await world.prepareAround(x,z);await terrain.prepareHorizon(x,z);terrain.update(x,z,27,0,3);
  let missing=0,coarse=0,sourceMisses=0,horizonGaps=0,total=0,max=0;
  const gaps=[],horizonExamples=[];
  for(let i=0;i<800;i++){
    const vx=i<400?27:0,vz=i<400?0:-27;
    prefetch.update(x,z,vx,vz);
    x+=vx/20;z+=vz/20;
    if(!world.isReady([x-12,z-12,x+12,z+12]))sourceMisses++;
    if(!terrain.canTraverse(x,z)){missing++;if(gaps.length<5)gaps.push({i,x,z});}
    if(terrain.coverageAt(x,z)!=='near')coarse++;
    const start=performance.now();terrain.update(x,z,vx,vz,3);const cost=performance.now()-start;
    total+=cost;max=Math.max(max,cost);
    for(const radius of [500,1100,1680])for(let heading=0;heading<32;heading++){
      const angle=heading*Math.PI/16;
      if(!terrain.coverageAt(x+Math.cos(angle)*radius,z+Math.sin(angle)*radius)){
        horizonGaps++;
        if(horizonExamples.length<4)horizonExamples.push({frame:i,x,z,radius,heading});
      }
    }
    await new Promise(setImmediate);
  }
  console.log(JSON.stringify({routeMetres:1080,simulatedFps:20,missing,coarse,sourceMisses,horizonGaps,horizonExamples,gaps,
    meanTerrainMs:total/800,maxTerrainMs:max,residentSectors:source.stats.residentTiles,pending:terrain.pendingCount}));
  prefetch.dispose();terrain.dispose();scene.dispose();engine.dispose();world.dispose();
  assert.equal(missing,0,'real Brisalia terrain stays traversable at sprint speed');
  assert.equal(sourceMisses,0,'the authoritative height data stay ahead of the player');
  assert.equal(horizonGaps,0,'sprint never exposes missing terrain anywhere in the visible horizon');
})().catch(e=>{console.error(e);process.exitCode=1;});
