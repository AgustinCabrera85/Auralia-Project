const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NullEngine,Scene,TransformNode,ImportMeshAsync,MultiMaterial,VertexBuffer}=require('@babylonjs/core');
const {VegetationSystem}=require('../.test-build/world/VegetationSystem.js');
const {vegetationForChunk,VEGETATION_CONFIG}=require('../.test-build/world/vegetationData.js');
const {chunkOf,desiredChunks,MAINLAND,sampleMainlandHeight,geographyMasks,isStarterArea}=require('../.test-build/world/terrainData.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {BRISALIA_PLANT_ASSETS,DECORATIVE_TREE_ASSETS,HARVESTABLE_TREE_ASSETS}=
  require('../.test-build/world/assetCatalog.js');

// Exercise the real resource/marker methods without starting the browser game.
const vm=require('node:vm'),ts=require('typescript');
const villageLayout=require('../.test-build/world/brisaliaLayout.js');
const viewExports={};
// Mirror Vite's production define in this CommonJS-only harness; debug UI stays off.
const viewSource=fs.readFileSync('src/game/WorldView.ts','utf8')
  .replace(/import\.meta\.env\.DEV/g,'false');
vm.runInNewContext(ts.transpileModule(viewSource,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{exports:viewExports,require:id=>id==='@babylonjs/core'
  ?require('@babylonjs/core'):id==='../world/brisaliaLayout'?villageLayout:{}});
let treeRequest,markerCount=0;
const zone={id:'brisalia',nodes:[]};
const fakeView={vegetationExclusions:[],
  tree(...args){treeRequest=args;return {};},
  markInteraction(...args){viewExports.WorldView.prototype.markInteraction.apply(this,args);},
  ball(){markerCount++;return {};},mat(){return {};}};
viewExports.WorldView.prototype.resource.call(fakeView,zone,'wood-test','Madera','wood',3,10,20);
assert.equal(treeRequest[5],true,'wood requests an original harvestable GLB');
assert.ok(!villageLayout.inBrisaliaFootprint(treeRequest[1],treeRequest[2],5)&&
  villageLayout.BRISALIA_ROADS.every(road=>villageLayout.distanceToRoad(treeRequest[1],treeRequest[2],road)>=road.width/2+5),
  'harvestable trees stay clear of Brisalia buildings and approaches');
assert.equal(zone.nodes[0].verb,'Talar árbol');
assert.equal(markerCount,0,'wood nodes have no floating marker');
fakeView.markInteraction(zone,{...zone.nodes[0],resource:'spark'});
assert.equal(markerCount,1,'other interaction markers remain available');

const sample=vegetationForChunk(-5,-8);
assert.deepEqual(sample,vegetationForChunk(-5,-8),'same seed and chunk give identical placements');
assert.ok(sample.length>0,'sample chunk has vegetation');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
assert.ok(sample.every(p=>{
  const visible=nearTerrainHeightAt(p.x,p.z,sampleMainlandHeight);
  return p.y<=visible&&visible-p.y<1.05;
}),'vegetation bases embed slightly into the rendered triangles instead of floating above them');
assert.ok(sample.every(p=>p.y>MAINLAND.waterLevel&&geographyMasks(p.x,p.z).road<=VEGETATION_CONFIG.roadMaskLimit));
assert.ok(sample.every(p=>!isStarterArea(p.x,p.z)));
assert.ok(sample.every(p=>p.yaw>=0&&p.yaw<Math.PI*2));
assert.ok(sample.every(p=>Math.abs(p.scale/VEGETATION_CONFIG.baseScale[p.kind]-1)<=
  VEGETATION_CONFIG.scaleVariation+.00001),'each species retains its authored scale range');
const blocked=sample[0];
assert.ok(!vegetationForChunk(-5,-8,[{x:blocked.x,z:blocked.z,radius:8}]).some(p=>Math.hypot(p.x-blocked.x,p.z-blocked.z)<8));
const treeSample=[...sample,...vegetationForChunk(-8,-2),...vegetationForChunk(-7,-1)]
  .find(p=>p.obstacleRadius>0);
assert.ok(treeSample);
const treeCell=chunkOf(treeSample.x,treeSample.z);
const nearHouse=vegetationForChunk(treeCell.cx,treeCell.cz,
  [{x:treeSample.x,z:treeSample.z,radius:5}]);
assert.ok(nearHouse.every(p=>Math.hypot(p.x-treeSample.x,p.z-treeSample.z)>=5+VEGETATION_CONFIG.crownRadius[p.kind]*p.scale),'scaled crowns clear buildings');
for(const [x,z,radius] of [[-8,-32,9],[9,-33,8],[24,-22,8],[-25,-27,8],[9,-12,8],[-29,18,24]]){
  const {cx,cz}=chunkOf(x,z);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    assert.ok(vegetationForChunk(cx+dx,cz+dz).every(p=>Math.hypot(p.x-x,p.z-z)>radius),'Brisalia house/plot stays clear');
  }
}

(async()=>{
  const engine=new NullEngine();
  const scene=new Scene(engine);
  const root=new TransformNode('mainland',scene);
  const imports=[];
  const importer=async(url,target)=>{
    const name=path.basename(url);
    imports.push(name);
    const bytes=fs.readFileSync(path.join('public',url.replace(/^\//,'')));
    return ImportMeshAsync(new Uint8Array(bytes),target,{pluginExtension:'.glb'});
  };
  const system=new VegetationSystem(scene,root,()=>[],importer);
  const center={cx:-8,cz:-8};
  const cells=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)cells.push({cx:center.cx+dx,cz:center.cz+dz});
  system.setActiveChunks(cells,center.cx*MAINLAND.chunkSize,center.cz*MAINLAND.chunkSize);
  await system.load();
  assert.equal(system.sharedMeshCount,9,'decorative trees and Brisalia plants share source meshes');
  assert.equal(imports.length,22,'all three plant LODs load once alongside existing vegetation');
  assert.equal(new Set(imports).size,22);
  for(const kind of BRISALIA_PLANT_ASSETS){
    const levels=['', '-far', '-low'].map(suffix=>scene.getMeshByName(`vegetacion-${kind}${suffix}`));
    assert.ok(levels.every(Boolean),`${kind} has all three LODs`);
    const triangles=levels.map(mesh=>mesh.getTotalIndices()/3);
    assert.ok(triangles[0]>triangles[1]&&triangles[1]>triangles[2],`${kind} uses progressively lighter geometry`);
    const boxes=levels.map(mesh=>{
      const positions=mesh.getVerticesData(VertexBuffer.PositionKind),minimum={},maximum={};
      for(const axis of ['x','y','z']){minimum[axis]=Infinity;maximum[axis]=-Infinity;}
      for(let i=0;i<positions.length;i++){
        const axis=['x','y','z'][i%3];minimum[axis]=Math.min(minimum[axis],positions[i]);
        maximum[axis]=Math.max(maximum[axis],positions[i]);
      }
      return {minimum,maximum};
    });
    for(let i=1;i<3;i++)for(const axis of ['x','y','z']){
      assert.ok(Math.abs(boxes[0].minimum[axis]-boxes[i].minimum[axis])<.035,`${kind} LOD base matches: ${axis} ${boxes[0].minimum[axis]} ${boxes[i].minimum[axis]}`);
      assert.ok(Math.abs(boxes[0].maximum[axis]-boxes[i].maximum[axis])<.035,`${kind} LOD bounds match: ${axis} ${boxes[0].maximum[axis]} ${boxes[i].maximum[axis]}`);
    }
  }
  const island=new TransformNode('island',scene);
  for(let i=0;i<3;i++){
    const node=new TransformNode('wood-node-'+i,scene);node.parent=island;
    node.setEnabled(false);
    assert.equal(system.attachTreeVisual(node,i,8,true),HARVESTABLE_TREE_ASSETS[i]);
    const visual=node.getChildMeshes()[0];
    assert.equal(visual.metadata.harvestableTree,true);
    assert.equal(visual.isEnabled(),false,'late asset attachment preserves a harvested node');
    node.setEnabled(true);
    assert.equal(visual.isEnabled(),true,'respawn restores the original GLB');
    root.setEnabled(false);
    assert.equal(visual.isEnabled(),true,'island wood does not depend on mainland visibility');
    root.setEnabled(true);
    visual.computeWorldMatrix(true);
    const box=visual.getBoundingInfo().boundingBox;
    assert.ok(Math.abs(box.maximumWorld.y-box.minimumWorld.y-8)<.01);
  }
  const decorativeNode=new TransformNode('decorative-tree',scene);
  assert.equal(system.attachTreeVisual(decorativeNode,0,10),DECORATIVE_TREE_ASSETS.arbolito1);
  assert.equal(decorativeNode.getChildMeshes()[0].metadata.harvestableTree,false);
  assert.equal(imports.length,22,'fixed trees share the loaded GLBs');
  for(let i=0;i<60;i++)system.update();
  assert.ok(system.activeChunkCount>cells.length&&
    system.activeChunkCount<=desiredChunks(center.cx*MAINLAND.chunkSize,
      center.cz*MAINLAND.chunkSize,VEGETATION_CONFIG.renderRadiusChunks.trees).length,
  'distant trees stream beyond the playable terrain ring');
  assert.ok(system.instanceCount>0,'thin instance buffers populated');
  const farTree=scene.getMeshByName('vegetacion-arbolito2-far');
  assert.ok(farTree&&farTree.getTotalVertices()>0&&
    farTree.getTotalIndices()<scene.getMeshByName('vegetacion-arbolito2').getTotalIndices(),
    'distant trees use a simplified version of the source GLB');
  // Chunks load nearest first; reach the distant ring before checking its LOD.
  let loadedUpdates=60;
  for(let i=0;i<300&&!farTree.thinInstanceCount;i++,loadedUpdates++)system.update();
  assert.ok(farTree.thinInstanceCount>0,'distant trees switch to the proxy');
  assert.equal(farTree.material,scene.getMeshByName('vegetacion-arbolito2').material,
    'near and far models share the original texture and PBR settings');
  const meshBounds=mesh=>{
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i++){
      const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);
      max[axis]=Math.max(max[axis],positions[i]);
    }
    return {min,max};
  };
  const originalBounds=meshBounds(scene.getMeshByName('vegetacion-arbolito2'));
  const lodBounds=meshBounds(farTree);
  for(let axis=0;axis<3;axis++){
    assert.ok(Math.abs(originalBounds.min[axis]-lodBounds.min[axis])<.07&&
      Math.abs(originalBounds.max[axis]-lodBounds.max[axis])<.07,
    'near and far tree pivots and silhouettes agree');
  }
  assert.ok(farTree.getVerticesData(VertexBuffer.UVKind)?.length>0,
    'the distant mesh retains UVs for the original texture');
  assert.ok(system.farInstanceCount>0&&system.farInstanceCount<system.instanceCount,
    'near and far tree visuals coexist without changing placement totals');
  assert.equal(farTree.isPickable,false,'distant silhouettes do not affect collisions');
  for(const kind of ['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1']){
    const mesh=scene.getMeshByName(`vegetacion-${kind}`);
    assert.ok(mesh&&mesh.getTotalVertices()>0,'source geometry retained');
    assert.ok(mesh.material,'source material retained');
    const materials=mesh.material instanceof MultiMaterial?mesh.material.subMaterials:[mesh.material];
    assert.ok(materials.some(material=>material?.albedoTexture),'source textures retained');
    if(kind in DECORATIVE_TREE_ASSETS){
      assert.equal(mesh.metadata.assetId,DECORATIVE_TREE_ASSETS[kind]);
      assert.ok(materials.some(material=>material.name.toLowerCase().includes('_wood_')));
      assert.ok(materials.some(material=>material.name.toLowerCase().includes('_leaves_')));
    }
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
    let minY=Infinity,maxY=-Infinity;
    for(let i=1;i<positions.length;i+=3){minY=Math.min(minY,positions[i]);maxY=Math.max(maxY,positions[i]);}
    assert.ok(Math.abs(minY)<.05&&maxY>.35,'source pivots stay at ground and Y is up');
    if(kind in DECORATIVE_TREE_ASSETS)
      assert.ok(maxY*VEGETATION_CONFIG.baseScale[kind]>19&&
        maxY*VEGETATION_CONFIG.baseScale[kind]<36,'enlarged V4 trees frame the landscape');
    assert.equal(mesh.metadata.decorativeVegetation,true);
    assert.equal(mesh.isPickable,false);
    assert.ok(mesh.thinInstanceCount>=0);
  }
  const before=system.instanceCount;
  system.setActiveChunks([],1100,-900);
  assert.equal(system.activeChunkCount,0,'released all streamed vegetation chunks');
  assert.equal(system.instanceCount,0);
  assert.equal(system.sharedMeshCount,9,'shared GLBs survive chunk release');
  assert.ok(before>0);
  system.setActiveChunks(cells,center.cx*MAINLAND.chunkSize,center.cz*MAINLAND.chunkSize);
  for(let i=0;i<loadedUpdates;i++)system.update();
  assert.equal(system.instanceCount,before,'reload restores deterministic instance count');
  assert.equal(imports.length,22,'reload makes no new GLB imports');
  const target={x:-509,z:32};
  const targetChunk=chunkOf(target.x,target.z);
  const targetCells=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)
    targetCells.push({cx:targetChunk.cx+dx,cz:targetChunk.cz+dz});
  system.setActiveChunks(targetCells,target.x,target.z);
  system.setColliderFocus(target.x,target.z);
  for(let i=0;i<60;i++)system.update();
  const specimen=targetCells.flatMap(cell=>vegetationForChunk(cell.cx,cell.cz))
    .filter(p=>p.kind==='arbolito2')
    .sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z))[0];
  assert.ok(specimen,'the reduced forest retains a trunk collision specimen');
  system.setColliderFocus(specimen.x,specimen.z);
  assert.equal(system.queryTreeWall(specimen.x,specimen.y+.35,specimen.z+3,0,-1,3),null,
    'shallow roots do not become torso walls');
  const trunkWall=system.queryTreeWall(specimen.x,specimen.y+1.8,specimen.z+3,0,-1,3);
  assert.ok(trunkWall&&trunkWall.distance<3&&trunkWall.distance>0,
    'the V4 trunk mesh blocks a body approaching from the front');
  const world={
    ground:(x,z,originY,maxDistance)=>{
      const root=system.queryTreeGround(x,z,originY,maxDistance);
      return root??(specimen.y<=originY&&specimen.y>=originY-maxDistance
        ?{height:specimen.y,normalY:1}:null);
    },
    solidTop:()=>null,
    wall:(x,y,z,dx,dz,reach)=>{
      const hit=system.queryTreeWall(x,y,z,dx,dz,reach);
      return hit?{pointX:hit.point.x,pointY:hit.point.y,pointZ:hit.point.z,
        distance:hit.distance,normalX:hit.normal.x,normalY:hit.normal.y,
        normalZ:hit.normal.z,rockId:hit.id,climbable:false}:null;
    },
    headroom:()=>true,canMove:()=>true,fallbackHeight:()=>specimen.y
  };
  const player=new CharacterTraversalController();
  player.teleport(specimen.x,specimen.y,specimen.z+4);
  const input={moveX:0,moveZ:-1,forwardX:0,forwardZ:-1,
    horizontal:0,vertical:0,run:false,jumpPressed:false};
  for(let i=0;i<24;i++)player.step(.025,input,world);
  assert.ok(player.position.z>trunkWall.point.z+.25,
    'the character stops before entering the replacement GLB trunk');
  console.log(`✓ Vegetación: nueve GLB compartidos, ${before} instancias en ${system.activeChunkCount} chunks, liberación y recarga`);
  system.dispose();scene.dispose();engine.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
