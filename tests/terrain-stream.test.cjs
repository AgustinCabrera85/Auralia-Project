const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode,VertexBuffer}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {MAINLAND,desiredChunks,chunkOf,isLand,sampleMainlandHeight}=require('../.test-build/world/terrainData.js');

const engine=new NullEngine();
const scene=new Scene(engine);
const root=new TransformNode('mainland',scene);
const stream=new TerrainStream(scene,root);
assert.equal(stream.activeCount,0,'no genera chunks en el constructor');
stream.update(0,10);
assert.ok(stream.activeCount>0&&stream.activeCount<=MAINLAND.chunksPerFrame,'presupuesto por fotograma');
for(let i=0;i<100;i++)stream.update(0,10);
assert.ok(stream.activeCount<=desiredChunks(0,10).length,'solo chunks cercanos');
const old=stream.activeCount;
assert.ok(old>40,'anillo cercano cargado progresivamente');

const a=scene.getMeshByName('terreno-chunk-0-0');
const b=scene.getMeshByName('terreno-chunk-1-0');
assert.ok(a&&b,'chunks vecinos presentes');
const seam=(mesh)=>{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  const result=[];
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i]+mesh.position.x;
    if(Math.abs(x-MAINLAND.chunkSize)<1e-6){
      result.push({z:positions[i+2]+mesh.position.z,y:positions[i+1],normal:normals.slice(i,i+3)});
    }
  }
  return result.sort((p,q)=>p.z-q.z);
};
const left=seam(a),right=seam(b);
assert.equal(left.length,MAINLAND.terrainSubdivisions+1);
assert.equal(right.length,left.length);
for(let i=0;i<left.length;i++){
  assert.ok(Math.abs(left[i].z-right[i].z)<1e-6);
  assert.ok(Math.abs(left[i].y-right[i].y)<1e-5,'altura sin costura');
  for(let j=0;j<3;j++)assert.ok(Math.abs(left[i].normal[j]-right[i].normal[j])<1e-5,'normal sin costura');
}
for(const [x,z] of [[1,10],[-29,18],[33,120]]){
  const {cx,cz}=chunkOf(x,z);
  const mesh=scene.getMeshByName(`terreno-chunk-${cx}-${cz}`);
  assert.ok(mesh);
  assert.ok(Math.abs(mesh.getHeightAtCoordinates(x,z)-sampleMainlandHeight(x,z))<.4,'suelo visible cerca de la altura del jugador');
  assert.ok(isLand(x,z),'acceso terrestre a Brisalia, parcela y muelle');
}
assert.equal(isLand(-210,420),false,'el océano bloquea el paso a pie a la isla satélite');

stream.update(1100,-900);
assert.ok(stream.activeCount<=MAINLAND.chunksPerFrame,'teletransporte libera chunks lejanos');
assert.equal(scene.getMeshByName('terreno-chunk-0-0'),null,'malla anterior liberada');
const center=chunkOf(1100,-900);
const remote=scene.getMeshByName(`terreno-chunk-${center.cx}-${center.cz}`);
assert.ok(remote,'nuevo chunk central se genera primero');
assert.ok(Math.abs(remote.getHeightAtCoordinates(1100,-900)-sampleMainlandHeight(1100,-900))<.5,'altura del jugador en zona nueva');
stream.dispose();
scene.dispose();
engine.dispose();
console.log('✓ Streaming: presupuesto, liberación, continuidad de alturas y normales');
