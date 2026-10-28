const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NullEngine,Scene,TransformNode,ImportMeshAsync}=require('@babylonjs/core');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {ASSET_CATALOG}=require('../.test-build/world/assetCatalog.js');
const {ROCK_PART_COUNT,ROCK_PART_FOOTPRINTS,rockScaleForDiameter,selectRockPart}=require('../.test-build/world/rockPackData.js');
const {WorldPropSystem}=require('../.test-build/world/WorldPropSystem.js');
const {propsForChunk,FIXED_CRYSTALS,PROP_CONFIG}=require('../.test-build/world/worldPropsData.js');
const {chunkOf,MAINLAND,sampleMainlandHeight,geographyMasks}=require('../.test-build/world/terrainData.js');

class MemoryRepository {
  current=newGame();
  load(){return structuredClone(this.current);}
  save(state){this.current=structuredClone(state);}
  clear(){this.current=newGame();}
}

for(const [id,asset] of Object.entries(ASSET_CATALOG)){
  assert.ok(fs.existsSync(path.join('public',asset.path.slice(1))),`${id} URL points to a copied or existing GLB`);
  assert.ok(asset.referenceScale>0);
}
const sample=propsForChunk(-3,-3);
assert.deepEqual(sample,propsForChunk(-3,-3),'same chunk and seed produce the same props');
assert.ok(sample.some(p=>p.id==='crystal:ruina-caminos'),'fixed crystal has a stable ID');
assert.equal(ROCK_PART_COUNT,17,'17 rocks described in one GLB');
assert.ok(ROCK_PART_FOOTPRINTS.every(d=>d>0));
assert.equal(selectRockPart(.1),2);
assert.ok(rockScaleForDiameter(3,2)>0);
const rocksFromSeveralChunks=[];
for(let cx=-9;cx<8;cx++)for(let cz=-9;cz<8;cz++)
  rocksFromSeveralChunks.push(...propsForChunk(cx,cz).filter(p=>p.kind==='packRocas'));
assert.ok(rocksFromSeveralChunks.length>0,'procedural rocks are generated');
assert.ok(rocksFromSeveralChunks.every(p=>Number.isInteger(p.partIndex)&&p.partIndex>=0&&p.partIndex<17&&p.rockDiameter>0));
assert.ok(new Set(rocksFromSeveralChunks.map(p=>p.partIndex)).size>4,'varied independent parts are selected');
for(const p of sample){
  assert.ok(Math.abs(p.y-sampleMainlandHeight(p.x,p.z))<1e-7,'prop follows terrain');
  if(p.id.startsWith('prop:'))assert.ok(geographyMasks(p.x,p.z).road<=PROP_CONFIG.roadMaskLimit,'generated props avoid paths');
}
for(const p of FIXED_CRYSTALS){
  const {cx,cz}=chunkOf(p.x,p.z);
  assert.ok(propsForChunk(cx,cz).some(q=>q.id===p.id),'fixed node belongs to exactly one stable chunk');
}

