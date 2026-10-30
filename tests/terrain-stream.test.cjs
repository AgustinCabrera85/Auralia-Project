const assert=require('node:assert/strict');
const {NullEngine,Ray,Scene,ShaderMaterial,TransformNode,Vector3,VertexBuffer}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {terrainMaterialWeightsAt}=require('../.test-build/world/materials/TerrainMaterial.js');
const {TERRAIN_LOD_CONFIG,cellAt,childrenOf,parentOf,selectGroups}=
  require('../.test-build/world/terrainLod.js');
const {MAINLAND,chunkOf,isLand,sampleMainlandHeight}=
  require('../.test-build/world/terrainData.js');

const engine=new NullEngine();
const scene=new Scene(engine);
const root=new TransformNode('mainland',scene);
const started=performance.now();
const stream=new TerrainStream(scene,root);
const preloadMs=performance.now()-started;
assert.ok(stream.residentFarCount>150,'full low resolution mainland exists before play');
assert.equal(stream.activeCount,0,'near meshes are streamed, not generated globally');
assert.ok(preloadMs<2500,'global fallback has a bounded initialization cost');
assert.equal(scene.getMeshByName('piedras-prototipo'),null);

const covered=(x,z)=>{
  for(let dz=-TERRAIN_LOD_CONFIG.midRadius;dz<=TERRAIN_LOD_CONFIG.midRadius;dz+=72)
    for(let dx=-TERRAIN_LOD_CONFIG.midRadius;dx<=TERRAIN_LOD_CONFIG.midRadius;dx+=72)
      if(Math.hypot(dx,dz)<TERRAIN_LOD_CONFIG.midRadius-72)
        assert.ok(stream.coverageAt(x+dx,z+dz),`coverage at ${x+dx},${z+dz}`);
};

stream.update(0,10,1,0);
assert.equal(stream.activeCount,4,'first playable parent group is preloaded');
assert.ok(stream.activeMidCount>0&&stream.activeFarCount>0,
  'three terrain resolutions coexist without overlap');
assert.ok(stream.pendingCount>0,'relevant refinement jobs remain queued');
covered(0,10);
const initialPending=stream.pendingCount;
stream.update(0,10,1,0);
assert.ok(stream.pendingCount<initialPending,'the queue advances without a chunk transition');

for(let i=0;i<240;i++)stream.update(0,10,1,0);
assert.ok(stream.activeCount>30,'near tiles replace completed mid groups');
covered(0,10);
const a=scene.getMeshByName('terreno-near-0-0');
const b=scene.getMeshByName('terreno-near-1-0');
assert.ok(a&&b&&a.isEnabled()&&b.isEnabled(),'adjacent playable tiles are ready');
const mid=scene.getMeshByName('terreno-mid-1-0');
const far=scene.getMeshByName('terreno-far-1-0');
assert.ok(mid&&far);
assert.ok(a.material instanceof ShaderMaterial);
assert.equal(a.material,mid.material);
assert.equal(a.material,far.material,'all LODs share one terrain material');
assert.equal(scene.textures.length,6,'the six 1K textures are loaded once');
assert.equal(a.isPickable,true);
assert.equal(mid.isPickable,false);
assert.equal(far.isPickable,false,'distant terrain has no gameplay picking');

const seam=(mesh)=>{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind);
  const result=[];
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i]+mesh.position.x;
    if(Math.abs(x-MAINLAND.chunkSize)<1e-5){
      const vertex=i/3;
      result.push({z:positions[i+2]+mesh.position.z,y:positions[i+1],
        normal:normals.slice(i,i+3),weights:colors.slice(vertex*4,vertex*4+4)});
    }
  }
  return result.sort((p,q)=>p.z-q.z);
};
const left=seam(a),right=seam(b);
assert.equal(left.length,MAINLAND.terrainSubdivisions+1);
assert.equal(right.length,left.length);
for(let i=0;i<left.length;i++){
  assert.ok(Math.abs(left[i].z-right[i].z)<1e-5);
  assert.ok(Math.abs(left[i].y-right[i].y)<1e-5,'near heights meet exactly');
  for(let j=0;j<3;j++)assert.ok(Math.abs(left[i].normal[j]-right[i].normal[j])<1e-5);
  for(let j=0;j<4;j++)assert.ok(Math.abs(left[i].weights[j]-right[i].weights[j])<1e-5);
}
assert.ok(mid.getTotalVertices()>(TERRAIN_LOD_CONFIG.midSubdivisions+1)**2,
  'mid tile has skirts to cover T-junctions');
assert.ok(far.getTotalVertices()>(TERRAIN_LOD_CONFIG.farSubdivisions+1)**2,
  'far tile has skirts to cover T-junctions');
for(const [x,z] of [[1,10],[-29,18],[33,120]]){
  const {cx,cz}=chunkOf(x,z);
  const mesh=scene.getMeshByName(`terreno-near-${cx}-${cz}`);
  assert.ok(mesh);
  const sampleZ=z===120?z-.01:z;
  const hit=scene.pickWithRay(new Ray(new Vector3(x,1000,sampleZ),Vector3.Down(),2000),
    candidate=>candidate===mesh);
  assert.ok(hit.hit&&Math.abs(hit.pickedPoint.y-sampleMainlandHeight(x,sampleZ))<.7,
    'playable ground keeps the canonical height');
  assert.ok(isLand(x,z));
}
const grass=terrainMaterialWeightsAt(1,10,8.6,.04);
const cliff=terrainMaterialWeightsAt(-275,-535,42.7,1.4);
const shore=terrainMaterialWeightsAt(245,-250,5,.12);
assert.ok(grass[0]>.7&&cliff[2]>.7&&shore[3]>.5);
assert.deepEqual(parentOf(childrenOf({cx:-2,cz:3})[3]),{cx:-2,cz:3});
assert.ok(selectGroups(0,10,252,144).some(c=>c.cx===-1&&c.cz===0));
assert.deepEqual(cellAt(-.01,0,72),{cx:-1,cz:0});

const resident=stream.residentFarCount;
stream.update(1100,-900,-1,0);
covered(1100,-900);
assert.equal(stream.residentFarCount,resident,'teleport keeps the fallback resident');
assert.equal(scene.getMeshByName('terreno-near-0-0'),null,
  'obsolete high-detail geometry is released');
assert.ok(stream.activeCount>=4,'teleport preloads playable terrain');
for(let i=0;i<80;i++)stream.update(1100,-900,-1,0);
covered(1100,-900);
stream.dispose();
assert.equal(scene.textures.length,0,'shared textures are released with the stream');
scene.dispose();engine.dispose();
console.log('✓ Terreno LOD: cobertura, prioridades, costuras, swaps, teletransporte y suelo canónico');
