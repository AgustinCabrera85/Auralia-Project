const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {PlayableWorld,regionPoint}=require('../.test-build/world/geography/PlayableWorld.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const {waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const {configureBuildPlot}=require('../.test-build/domain/buildingRules.js');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {LocalStorageSaveRepository}=require('../.test-build/persistence/SaveRepository.js');
(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const old=sampleMainlandHeight(0,0),world=await PlayableWorld.create(source,splines,hydrology);setActiveGeography(world);
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('game-test',scene),terrain=new TerrainStream(scene,root,{},world);
 const checks=[];
 for(const destination of world.destinations.filter(d=>!d.floating)){
  await world.prepareAround(destination.x,destination.z);
  // Refined tiles can span several 4 ms updates; allow that cooperative work
  // to finish without requiring a whole dense tile in one frame. The Rev4
  // settlement and its wider river bypass also preserve canonical triangles.
  for(let i=0;i<8000&&(i===0||terrain.pendingCount);i++)terrain.update(destination.x,destination.z);
  assert.equal(terrain.pendingCount,0, destination.id+' cooperative terrain queue completes');assert.ok(world.stats.residentTiles<=9);
  for(const [dx,dz] of [[0,0],[8.17,3.24],[-9.4,12.82]]){
   const x=destination.x+dx,z=destination.z+dz,y=world.surface.heightAt(x,z);
   assert.equal(sampleMainlandHeight(x,z),world.heightAt(x,z));
   assert.equal(nearTerrainHeightAt(x,z,sampleMainlandHeight),y);
   const hit=scene.pickWithRay(new Ray(new Vector3(x,y+100,z),new Vector3(0,-1,0),200),m=>m.isEnabled()&&m.metadata?.terrainLod==='near');
   assert.ok(hit?.hit, destination.id+' has near mesh');assert.ok(Math.abs(hit.pickedPoint.y-y)<.002,destination.id+' ray agrees');
  }
  checks.push(destination.id);
 }
 const lake=regionPoint(world.lagoon,-160,-810);await world.prepareAround(lake.x,lake.z);
 assert.equal(waterSurfaceAt(lake.x,lake.z).level,1);assert.ok(world.heightAt(lake.x,lake.z)<-8);
 const before=world.heightAt(lake.x+60,lake.z+20);await world.prepareAround(5200,-3700);await world.prepareAround(lake.x,lake.z);
 assert.equal(world.heightAt(lake.x+60,lake.z+20),before,'reload is deterministic');
 await world.prepareAround(world.spawn.x,world.spawn.z);
 const data=new Map([['auralia:poc:save:v1','original-sentinel']]);
 global.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const key='auralia:worldstudio-playable-v1:save:v1',initial=()=>({...newGame(),playerPosition:{zone:'brisalia',...world.spawn}});
 const repo=new LocalStorageSaveRepository(key,initial),store=new GameStore(repo);
 const x=world.town.x-29,z=world.town.z+18;configureBuildPlot(x,z);
 store.setBuildEnvironment(()=>({heightAt:(x,z)=>world.surface.heightAt(x,z),obstacles:[]}));
 for(let i=0;i<6;i++)store.collect('wood',2);store.collect('stone',3);assert.equal(store.craft('hammer').ok,true);
 const floor=store.build('floor',x,z,0);assert.equal(floor.ok,true);assert.ok(Math.abs(floor.structure.baseY-world.surface.heightAt(x,z))<.6);
 assert.equal(store.build('wall',x,z,1).ok,true);assert.equal(store.build('wall',x,z,0).ok,true);
 assert.equal(store.milestone,'sail');store.travel('luciernagas');store.collect('spark',2);store.collect('wood',1);
 assert.equal(store.craft('lantern').ok,true);assert.equal(store.milestone,'complete');
 assert.equal(new GameStore(repo).state.structures.length,3);assert.equal(data.get('auralia:poc:save:v1'),'original-sentinel');
 store.reset();assert.deepEqual(store.state.playerPosition,initial().playerPosition);assert.equal(data.get('auralia:poc:save:v1'),'original-sentinel');
 configureBuildPlot();setActiveGeography(null);assert.equal(sampleMainlandHeight(0,0),old,'legacy restored unchanged');
 terrain.dispose();scene.dispose();engine.dispose();world.dispose();
 console.log(JSON.stringify({passed:true,nearMeshRayChecks:checks.length*3,destinations:checks,saveIsolation:true,questComplete:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
