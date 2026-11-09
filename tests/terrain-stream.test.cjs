const assert=require('node:assert/strict');
const {NullEngine,Ray,Scene,ShaderMaterial,TransformNode,Vector3,VertexBuffer}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {terrainTileTopology}=require('../.test-build/world/terrainTileTopology.js');
const {terrainMaterialWeightsAt}=require('../.test-build/world/materials/TerrainMaterial.js');
const {TERRAIN_LOD_CONFIG,cellAt,childrenOf,parentOf,selectGroups,nearTerrainHeightAt,terrainFootprintAt}=
  require('../.test-build/world/terrainLod.js');
const {MAINLAND,chunkOf,isLand,sampleMainlandHeight}=
  require('../.test-build/world/terrainData.js');

const engine=new NullEngine();
const scene=new Scene(engine);
const root=new TransformNode('mainland',scene);
const started=performance.now();
const flatSupport=terrainFootprintAt(2,2,1.5,()=>5);
assert.deepEqual(flatSupport,{height:5,minHeight:5,maxHeight:5,maxSlope:0});
const edgeSupport=terrainFootprintAt(5.5,2,2,x=>x<=6?5:20);
assert.equal(edgeSupport.height,5,'the center alone appears suitable');
assert.ok(edgeSupport.maxSlope>2&&edgeSupport.maxHeight-edgeSupport.minHeight>3,
  'the footprint detects a cliff crossing the base');
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
assert.equal(scene.textures.length,8,'the eight terrain textures are loaded once');
assert.equal(a.isPickable,true);
assert.equal(mid.isPickable,false);
assert.equal(far.isPickable,false,'distant terrain has no gameplay picking');

const settledMeshes=scene.meshes.length,settledTextures=scene.textures.length;
for(let i=0;i<600;i++)assert.equal(stream.update(0,10,Math.cos(i),Math.sin(i)),false);
assert.equal(scene.meshes.length,settledMeshes,'idle camera turns retain the same terrain');
assert.equal(scene.textures.length,settledTextures);
assert.equal(stream.generationMs,0,'idle frames do not spend time regenerating terrain');
stream.setDebugLayer('far');
stream.update(0,10);
assert.equal(a.isVisible,false,'debug visibility updates even after idle frames');
stream.setDebugLayer('all');
assert.equal(a.isVisible,true);

// The far visibility boundary can cross inside one near tile: movement must
// still refresh the view even when it does not request a new set of chunks.
const edgeFar=scene.getMeshByName('terreno-far-6-0');
assert.ok(edgeFar);
stream.update(27.9,10);
assert.equal(edgeFar.isEnabled(),false);
stream.update(28.1,10);
assert.equal(edgeFar.isEnabled(),true,'small movement still refreshes the far ring');
stream.update(0,10);

