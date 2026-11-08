const assert=require('node:assert/strict');
const {Mesh,NullEngine,PBRMaterial,Scene,TransformNode,VertexData,Vector3}=
  require('@babylonjs/core');
const {GrassSectorSystem,GRASS_GLB}=
  require('../.test-build/world/grass/GrassSectorSystem.js');
const {bakeGrassSectorPatch}=require('../.test-build/world/grass/GrassSectorBake.js');
const {emptyWorldDocument,setWorldDocument,saveGrassBake,getWorldDocument,appendGrassStroke}=
  require('../.test-build/world/editor/WorldEditState.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');

function source(name,scene){
  const mesh=new Mesh(`grass_${name}`,scene);
  const data=new VertexData();
  data.positions=[-.1,0,0,.1,0,0,0,1,0];
  data.indices=[0,1,2];
  data.normals=[0,0,1,0,0,1,0,0,1];
  data.applyToMesh(mesh);
  return mesh;
}
const loader=async scene=>{
  const material=new PBRMaterial('grass-glb-material',scene);
  return ['short','medium','tall','flower'].map(name=>{
    const mesh=source(name,scene);mesh.material=material;return mesh;
  });
};
const packed=(x,z,flower=0)=>[x,500,z,.4,1,1,1,1,1,flower];
const positions=scene=>scene.meshes.filter(mesh=>mesh.metadata?.grassSource&&mesh.isVisible)
  .flatMap(mesh=>mesh.thinInstanceGetWorldMatrices().map(matrix=>
    [matrix.m[12],matrix.m[13],matrix.m[14]]))
  .sort((a,b)=>a[0]-b[0]||a[2]-b[2]);

async function main(){
  assert.equal(GRASS_GLB,'/assets/grass/grass_tufts.glb');
  setWorldDocument({...emptyWorldDocument(),grassMode:'painted'});
  saveGrassBake(-6,-2,packed(-66,-18));
  saveGrassBake(6,-2,packed(78,-18,1));
  saveGrassBake(21,-2,packed(258,-18));
  saveGrassBake(26,-7,packed(312,-84));
  saveGrassBake(-61,-35,packed(-730,-420));

  const engine=new NullEngine(),scene=new Scene(engine);
  const root=new TransformNode('mainland',scene);
  root.position=new Vector3(10,2,20);
  let exclusions=[];
  const system=new GrassSectorSystem(scene,root,()=>exclusions,loader);
  await system.whenReady;
  const wind=scene.getMaterialByName('grass-glb-material').pluginManager
    .getPlugin('AuraliaGrassWind');
  assert.ok(wind,'GLB material receives the wind plugin');
  assert.ok(scene.getMaterialByName('grass-glb-material').pluginManager
    ._activePluginsForExtraEvents.includes(wind),
    'the per-draw wind time callback is active');
  assert.match(wind.getCustomCode('vertex').CUSTOM_VERTEX_UPDATE_WORLDPOS,
    /grassBend \*= grassBend/,'wind flexes upper vertices while bases stay fixed');
  system.setFocus(-55,-20);
  system.update();
  assert.equal(system.instanceCount,2,'only nearby saved sectors are loaded');
  assert.ok(system.drawCallsEstimate<=4,'GLB variants are batched into thin instances');
  for(const mesh of scene.meshes.filter(mesh=>mesh.metadata?.grassSource))
    assert.ok(mesh.position.lengthSquared()<1e-12&&mesh.parent===root,
      'source GLB meshes remain at the mainland origin like authored assets');
  const initial=positions(scene);
  assert.deepEqual(initial.map(p=>[p[0],p[2]]),[[-66,-18],[78,-18]],
    'instance matrices contain absolute mainland coordinates');
  for(const [x,y,z] of initial)
    assert.ok(Math.abs(y-nearTerrainHeightAt(x,z,sampleMainlandHeight))<.05,
      'saved bake heights are replaced by the visible terrain height');

  system.setFocus(-1,-20);system.update();
  assert.deepEqual(positions(scene),initial,
    'walking within a chunk never moves or redistributes grass');
  system.setFocus(0,-20);system.update();
  assert.deepEqual(positions(scene),initial,
    'crossing a chunk boundary keeps shared grass in world coordinates');
  system.setFocus(360,-20);system.update();
  assert.equal(system.instanceCount,1,'distant sectors unload');
  assert.deepEqual(positions(scene).map(p=>[p[0],p[2]]),[[312,-84]],
    'baked grass reanchors on gentle ground and skips the steep bank at 258,-18');
  system.setFocus(-55,-20);system.update();
  assert.deepEqual(positions(scene),initial,
    'returning to a sector restores the identical saved matrices');

  exclusions=[{x:-66,z:-18,radius:3}];
  system.refreshExclusions();system.update();
  assert.equal(system.instanceCount,1,'new structures exclude nearby grass');
  exclusions=[];
  system.refreshExclusions();system.update();
  assert.deepEqual(positions(scene),initial);
  exclusions=Array.from({length:2000},(_,i)=>({x:10000+i,z:10000,radius:3}));
  exclusions.push({x:71,z:-18,radius:7});
  system.refreshExclusions();system.update();
  assert.deepEqual(positions(scene).map(p=>p[0]),[-66],
    'an obstacle across the sector boundary still excludes grass within its radius');
  exclusions=[{x:250,z:-18,radius:174}];
  system.refreshExclusions();system.update();
  assert.deepEqual(positions(scene).map(p=>p[0]),[-66],
    'large exclusions reach sectors beyond the obstacle center');
  exclusions=[];
  system.refreshExclusions();system.update();
  assert.deepEqual(positions(scene),initial);
  system.setFocus(-730,-420);system.update();
  assert.equal(system.instanceCount,0,'legacy baked grass is hidden inside the V4 forest');
  system.deactivate();
  assert.equal(system.instanceCount,0,'leaving the mainland clears grass buffers');
  system.setFocus(-55,-20);system.update();
  assert.deepEqual(positions(scene),initial);
  system.dispose();scene.dispose();engine.dispose();
  setWorldDocument(emptyWorldDocument());
  bakeGrassSectorPatch(0,0);
  assert.equal(getWorldDocument().grassBakes[0].placements.length,0,
    'unpainted sectors stay empty');
  appendGrassStroke({x:6,z:6,radius:12,strength:1,density:2});
  bakeGrassSectorPatch(0,0);
  const firstBake=[...getWorldDocument().grassBakes[0].placements];
  assert.ok(firstBake.length>0&&firstBake.length%10===0,
    'painting creates saved GLB placements');
  bakeGrassSectorPatch(0,0);
  assert.deepEqual(getWorldDocument().grassBakes[0].placements,firstBake,
    'editor bakes the same sector at identical positions');
  console.log('✓ GLB grass sectors retain immutable world positions across streaming');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
