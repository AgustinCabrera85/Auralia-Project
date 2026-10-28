const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NullEngine,Scene,TransformNode,ImportMeshAsync,VertexBuffer}=require('@babylonjs/core');
const {VegetationSystem}=require('../.test-build/world/VegetationSystem.js');
const {vegetationForChunk,VEGETATION_CONFIG}=require('../.test-build/world/vegetationData.js');
const {chunkOf,MAINLAND,sampleMainlandHeight,geographyMasks,isStarterArea}=require('../.test-build/world/terrainData.js');

const sample=vegetationForChunk(-8,-8);
assert.deepEqual(sample,vegetationForChunk(-8,-8),'same seed and chunk give identical placements');
assert.ok(sample.length>0,'sample chunk has vegetation');
assert.ok(sample.every(p=>Math.abs(sampleMainlandHeight(p.x,p.z)-p.y)<1e-8));
assert.ok(sample.every(p=>p.y>MAINLAND.waterLevel&&geographyMasks(p.x,p.z).road<=VEGETATION_CONFIG.roadMaskLimit));
assert.ok(sample.every(p=>!isStarterArea(p.x,p.z)));
assert.ok(sample.every(p=>p.yaw>=0&&p.yaw<Math.PI*2));
assert.ok(sample.every(p=>p.kind==='plantitas1'?p.scale>2:p.kind==='tronco1'?p.scale>5:p.scale>11),'vegetation is scaled against the four-metre player');
const blocked=sample[0];
assert.ok(!vegetationForChunk(-8,-8,[{x:blocked.x,z:blocked.z,radius:8}]).some(p=>Math.hypot(p.x-blocked.x,p.z-blocked.z)<8));
const treeSample=sample.find(p=>p.obstacleRadius>0);
assert.ok(treeSample);
const nearHouse=vegetationForChunk(-8,-8,[{x:treeSample.x,z:treeSample.z,radius:5}]);
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
  assert.equal(system.sharedMeshCount,6,'six imported source meshes');
  assert.equal(imports.length,6,'each GLB imported once');
  assert.equal(new Set(imports).size,6);
  for(let i=0;i<60;i++)system.update();
  assert.ok(system.activeChunkCount>0&&system.activeChunkCount<=cells.length);
  assert.ok(system.instanceCount>0,'thin instance buffers populated');
  for(const kind of ['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1']){
    const mesh=scene.getMeshByName(`vegetacion-${kind}`);
    assert.ok(mesh&&mesh.getTotalVertices()>0,'source geometry retained');
    assert.ok(mesh.material,'source material retained');
    assert.ok(mesh.material.albedoTexture,'source texture retained');
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
    let minY=Infinity,maxY=-Infinity;
    for(let i=1;i<positions.length;i+=3){minY=Math.min(minY,positions[i]);maxY=Math.max(maxY,positions[i]);}
    assert.ok(minY>-.05&&minY<.05&&maxY>.35&&maxY<1.05,'source pivots stay at ground and Y is up');
    assert.equal(mesh.metadata.decorativeVegetation,true);
    assert.equal(mesh.isPickable,false);
    assert.ok(mesh.thinInstanceCount>=0);
  }
  assert.equal(system.blocksMovement(treeSample.x+.2,treeSample.z,treeSample.x+3,treeSample.z),true,'circular trunk stops entry');
  assert.equal(system.blocksMovement(treeSample.x+3,treeSample.z,treeSample.x+.2,treeSample.z),false,'player can leave a trunk after loading');
  const before=system.instanceCount;
  system.setActiveChunks([],1100,-900);
  assert.equal(system.activeChunkCount,0,'released all streamed vegetation chunks');
  assert.equal(system.instanceCount,0);
  assert.equal(system.sharedMeshCount,6,'shared GLBs survive chunk release');
  assert.ok(before>0);
  system.setActiveChunks(cells,center.cx*MAINLAND.chunkSize,center.cz*MAINLAND.chunkSize);
  for(let i=0;i<60;i++)system.update();
  assert.equal(system.instanceCount,before,'reload restores deterministic instance count');
  assert.equal(imports.length,6,'reload makes no new GLB imports');
  console.log(`✓ Vegetación: seis GLB compartidos, ${before} instancias en ${system.activeChunkCount} chunks, liberación y recarga`);
  system.dispose();scene.dispose();engine.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