const seam=(mesh)=>{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind);
  const result=[];
  // The near grid retains the exact playable triangulation.
  for(let i=0;i<(MAINLAND.terrainSubdivisions+1)**2*3;i+=3){
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
assert.equal(a.getTotalVertices(),(MAINLAND.terrainSubdivisions+1)**2,
  'playable tiles need no duplicated skirt vertices');
for(const lod of ['near','mid','far']){
  const {size,offsets,indices}=terrainTileTopology(lod),edges=new Map();
  let area=0;
  for(let i=0;i<indices.length;i+=3){
    const [ia,ib,ic]=indices.slice(i,i+3),[a,b,c]=[ia,ib,ic].map(j=>offsets[j]);
    const twiceArea=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    assert.ok(twiceArea>0,`${lod}: no degenerate, vertical or reversed triangles`);
    area+=twiceArea/2;
    for(const [u,v] of [[ia,ib],[ib,ic],[ic,ia]]){
      const key=u<v?`${u}:${v}`:`${v}:${u}`;
      edges.set(key,(edges.get(key)||0)+1);
    }
  }
  assert.equal(area,size*size,`${lod}: triangles cover the complete tile once`);
  let boundarySegments=0;
  for(const [key,count] of edges){
    assert.ok(count===1||count===2,'edges have at most two incident triangles');
    if(count===2)continue;
    const [a,b]=key.split(':').map(i=>offsets[Number(i)]);
    assert.ok((a[0]===b[0]&&(a[0]===0||a[0]===size))||
      (a[1]===b[1]&&(a[1]===0||a[1]===size)),`${lod}: no open interior seams`);
    assert.equal(Math.hypot(a[0]-b[0],a[1]-b[1]),6,`${lod}: identical edge segmentation`);
    boundarySegments++;
  }
  assert.equal(boundarySegments,4*size/6);
  if(lod!=='near')assert.ok(offsets.length<(size/6+1)**2/3,
    `${lod}: distant interiors remain coarse rather than loading full detail`);
}

// Exercise real generated attributes across every LOD pairing, both directions,
// and every short tile along a long edge, including negative world coordinates.
const edgeVertices=(mesh,axis,line,start,end)=>{
  const p=mesh.getVerticesData(VertexBuffer.PositionKind),result=[];
  const n=mesh.getVerticesData(VertexBuffer.NormalKind);
  const c=mesh.getVerticesData(VertexBuffer.ColorKind);
  const uv=mesh.getVerticesData(VertexBuffer.UVKind);
  for(let i=0;i<p.length/3;i++){
    const x=p[i*3]+mesh.position.x,z=p[i*3+2]+mesh.position.z;
    const along=axis==='x'?z:x,across=axis==='x'?x:z;
    if(Math.abs(across-line)>1e-5||along<start-1e-5||along>end+1e-5)continue;
    result.push([along,p[i*3+1],...n.slice(i*3,i*3+3),
      ...c.slice(i*4,i*4+4),...uv.slice(i*2,i*2+2)]);
  }
  return result.sort((a,b)=>a[0]-b[0]);
};
for(const first of ['near','mid','far'])for(const second of ['near','mid','far'])
  for(const axis of ['x','z']){
    const sizeA=TERRAIN_LOD_CONFIG[`${first}Size`],sizeB=TERRAIN_LOD_CONFIG[`${second}Size`];
    const short=Math.min(sizeA,sizeB),long=Math.max(sizeA,sizeB);
    const line=-864,origin=-1728;
    for(let offset=0;offset<long;offset+=short){
      const aStart=origin+(sizeA===short?offset:0),bStart=origin+(sizeB===short?offset:0);
      const cellA=axis==='x'?{cx:line/sizeA-1,cz:aStart/sizeA}:{cx:aStart/sizeA,cz:line/sizeA-1};
      const cellB=axis==='x'?{cx:line/sizeB,cz:bStart/sizeB}:{cx:bStart/sizeB,cz:line/sizeB};
      // Build isolated fixtures with the same path used by streaming and edits.
      const meshA=stream.createTile(first,cellA),meshB=stream.createTile(second,cellB);
      const edgeA=edgeVertices(meshA,axis,line,origin+offset,origin+offset+short);
      const edgeB=edgeVertices(meshB,axis,line,origin+offset,origin+offset+short);
      assert.equal(edgeA.length,short/6+1,`${first}/${second}: shared edge has every sample`);
      assert.equal(edgeB.length,edgeA.length);
      edgeA.forEach((vertex,i)=>vertex.forEach((value,j)=>
        assert.ok(Math.abs(value-edgeB[i][j])<1e-6,
          `${first}/${second} ${axis}: matching height, normal and all six material weights`)));
      meshA.dispose();meshB.dispose();
    }
  }
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
// The authored northern extension lies beyond the original resident far grid.
// Its complete mid/near groups must render even without a resident far parent.
stream.update(771,-3236,0,-1);
assert.equal(stream.coverageAt(771,-3236),'near',
  'northern extension keeps playable ground immediately after teleport');
for(let i=0;i<300&&stream.pendingCount;i++)stream.update(771,-3236,0,-1);
assert.equal(stream.pendingCount,0);
covered(771,-3236);
assert.ok(stream.activeCount>=60,'the northern extension does not lose ready near tiles');
const northern=scene.getMeshByName('terreno-near-10--45');
assert.ok(northern?.isEnabled());
const northernHit=scene.pickWithRay(new Ray(new Vector3(771,1000,-3236),Vector3.Down(),2000),
  mesh=>mesh===northern);
assert.ok(northernHit.hit&&Math.abs(northernHit.pickedPoint.y-
  nearTerrainHeightAt(771,-3236,sampleMainlandHeight))<.001,
  'visible northern ground matches the collision surface');
assert.equal(stream.residentFarCount,resident,'outer coverage does not expand the permanent grid');
stream.dispose();
assert.equal(scene.textures.length,0,'shared textures are released with the stream');
scene.dispose();engine.dispose();
console.log('✓ Terreno LOD: cobertura, prioridades, costuras, swaps, teletransporte y suelo canónico');
console.log(`  Cobertura inicial: ${preloadMs.toFixed(0)} ms; perímetros compartidos en los tres LOD`);
