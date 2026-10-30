const assert=require('node:assert/strict');
const {FreeCamera,NullEngine,Scene,TransformNode,Vector3}=require('@babylonjs/core');
const {GrassFieldSystem}=require('../.test-build/world/grass/GrassFieldSystem.js');
const {grassForPatch,grassRegionHasPotential,GRASS_CONFIG}=
  require('../.test-build/world/grass/grassData.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');

const meadow=grassForPatch(-6,-2,'near');
assert.ok(meadow.length>25,'Brisalia has a dense nearby meadow');
assert.ok(grassRegionHasPotential(-6,-2),
  'the fixed terrain-region mask includes the Brisalia meadow');
assert.deepEqual(meadow,grassForPatch(-6,-2,'near'),'patch positions are deterministic');
assert.ok(meadow.every(p=>Math.abs(p.y-sampleMainlandHeight(p.x,p.z)-.025)<1e-7),
  'each clump touches the canonical terrain height');
assert.equal(grassForPatch(-6,-2,'near',[{x:-66,z:-18,radius:20}]).length,0,
  'occupied building areas clear the grass');
assert.ok(grassForPatch(-6,-2,'medium').length<meadow.length,
  'the middle-distance representation is sparser');
const nearPositions=new Set(meadow.map(p=>`${p.x}:${p.z}`));
assert.ok(grassForPatch(-6,-2,'medium').every(p=>nearPositions.has(`${p.x}:${p.z}`)),
  'middle-distance clumps retain their world positions when LOD changes');

const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('mainland',scene);
scene.activeCamera=new FreeCamera('grass-test-camera',new Vector3(-55,10,-20),scene);
const system=new GrassFieldSystem(scene,root,()=>[]);
const center={cx:-1,cz:-1},cells=[];
for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)
  cells.push({cx:center.cx+dx,cz:center.cz+dz});
system.setActiveChunks(cells,-55,-20);
system.update(-55,-20);
assert.ok(system.activePatchCount>0&&system.activePatchCount<=GRASS_CONFIG.patchesPerFrame,
  'patch generation respects the per-frame budget');
for(let i=0;i<100;i++)system.update(-55,-20);
assert.ok(system.activePatchCount>10,'near and middle-distance patches are streamed');
assert.ok(system.instanceCount>500&&system.instanceCount<=GRASS_CONFIG.maxVisibleInstances);
assert.ok(system.triangleCount>system.instanceCount*5);
assert.equal(system.drawCallsEstimate,system.activePatchCount);
assert.equal(scene.materials.length,1,'one shared material covers both LODs');
for(const variant of ['short','medium','tall']){
  const mesh=scene.getMeshByName(`grass-prototype-near-${variant}`);
  assert.ok(mesh&&mesh.getTotalVertices()>20,'each height variant has several curved leaves');
  const flex=mesh.getVerticesData('bendWeight');
  assert.ok(flex.includes(0)&&flex.includes(1),'leaf bases are fixed and tips can bend');
}
const patches=scene.meshes.filter(mesh=>mesh.metadata?.grassPatch);
assert.equal(patches.filter(mesh=>mesh.isVisible).length,system.activePatchCount);
assert.ok(patches.every(mesh=>mesh.thinInstanceCount>0&&!mesh.isPickable&&!mesh.checkCollisions));
scene.render();
assert.ok(patches.every(mesh=>mesh.material.isReady(mesh,true)),
  'instanced grass materials bind and render with an active camera');
const first=patches[0],before=first.thinInstanceCount;
for(let i=0;i<10;i++)system.update(-55,-20);
assert.equal(first.thinInstanceCount,before,'idle frames do not rebuild instance matrices');
for(let i=0;i<300&&system.pendingPatchCount;i++)system.update(-55,-20);
assert.equal(system.pendingPatchCount,0,'the active chunks prepare their grass regions');
const anchored=new Map(scene.meshes.filter(mesh=>mesh.metadata?.grassPatch)
  .map(mesh=>[mesh.name,mesh]));
const firstMatrices=first.thinInstanceGetWorldMatrices().map(matrix=>matrix.asArray());
for(const [x,z] of [[-53,-20],[-51,-19],[-49,-18],[-47,-17]])system.update(x,z);
assert.equal(system.pendingPatchCount,0,'walking within a chunk does not request new patches');
for(const [name,mesh] of anchored)assert.equal(scene.getMeshByName(name),mesh,
  'walking within a chunk keeps each patch mesh and its thin-instance matrices');
assert.deepEqual(first.thinInstanceGetWorldMatrices().map(matrix=>matrix.asArray()),firstMatrices,
  'walking leaves the clump transforms unchanged');
const shared=[...anchored].filter(([,mesh])=>
  Math.floor(mesh.metadata.px/(72/GRASS_CONFIG.patchSize))<0);
system.setActiveChunks(cells,-73,-20);
system.update(-73,-20);
for(const [name,mesh] of shared)assert.equal(scene.getMeshByName(name),mesh,
  'crossing a chunk border retains grass in shared terrain chunks');
system.setActiveChunks([],1000,1000);
assert.equal(system.activePatchCount,0,'distant patches and buffers are released');
assert.equal(system.instanceCount,0);
system.setActiveChunks(cells,-55,-20);
for(let i=0;i<100;i++)system.update(-55,-20);
assert.ok(system.instanceCount>500,'the field regenerates after returning');
system.setEnabled(false);
assert.equal(system.activePatchCount,0,'grass can be disabled independently');
system.setEnabled(true);
for(let i=0;i<100;i++)system.update(-55,-20);
assert.ok(system.activePatchCount>0);
console.log(`✓ Césped: ${system.instanceCount} matas, ~${system.triangleCount} triángulos, `+
  `${system.activePatchCount} parches, ${system.drawCallsEstimate} draw calls de césped`);
system.dispose();scene.dispose();engine.dispose();
