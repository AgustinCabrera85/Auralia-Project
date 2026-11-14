const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,ImportMeshAsync}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {VegetationSystem,brisaliaPlantLod}=require('../.test-build/world/VegetationSystem.js');
const {vegetationForChunk}=require('../.test-build/world/vegetationData.js');
const {desiredChunks,chunkOf}=require('../.test-build/world/terrainData.js');
const {WORLD_FOREST,worldForestCover,worldForestCandidates,forestFrontRows}=require('../.test-build/world/geography/WorldForest.js');
const {treeSpriteView}=require('../.test-build/world/TreeSprite.js');
(async()=>{
 const rows=[200,205,220,240].map(z=>({p:{x:0,z,obstacleRadius:1},distance:z}));
 assert.deepEqual([...forestFrontRows(rows,{x:0,z:0},{x:0,z:1})].map(p=>p.z),[200,220],'first two separated rows retain full geometry');
 assert.equal(forestFrontRows(rows,{x:0,z:0},{x:0,z:-1}).size,0,'front budget follows view');
 for(let i=0;i<8;i++)assert.equal(treeSpriteView(0,Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)),i);
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}),world=await PlayableWorld.create(source,s,h);
 setActiveGeography(world);await world.prepareAround(1524,-434);
 const cells=desiredChunks(1524,-434,14),report={cells:cells.length,beforeTrees:0,afterTrees:0,bySector:[],minSpacing:Infinity};
 for(const c of cells){
  world.id='worldstudio-old-forest';const before=vegetationForChunk(c.cx,c.cz).filter(p=>p.obstacleRadius);world.id='worldstudio-playable-v1';
  const after=vegetationForChunk(c.cx,c.cz).filter(p=>p.obstacleRadius);
  report.beforeTrees+=before.length;report.afterTrees+=after.length;
  report.bySector.push({cx:c.cx,cz:c.cz,cover:worldForestCover((c.cx+.5)*72,(c.cz+.5)*72),before:before.length,after:after.length});
  for(const p of after){assert.equal(world.waterAt(p.x,p.z),null,'no trees on the lake or river surface');assert.ok(p.y<=world.surface.heightAt(p.x,p.z)+.001,'root sits on canonical terrain');}
 }
 console.log('Same-area tree density',report.beforeTrees,report.afterTrees);
 assert.ok(report.afterTrees>report.beforeTrees*1.5,'groves significantly denser at the same radius');
 assert.ok(report.bySector.some(r=>r.after>=5)&&report.bySector.some(r=>r.after===0),'groves retain clearings');
 const candidates=[];for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++)candidates.push(...worldForestCandidates(x,z));
 for(let i=0;i<candidates.length;i++)for(let j=0;j<i;j++)report.minSpacing=Math.min(report.minSpacing,Math.hypot(candidates[i].x-candidates[j].x,candidates[i].z-candidates[j].z));
 assert.ok(report.minSpacing>=9,'tree slots keep spacing across chunk boundaries');
 const specimenCell=report.bySector.find(r=>r.after>=5),placements=vegetationForChunk(specimenCell.cx,specimenCell.cz),p=placements.find(p=>p.obstacleRadius);
 assert.deepEqual(placements,vegetationForChunk(specimenCell.cx,specimenCell.cz),'deterministic placement');
 assert.ok(!vegetationForChunk(specimenCell.cx,specimenCell.cz,[{x:p.x,z:p.z,radius:12}]).some(t=>Math.hypot(t.x-p.x,t.z-p.z)<12),'building exclusions remain clear');
 await world.prepareAround(world.town.x,world.town.z);
 for(const c of desiredChunks(world.town.x,world.town.z,2))for(const t of vegetationForChunk(c.cx,c.cz))assert.ok(Math.abs(t.x-world.town.x)>=125||t.z-world.town.z<=-125||t.z-world.town.z>=170,'starter plot remains clear');
 const brisaliaKinds=new Set(['brisaliaMargaritas','brisaliaMatorral','brisaliaYuyos']);
 const townPlants=desiredChunks(world.town.x,world.town.z,5).flatMap(c=>vegetationForChunk(c.cx,c.cz)).filter(p=>brisaliaKinds.has(p.kind));
 assert.ok(townPlants.length>20,'new vegetation grows around Brisalia');
 assert.equal(new Set(townPlants.map(p=>p.kind)).size,3,'all three plant families are used');
 assert.deepEqual(townPlants,desiredChunks(world.town.x,world.town.z,5).flatMap(c=>vegetationForChunk(c.cx,c.cz)).filter(p=>brisaliaKinds.has(p.kind)),'town plants are deterministic');
 const blockedPlant=townPlants[0],blockedCell=chunkOf(blockedPlant.x,blockedPlant.z);
 assert.ok(!vegetationForChunk(blockedCell.cx,blockedCell.cz,[{x:blockedPlant.x,z:blockedPlant.z,radius:8}]).some(p=>brisaliaKinds.has(p.kind)&&Math.hypot(p.x-blockedPlant.x,p.z-blockedPlant.z)<8),'new plants respect building exclusions');
 for(const p of townPlants){
  assert.ok(Math.hypot(p.x-world.town.x,p.z-world.town.z)<=300);
  assert.equal(world.waterAt(p.x,p.z),null,'plants stay off water');
  assert.ok(p.y<=world.surface.heightAt(p.x,p.z)+.001,'plants rest on terrain');
 }
 assert.equal(brisaliaPlantLod('brisaliaYuyos',13,0),1);
 assert.equal(brisaliaPlantLod('brisaliaYuyos',11,1),1,'LOD hysteresis holds during small movements');
 assert.equal(brisaliaPlantLod('brisaliaYuyos',37,1),2);
 assert.equal(brisaliaPlantLod('brisaliaYuyos',33,2),2);
 assert.equal(brisaliaPlantLod('brisaliaYuyos',9,2),0);
 await world.prepareAround(1524,-434);
 assert.ok(!vegetationForChunk(21,-6).some(p=>brisaliaKinds.has(p.kind)),'town plants do not spread to other regions');
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('forest',scene);
 const system=new VegetationSystem(scene,root,()=>[],async(url,scene)=>ImportMeshAsync(new Uint8Array(await fs.readFile('public'+url)),scene,{pluginExtension:'.glb'}));
 system.setViewDirection(Math.sin(144*Math.PI/180),-Math.cos(144*Math.PI/180));system.setActiveChunks([],1524,-434);await system.load();
 for(let i=0;i<2000&&system.pending.length;i++)system.update();assert.equal(system.pending.length,0);
 report.render=system.stats;assert.ok(report.render.fullTrees<=WORLD_FOREST.maxFullTrees+WORLD_FOREST.maxFrontTrees);assert.ok(report.render.mediumTrees<=WORLD_FOREST.maxMediumTrees);
 assert.ok(report.render.frontTrees>0&&report.render.frontTrees<=WORLD_FOREST.maxFrontTrees,'visible forest edge gets detailed trees');
 assert.ok(system.canopyInstanceCount>100,'distant groves use cheap silhouettes');
 assert.ok(system.activeChunkCount<=desiredChunks(1524,-434,WORLD_FOREST.radiusChunks).length);
 for(const proxy of system.canopySources.values()){
  assert.equal(proxy.getTotalIndices()/3,2,'far trees are a single sprite quad');assert.equal(proxy.subMeshes.length,1,'one material batch per species');assert.equal(proxy.isPickable,false);
 }
 const seen=new Set();
 for(const map of [system.sources,system.farSources,system.canopySources])for(const [kind,mesh] of map){
  if(kind==='plantitas1'||kind==='tronco1')continue;
  for(let i=0;i<mesh.thinInstanceCount;i++){const a=mesh._thinInstanceDataStorage.matrixData,key=`${kind}:${a[i*16+12]}:${a[i*16+14]}`;assert.ok(!seen.has(key),'one LOD per tree');seen.add(key);}
 }
 const collisionTree=[...system.chunks.values()].flat().find(t=>t.obstacleRadius);
 system.setColliderFocus(collisionTree.x,collisionTree.z);assert.ok(system.treeColliders.colliders.size>0&&system.treeColliders.colliders.size<80,'collisions remain local');
 const beforeCount=system.instanceCount;
 await world.prepareAround(world.town.x,world.town.z);
 const plantFocus=townPlants[0];system.setActiveChunks([],plantFocus.x,plantFocus.z);
 for(let i=0;i<120&&system.pending.length;i++)system.update();
 const plantMeshes=[...brisaliaKinds].flatMap(kind=>['','-far','-low'].map(suffix=>scene.getMeshByName(`vegetacion-${kind}${suffix}`)));
 assert.ok(plantMeshes.every(Boolean),'every Brisalia plant LOD has a shared render batch');
 for(let level=0;level<3;level++)assert.ok(plantMeshes.filter((_,i)=>i%3===level).some(mesh=>mesh.thinInstanceCount>0),`plant LOD${level} is populated near Brisalia`);
 const plantPositions=new Set();
 for(const mesh of plantMeshes){
  const data=mesh._thinInstanceDataStorage.matrixData;
  for(let i=0;i<mesh.thinInstanceCount;i++){
   const key=`${mesh.metadata.kind}:${data[i*16+12]}:${data[i*16+14]}`;
   assert.ok(!plantPositions.has(key),'one plant LOD per instance');plantPositions.add(key);
  }
 }
 await world.prepareAround(-4000,4000);system.setActiveChunks([],-4000,4000);assert.equal(system.activeChunkCount,0,'distant sectors released');assert.equal(system.instanceCount,0);
 await world.prepareAround(1524,-434);system.setActiveChunks([],1524,-434);
 for(let i=0;i<2000&&system.pending.length;i++)system.update();assert.equal(system.instanceCount,beforeCount,'reloading restores identical forest');
 assert.ok(world.stats.residentTiles<=9);
 await fs.mkdir('artifacts/geographic-source/forest',{recursive:true});await fs.writeFile('artifacts/geographic-source/forest/geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,bySector:undefined}));system.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
})().catch(e=>{console.error(e);process.exitCode=1});
