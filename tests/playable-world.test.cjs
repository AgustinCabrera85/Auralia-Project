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
  if(destination.id==='ladera-del-crisol'){
   // The small vestibule shares its floor with the rendered terrain triangles.
   const {VOLCANIC_CAVE}=require('../.test-build/world/volcanicCaveData.js'),e=VOLCANIC_CAVE.entrance;
   const {caveEntrancePoint}=require('../.test-build/world/cavePortalGeometry.js');
   for(const [dx,dz] of [[-25,0],[25,0],[0,-24],[0,36]]){
    const p=caveEntrancePoint(dx,dz);
    assert.equal(world.heightAt(p.x,p.z),source.heightAt(p.x,p.z),'relief stays local to the entrance');
   }
   const {VolcanicCaveSystem}=require('../.test-build/world/VolcanicCaveSystem.js');
   const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
   const {geographicTraversal}=require('../.test-build/world/geography/GeographicTraversal.js');
   const cave=new VolcanicCaveSystem(scene,(x,z)=>world.surface.heightAt(x,z),true,false);
   cave.syncExterior(e.x,e.z);
   const walker=new CharacterTraversalController(),start=caveEntrancePoint(0,29);
   walker.teleport(start.x,world.surface.heightAt(start.x,start.z),start.z);
   const walkingWorld=geographicTraversal(world.surface,()=>true);
   walkingWorld.canMove=(x,z,fx,fz,y)=>cave.canMoveOutside(x,z,fx,fz,y);
   walkingWorld.headroom=(x,y,z,h)=>cave.exteriorHeadroom(x,y,z,h);
   for(const localZ of [-3,29]){
    const target=caveEntrancePoint(0,localZ);let reached=false;
    for(let frame=0;frame<1200;frame++){
     const p=walker.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
     if(d<.3){reached=true;break;}
     walker.step(1/60,{moveX:dx/d,moveZ:dz/d,forwardX:dx/d,forwardZ:dz/d,horizontal:0,vertical:1,run:false,sprint:false,jumpPressed:false},walkingWorld);
     assert.equal(walker.mode,'grounded','the whole entrance is walkable without jumping or climbing');
     assert(!cave.inside,'walking into the vestibule never forces entry');
    }
    assert(reached,'walk into the recess and back outside');
    assert.equal(cave.nearestAction(new Vector3(walker.position.x,walker.position.y,walker.position.z)),localZ<0?'enter':null);
   }
   cave.dispose();
   for(const [dx,dz] of [[0,0],[-4,-4],[4,-8],[0,-16]]){
    const x=e.x+dx,z=e.z+dz,y=world.surface.heightAt(x,z);
    const hit=scene.pickWithRay(new Ray(new Vector3(x,y+100,z),new Vector3(0,-1,0),200),m=>m.isEnabled()&&m.metadata?.terrainLod==='near');
    assert(hit?.hit&&Math.abs(hit.pickedPoint.y-y)<.002,'entrance collision matches the visible floor');
   }
  }
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
