const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NullEngine,Scene,TransformNode,ImportMeshAsync}=require('@babylonjs/core');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {ASSET_CATALOG}=require('../.test-build/world/assetCatalog.js');
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
  assert.ok(scene.meshes.filter(m=>m.name.startsWith('asset-packRocas-')).every(m=>m.material?.albedoTexture),'rock pack keeps textured PBR materials');
  assert.ok(scene.getTransformNodeByName('crisol-brisalia'),'blacksmith crucible placed');
  const island=scene.getTransformNodeByName('isla-flotante-altaluz');
  assert.ok(island&&island.position.y>sampleMainlandHeight(580,-1130)+90,'floating island placed above Altaluz');
  assert.ok(island.getChildMeshes().some(m=>m.isVisible&&m.material?.albedoTexture),'floating island GLB is visible and textured');
  for(let i=0;i<60;i++)system.update(1/60);
  assert.ok(system.activeChunkCount>0&&system.activeChunkCount<=cells.length);
  assert.ok(system.visibleDecorationCount>0,'decorative thin instances populated');
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
