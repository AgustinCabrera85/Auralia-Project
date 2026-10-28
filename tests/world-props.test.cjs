const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NullEngine,Scene,TransformNode,ImportMeshAsync}=require('@babylonjs/core');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {ASSET_CATALOG}=require('../.test-build/world/assetCatalog.js');
const {ROCK_PART_COUNT,ROCK_PART_FOOTPRINTS,rockScaleForDiameter,selectRockPart}=require('../.test-build/world/rockPackData.js');
const {RECT_ROCK_PARTS,RECT_ROCK_PART_COUNT,rectRockSizing}=require('../.test-build/world/rectRockData.js');
const {WorldPropSystem}=require('../.test-build/world/WorldPropSystem.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
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
assert.equal(RECT_ROCK_PART_COUNT,21);
assert.equal(rectRockSizing(0,.5,.5).heightMeters>=30,true);
assert.equal(rectRockSizing(20,0,0).diameterMeters,7.5);
const rocksFromSeveralChunks=[];
const rectangularRocks=[];
for(let cx=-9;cx<8;cx++)for(let cz=-9;cz<8;cz++)
  {const props=propsForChunk(cx,cz);rocksFromSeveralChunks.push(...props.filter(p=>p.kind==='packRocas'));
    rectangularRocks.push(...props.filter(p=>p.kind==='rocasRectangulares'));}
assert.ok(rocksFromSeveralChunks.length>0,'procedural rocks are generated');
assert.ok(rocksFromSeveralChunks.every(p=>Number.isInteger(p.partIndex)&&p.partIndex>=0&&p.partIndex<17&&p.rockDiameter>0));
assert.ok(new Set(rocksFromSeveralChunks.map(p=>p.partIndex)).size>4,'varied independent parts are selected');
assert.ok(rectangularRocks.length>0,'rectangular rocks appear in the mountains');
assert.ok(rectangularRocks.every(p=>p.pieceIndex>=0&&p.pieceIndex<21&&p.diameterMeters>=7.5&&p.worldHeight>2));
assert.ok(rectangularRocks.some(p=>p.worldHeight>=30),'monumental column appears');
for(let i=0;i<rectangularRocks.length;i++)for(let j=i+1;j<rectangularRocks.length;j++){
  const a=rectangularRocks[i],b=rectangularRocks[j];
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=a.worldRadius+b.worldRadius+3,
    'rectangular rocks stay apart across chunk boundaries');
}
for(const p of sample){
  assert.ok(Math.abs(p.y-sampleMainlandHeight(p.x,p.z))<(p.kind==='rocasRectangulares'?8:1e-7),'prop follows terrain');
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
  const rectSources=scene.meshes.filter(m=>m.name.startsWith('asset-rocasRectangulares-'));
  assert.equal(rectSources.length,21,'all 21 rectangular meshes retained');
  assert.ok(rectSources.every((m,i)=>Math.abs(m.getBoundingInfo().boundingBox.minimum.y)<.01&&
    Math.abs(Math.max(m.getBoundingInfo().boundingBox.maximum.x-m.getBoundingInfo().boundingBox.minimum.x,
      m.getBoundingInfo().boundingBox.maximum.z-m.getBoundingInfo().boundingBox.minimum.z)-RECT_ROCK_PARTS[i].footprint)<.001));
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
  const rectInChunks=[...system['chunks'].values()].flat().filter(p=>p.kind==='rocasRectangulares');
  assert.equal(rectSources.reduce((total,src)=>total+src.thinInstanceCount,0),rectInChunks.length,
    'one rectangular mesh instance per placement, never all 21');
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
  assert.equal(system.activeRockColliderCount,0,'distant colliders are unloaded');
  system.setActiveChunks(cells,-160,-210);
  for(let i=0;i<60;i++)system.update(1/60);
  assert.equal(system.visibleDecorationCount,count,'reload has the same deterministic decoration');
  assert.equal(system.nearestResource(-160,-210,2),null,'cooldown survives unload and reload');
  assert.equal(imports.length,11,'reload does not import GLBs again');
  const monument=rectangularRocks.find(p=>p.worldHeight>=30);
  const monumentCell=chunkOf(monument.x,monument.z);
  system.setActiveChunks([monumentCell],monument.x,monument.z);
  system.update(1/60);
  assert.ok(system.activeRockColliderCount>0,'nearby rocks have exact collider instances');
  let surface=null;
  for(let dx=-monument.worldRadius*.6;dx<=monument.worldRadius*.6&&!surface;dx+=1.5)
    for(let dz=-monument.worldRadius*.6;dz<=monument.worldRadius*.6&&!surface;dz+=1.5)
      surface=system.queryRockGround(monument.x+dx,monument.z+dz,
        monument.y+monument.worldHeight+2,monument.worldHeight+6,.33);
  assert.equal(surface?.rockId,monument.id,'real triangles provide a walkable surface');
  let wall=null;
  for(const fraction of [.2,.4,.6,.8]){
    const y=monument.y+monument.worldHeight*fraction;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      wall=system.queryRockWall(monument.x+dx*(monument.worldRadius+3),y,
        monument.z+dz*(monument.worldRadius+3),-dx,-dz,monument.worldRadius+6);
      if(wall?.rockId===monument.id)break;
    }
    if(wall?.rockId===monument.id)break;
  }
  assert.equal(wall?.rockId,monument.id,'the same triangles expose a lateral wall');
  assert.equal(wall?.climbable,true,'column carries its climb tag');
  system.setColliderFocus(monument.x,monument.z,monument.id);
  system.setActiveChunks([],1000,1000);
  assert.equal(system.activeChunkCount,1,'supporting rock survives streaming');
  system.setColliderFocus(1000,1000,null);
  assert.equal(system.activeChunkCount,0,'support is released after contact ends');
  assert.equal(system.activeRockColliderCount,0,'collider instances are released');
  // Actual formation beside X -507 / Z 52: an invalid foot sample lies over
  // visible stone. Stepping off may fall, then must land outside the shell.
  const formation=propsForChunk(-8,0).find(p=>p.kind==='formacionRocosa');
  system.setActiveChunks([chunkOf(formation.x,formation.z)],formation.x,formation.z);
  system.update(1/60);
  const startX=formation.x-3,startZ=formation.z-.8;
  const origin=formation.y+20;
  const startFloor=system.queryRockGround(startX,startZ,origin,20,.33);
  const nextX=startX-.22;
  const missedFloor=system.queryRockGround(nextX,startZ,origin,20,.33);
  const nextShell=system.queryRockSolidTop(nextX,startZ,origin,20,formation.id);
  assert.equal(startFloor?.rockId,formation.id,'the pictured formation has a walkable ledge');
  assert.equal(missedFloor,null,'adjacent jagged facet lacks a walkable foot sample');
  assert.equal(nextShell?.rockId,formation.id,'the same facet is still solid rock');
  const terrain=(x,z)=>sampleMainlandHeight(x,z);
  const traversalWorld={
    ground:(x,z,rayY,reach,footRadius)=>{
      const rock=system.queryRockGround(x,z,rayY,reach,footRadius);
      const landY=terrain(x,z);
      if(rock&&rock.height>=landY)return {height:rock.height,normalY:rock.normal.y,rockId:rock.rockId};
      return landY<=rayY&&landY>=rayY-reach?{height:landY,normalY:1}:null;
    },
    solidTop:(x,z,rayY,reach,rockId)=>{
      const rock=system.queryRockSolidTop(x,z,rayY,reach,rockId);
      return rock?{height:rock.height,normalX:rock.normal.x,normalZ:rock.normal.z,
        rockId:rock.rockId,centerX:rock.centerX,centerZ:rock.centerZ}:null;
    },
    wall:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:terrain
  };
  const climber=new CharacterTraversalController();
  climber.teleport(startX,startFloor.height,startZ);
  climber.supportRockId=formation.id;
  climber.step(.02,{moveX:-1,moveZ:0,forwardX:-1,forwardZ:0,
    horizontal:0,vertical:1,run:false,jumpPressed:false},traversalWorld);
  assert.equal(climber.mode,'airborne','a lower adjacent facet lets the character leave the ledge');
  assert.ok(climber.position.x<startX,'the character can move toward the nearby lower surface');
  for(let i=0;i<80&&climber.mode!=='grounded';i++)
    climber.step(.02,{moveX:0,moveZ:0,forwardX:-1,forwardZ:0,
      horizontal:0,vertical:0,run:false,jumpPressed:false},traversalWorld);
  assert.equal(climber.mode,'grounded','fall ends on nearby terrain');
  assert.ok(Math.abs(climber.position.y-terrain(climber.position.x,climber.position.z))<.05,
    'fall does not end inside the rock');
  climber.teleport(nextX,nextShell.height+.08,startZ);
  climber.mode='airborne';climber.velocityY=-2;
  climber.step(.02,{moveX:0,moveZ:0,forwardX:-1,forwardZ:0,
    horizontal:0,vertical:0,run:false,jumpPressed:false},traversalWorld);
  assert.ok(climber.position.y>=nextShell.height,'descent stops at the real outer shell');
  console.log(`✓ Assets: 11 GLB nuevos, ${count} props decorativos y cristales persistentes en ${system.activeChunkCount} chunks`);
  system.dispose();scene.dispose();engine.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
