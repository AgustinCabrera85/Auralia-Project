const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {SOUTHERN_ISLANDS,southernSeaWeight}=require('../.test-build/world/geography/SouthernArchipelago.js');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');
(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const world=await PlayableWorld.create(source,splines,hydrology);setActiveGeography(world);
 await world.prepare([-2700,4000,2400,7000]);
 const level=world.seaLevel,report={islands:SOUTHERN_ISLANDS.length,beachSamples:0,shelfSamples:0,deepSamples:0,maxDepth:0,smallestGap:Infinity,landArea:0,lod:[]};
 // The old centres become real channels, not a second copy under the water.
 for(const [x,z] of [[-1524,4918],[-765,5206],[-84,4957],[557,5378],[964,4927]])
   assert.ok(level-world.surface.heightAt(x,z)>5,`old island removed at ${x},${z}`);
 for(const island of SOUTHERN_ISLANDS){
   assert.ok(world.surface.heightAt(island.x,island.z)>level+10,'new island is solid land');
   for(const other of SOUTHERN_ISLANDS)if(other!==island){
     const gap=Math.hypot(island.x-other.x,island.z-other.z)-Math.max(island.rx,island.rz)*1.18-Math.max(other.rx,other.rz)*1.18;
     report.smallestGap=Math.min(report.smallestGap,gap);
   }
 }
 assert.ok(report.smallestGap>300,'open water between every pair of island outlines');
 for(let z=4800;z<=6800;z+=18)for(let x=-2740;x<=2040;x+=18){
   const h=world.surface.heightAt(x,z),depth=level-h;
   report.maxDepth=Math.max(report.maxDepth,depth);
   if(depth<0)report.landArea+=18*18;
   if(depth>=3&&depth<=14)report.shelfSamples++;
   if(depth>100)report.deepSamples++;
   if(h>level+.2&&h<level+3){
     const weights=world.weightsAt(x,z,h,0);
     if(weights[3]>.85)report.beachSamples++;
   }
 }
 assert.ok(report.beachSamples>600,'substantial exposed sandy beaches');
 assert.ok(report.shelfSamples>1000,'continuous shallow habitat around the islands');
 assert.ok(report.deepSamples>8000,'broad deep channels');
 assert.ok(report.maxDepth>150&&report.maxDepth<=175.01,'bounded ocean floor');
 assert.ok(report.landArea>1600000,'expanded islands provide over 1.6 square kilometres of usable land');
 for(const [x,z] of [[786,4473],[0,4400],[-1800,4300],[3000,4500]]){
   assert.equal(southernSeaWeight(x,z),0,'mainland outside the island edit');
   assert.equal(world.heightAt(x,z),source.heightAt(x,z),'continental terrain unchanged');
 }
 const engine=new NullEngine(),scene=new Scene(engine),terrain=new TerrainStream(scene,new TransformNode('south-test',scene),{},world);
 for(const [x,z] of [[1600,5690],[1600,5430],[1600,5280],[500,5800]])for(const lod of ['near','mid','far']){
   const size=TERRAIN_LOD_CONFIG[lod+'Size'];
   const mesh=terrain.createTile(lod,{cx:Math.floor(x/size),cz:Math.floor(z/size)});mesh.isPickable=true;mesh.computeWorldMatrix(true);
   const hit=scene.pickWithRay(new Ray(new Vector3(x,100,z),new Vector3(0,-1,0),400),m=>m===mesh);
   assert.ok(hit?.hit,'rendered island/shelf/deep bed exists');
   const error=Math.abs(hit.pickedPoint.y-world.surface.heightAt(x,z));
   assert.ok(error<(lod==='near'?.003:3),`canonical collision/visual agreement ${lod}: ${error}`);
   report.lod.push({x,z,lod,error});mesh.dispose();
 }
 const h=world.surface.heightAt(500,5800);
 await terrain.prepareHorizon(786,4473);
 terrain.update(786,4473,0,1);
 for(let i=0;i<3000&&terrain.pendingCount;i++)terrain.update(786,4473,0,1);
 assert.equal(terrain.pendingCount,0);
 for(const island of SOUTHERN_ISLANDS)for(let a=0;a<Math.PI*2;a+=Math.PI/8){
   const x=island.x+Math.cos(a)*island.rx*.88,z=island.z+Math.sin(a)*island.rz*.88;
   assert.notEqual(terrain.coverageAt(x,z),null,'whole distant island remains covered beyond the standard radius');
 }
 assert.ok(terrain.landmarkFar.size<=100,'distant island coverage has a fixed small footprint');
 report.landmarkTiles=terrain.landmarkFar.size;
 await world.prepareAround(world.town.x,world.town.z);await world.prepare([-2700,4000,2400,7000]);
 assert.equal(world.surface.heightAt(500,5800),h,'streaming/reload preserves depth');
 assert.ok(world.stats.residentTiles<=9);
 console.log(JSON.stringify(report));terrain.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
})().catch(e=>{console.error(e);process.exitCode=1;});
