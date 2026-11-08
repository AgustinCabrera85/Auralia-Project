const assert=require('node:assert/strict');
const {NullEngine,Scene,Vector3,VertexBuffer}=require('@babylonjs/core');
const {OceanWater}=require('../.test-build/world/water/OceanWater.js');
const {MAINLAND,sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const geography=require('../.test-build/world/geographicFeatures.js');

const engine=new NullEngine(),scene=new Scene(engine);
const originalWaterSurfaceAt=geography.waterSurfaceAt;
let queries=0;
geography.waterSurfaceAt=(x,z)=>{queries++;return originalWaterSurfaceAt(x,z);};

function singleSlice(ocean,position){
  const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
  let clock=0;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock+=2});
  try{ocean.update(1/60,position);}finally{
    if(descriptor)Object.defineProperty(performance,'now',descriptor);
    else delete performance.now;
  }
}
function settle(ocean,position){
  for(let i=0;i<2000;i++){
    ocean.update(1/60,position);
    if(!ocean.pendingPatch)return;
  }
  assert.fail('ocean build did not finish');
}

// Independent full resampling checks the rendered result against the original
// shoreline and five-point river/lake mask, including negative coordinates.
function assertCanonicalMask(ocean){
  const mesh=ocean.near,positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind);
  const shore=(x,z)=>1-Math.min(1,Math.max(0,MAINLAND.waterLevel-sampleMainlandHeight(x*16,z*16))/3.2);
  const inland=(x,z)=>originalWaterSurfaceAt(Math.round(x),Math.round(z))?1:0;
  for(let i=0;i<positions.length/3;i++){
    const x=mesh.position.x+positions[i*3],z=mesh.position.z+positions[i*3+2];
    const gx=x/16,gz=z/16,sx=Math.floor(gx),sz=Math.floor(gz),tx=gx-sx,tz=gz-sz;
    const a=shore(sx,sz),b=shore(sx+1,sz),c=shore(sx,sz+1),d=shore(sx+1,sz+1);
    assert.equal(colors[i*4],Math.fround((a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz),`shore at ${x},${z}`);
    assert.equal(colors[i*4+1],Math.max(inland(x,z),inland(x-8,z),inland(x+8,z),inland(x,z-8),inland(x,z+8)),
      `river/lake mask at ${x},${z}`);
    assert.equal(colors[i*4+2],0);assert.equal(colors[i*4+3],1);
  }
}

try{
  const ocean=new OceanWater(scene);
  const near=ocean.near,far=ocean.far;
  const buffer=near.getVertexBuffer(VertexBuffer.ColorKind).getBuffer();
  const start=new Vector3(530,0,-591.8);
  assert.equal(near.isEnabled(),false,'unfinished startup mask is never drawn');
  assert.equal(far.material._floats.uPatchRadius,0,'far water has no cutout before the near patch exists');
  queries=0;singleSlice(ocean,start);
  assert.ok(queries>0&&queries<=64*5,'one over-budget slice samples at most 64 vertices');
  assert.ok(ocean.pendingPatch,'a cold build yields instead of blocking one frame');
  assert.equal(near.isEnabled(),false);
  settle(ocean,start);
  assert.equal(near.position.x,544);assert.equal(near.position.z,-576);
  assert.equal(near.isEnabled(),true);
  assert.equal(far.material._floats.uPatchRadius,240);
  assertCanonicalMask(ocean);

  const oldColors=near.getVerticesData(VertexBuffer.ColorKind);
  const before=new Float32Array(oldColors);
  const next=new Vector3(530,0,-592.1);
  queries=0;singleSlice(ocean,next);
  assert.equal(near.position.z,-576,'partial work keeps the old patch position');
  assert.deepEqual(near.getVerticesData(VertexBuffer.ColorKind),before,'partial work cannot change the visible mask');
  assert.equal(far.material._vectors2.uPatchCenter.y,-576,'the far cutout stays aligned with the visible patch');
  settle(ocean,next);
  assert.equal(near.position.z,-608);
  assert.ok(queries<121*121/4,'overlap avoids resampling most of the ocean after a 32m move');
  assert.equal(near.getVertexBuffer(VertexBuffer.ColorKind).getBuffer(),buffer,'patch updates reuse the GPU buffer');
  assertCanonicalMask(ocean);

  queries=0;
  for(let i=0;i<500;i++)ocean.update(1/60,next);
  assert.equal(queries,0,'standing still performs no mask sampling');

  singleSlice(ocean,new Vector3(1600,0,-500));
  singleSlice(ocean,next);
  assert.equal(ocean.pendingPatch,null,'returning to the active patch cancels stale work');
  assert.equal(near.position.z,-608);
  singleSlice(ocean,new Vector3(-1600,0,-500));
  const lake=new Vector3(335,0,-255);
  settle(ocean,lake);
  assert.equal(near.position.x,320);assert.equal(near.position.z,-256,'teleport publishes only the latest destination');
  assertCanonicalMask(ocean);
  const arrays=new Set([ocean.colors,ocean.nextColors]);
  for(const [x,z] of [[352,-256],[384,-288],[352,-256],[320,-256],[-1600,-256],[-1568,-224]]){
    settle(ocean,new Vector3(x,0,z));
    assert.ok(arrays.has(ocean.colors)&&arrays.has(ocean.nextColors),'travel reuses two fixed color arrays');
    assert.equal(near.getVertexBuffer(VertexBuffer.ColorKind).getBuffer(),buffer);
  }
  assertCanonicalMask(ocean);
  singleSlice(ocean,lake);
  ocean.dispose();
  queries=0;ocean.update(1/60,lake);
  assert.equal(ocean.pendingPatch,null);assert.equal(queries,0,'disposed oceans cannot resume queued work');

  const custom=new OceanWater(scene,{nearSize:95,nearSubdivisions:17});
  settle(custom,new Vector3(320,0,-256));assertCanonicalMask(custom);
  settle(custom,new Vector3(352,0,-288));assertCanonicalMask(custom);
  custom.dispose();
  console.log('Ocean: bounded slices, exact coast/lake masks, overlap reuse, atomic publication, teleports, idle and disposal OK');
}finally{
  geography.waterSurfaceAt=originalWaterSurfaceAt;
  scene.dispose();engine.dispose();
}