(async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('mainland',scene);
  const store=new GameStore(new MemoryRepository());
  const imports=[];
  const importer=async(url,target)=>{
    imports.push(url);
    return ImportMeshAsync(new Uint8Array(fs.readFileSync(path.join('public',url.slice(1)))),target,{pluginExtension:'.glb'});
  };
  const system=new WorldPropSystem(scene,root,store,()=>[],importer);
  const center=chunkOf(-160,-210),cells=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)cells.push({cx:center.cx+dx,cz:center.cz+dz});
  system.setActiveChunks(cells,-160,-210);
  await system.load();
  assert.equal(system.sharedAssetCount,11,'all eleven new non-vegetation GLBs loaded once');
  assert.equal(imports.length,11);
  assert.equal(new Set(imports).size,11);
  assert.ok(scene.meshes.filter(m=>m.metadata?.sharedWorldAsset).every(m=>m.material?.albedoTexture),'all imported prop meshes retain their GLB textures');
  assert.equal(scene.meshes.filter(m=>m.name.startsWith('asset-packRocas-')).length,17,'multi-mesh rock pack retained');
  const rockSources=scene.meshes.filter(m=>m.name.startsWith('asset-packRocas-'));
  assert.ok(rockSources.every(m=>m.material?.albedoTexture),'rock pack keeps textured PBR materials');
  for(const source of rockSources){
    const bb=source.getBoundingInfo().boundingBox;
    assert.ok(Math.abs((bb.minimum.x+bb.maximum.x)*.5)<.01,'individual rock centered X');
    assert.ok(Math.abs((bb.minimum.z+bb.maximum.z)*.5)<.01,'individual rock centered Z');
    assert.ok(Math.abs(bb.minimum.y)<.01,'individual rock grounded Y');
  }
  const node=new TransformNode('test-stone',scene);
  assert.equal(system.attachRockVisual(node,3,2.5,false),true,'rock can be attached to an existing resource');
  assert.equal(node.getChildMeshes().filter(m=>m.getTotalVertices()>0).length,1,'one resource uses one rock mesh');
  assert.equal(node.getChildMeshes()[0].material?.albedoTexture!=null,true,'resource retains texture');
  node.dispose(false,false);
  assert.ok(scene.getTransformNodeByName('crisol-brisalia'),'blacksmith crucible placed');
  const island=scene.getTransformNodeByName('isla-flotante-altaluz');
  assert.ok(island&&island.position.y>sampleMainlandHeight(580,-1130)+90,'floating island placed above Altaluz');
  assert.ok(island.getChildMeshes().some(m=>m.isVisible&&m.material?.albedoTexture),'floating island GLB is visible and textured');
  for(let i=0;i<60;i++)system.update(1/60);
  assert.ok(system.activeChunkCount>0&&system.activeChunkCount<=cells.length);
  assert.ok(system.visibleDecorationCount>0,'decorative thin instances populated');
  const placedRocks=[...system['chunks'].values()].flat().filter(p=>p.kind==='packRocas');
  const instances=rockSources.reduce((total,src)=>total+src.thinInstanceCount,0);
  assert.equal(instances,placedRocks.length,'one visual rock per placement, never 17');
  const liveNode=new TransformNode('test-stone-after-stream',scene);
  assert.equal(system.attachRockVisual(liveNode,3,2.5,false),true);
  const liveRock=liveNode.getChildMeshes().find(m=>m.getTotalVertices()>0);
  assert.equal(liveRock?.thinInstanceCount,0,'resource mesh does not inherit decoration instances');
  liveNode.dispose(false,false);
  assert.ok(system.activeCrystalCount>0,'individual collectible crystal spawned');
  const crystal=scene.getTransformNodeByName('crystal:ruina-caminos');
  assert.ok(crystal.getChildMeshes().some(m=>m.getTotalVertices()>0&&m.material?.albedoTexture&&m.isVisible),'collectible uses a visible textured GLB');
  assert.equal(system.blocksMovement(23,-8,29,-8),true,'simplified collider blocks the forge');
  assert.equal(system.blocksMovement(29,-8,23,-8),false,'saved player can leave an obstacle');
  assert.equal(system.nearestResource(-160,-210,2).id,'crystal:ruina-caminos');
  const collected=system.collect('crystal:ruina-caminos');
  assert.equal(collected.resource,'spark');
  assert.equal(store.state.inventory.spark,1);
  assert.ok(store.resourceReadyAt('crystal:ruina-caminos')>Date.now());
  assert.equal(system.nearestResource(-160,-210,2),null,'depleted node cannot be immediately recollected');
  const count=system.visibleDecorationCount;
  system.setActiveChunks([],1000,1000);
  assert.equal(system.activeChunkCount,0);
  assert.equal(system.activeCrystalCount,0);
  assert.equal(system.sharedAssetCount,11,'releasing chunks preserves shared GLBs');
  system.setActiveChunks(cells,-160,-210);
  for(let i=0;i<60;i++)system.update(1/60);
  assert.equal(system.visibleDecorationCount,count,'reload has the same deterministic decoration');
  assert.equal(system.nearestResource(-160,-210,2),null,'cooldown survives unload and reload');
  assert.equal(imports.length,11,'reload does not import GLBs again');
  console.log(`✓ Assets: 11 GLB nuevos, ${count} props decorativos y cristales persistentes en ${system.activeChunkCount} chunks`);
  system.dispose();scene.dispose();engine.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
