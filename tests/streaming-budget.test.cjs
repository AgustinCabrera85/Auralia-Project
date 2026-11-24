const assert=require('node:assert/strict');
const {NullEngine,Scene,MeshBuilder,Matrix}=require('@babylonjs/core');
const {FrameWorkScheduler}=require('../.test-build/world/FrameWorkScheduler.js');
const {VegetationSystem}=require('../.test-build/world/VegetationSystem.js');
const {GrassPatchStream}=require('../.test-build/world/grass/GrassPatchStream.js');
const {GrassPatchCache}=require('../.test-build/world/grass/GrassPatchCache.js');
const {GRASS_VARIANTS}=require('../.test-build/world/grass/GrassPatchData.js');
const {updateInstanceBuffer}=require('../.test-build/world/DynamicInstanceBuffers.js');

let time=0;const order=[],scheduler=new FrameWorkScheduler(()=>time);
const tasks=[0,1,2].map(id=>deadline=>{assert.ok(time<deadline);order.push(id);time+=3});
for(let i=0;i<6;i++)scheduler.run(tasks,2);
assert.deepEqual(order,[0,1,2,0,1,2],'an expensive piece stops the frame and the next system gets its turn');
scheduler.run(tasks,0);scheduler.run([],2);assert.equal(order.length,6);

const engine=new NullEngine(),scene=new Scene(engine);
const mesh=name=>MeshBuilder.CreateBox(name,{},scene);
const originalNow=Object.getOwnPropertyDescriptor(performance,'now');
let ticks=0;
try{
  // Loaded placements avoid asset IO. Exercise the real selection/upload code
  // with a deterministic clock so a slow CI machine cannot invalidate the test.
  const plants=mesh('plants');
  updateInstanceBuffer(plants,'matrix',Matrix.Translation(-999,0,0).m,16);
  const v=Object.create(VegetationSystem.prototype);
  Object.assign(v,{ready:true,disposed:false,initialized:true,pending:[],sources:new Map([['plantitas1',plants]]),
    farSources:new Map(),lowSources:new Map(),canopySources:new Map(),placementMatrices:new WeakMap(),plantLods:new WeakMap(),
    chunks:new Map([['0:0',Array.from({length:1024},(_,i)=>({kind:'plantitas1',x:i%32,y:0,z:Math.floor(i/32),scale:1,yaw:0}))]]),
    center:{cx:0,cz:0},visualFocus:{x:0,z:0},viewDirection:{x:0,z:1},lastBufferFocus:{x:0,z:0},
    treeFocus:{x:0,z:0},treeColliders:{sync(){}},buffersDirty:true,bufferWork:null,bufferWorkMs:0,farBatch:0});
  Object.defineProperty(performance,'now',{configurable:true,value:()=>++ticks});
  v.update(5);
  assert.ok(v.bufferWork,'large selections yield before publication');
  assert.equal(plants.thinInstanceCount,1,'keep the old selection visible while preparing');
  v.setActiveChunks([],48,0);
  let frames=0;while((v.bufferWork||v.buffersDirty)&&frames++<300)v.update(5);
  assert.ok(frames<300&&frames>1);assert.equal(plants.thinInstanceCount,1024);
  assert.equal(v.instanceCount,1024);assert.equal(v.lastBufferFocus.x,48,'movement during a build is not lost');

  const sources=new Map(GRASS_VARIANTS.map(k=>[k,mesh('near-'+k)]));
  const sprites=new Map(GRASS_VARIANTS.map(k=>[k,mesh('far-'+k)]));
  const patch=(base,distant)=>Array.from({length:1024},(_,i)=>{
    const x=base+(i%8)*.1;return {x,z:0,variant:GRASS_VARIANTS[i%4],distant,matrix:new Float32Array(Matrix.Translation(x,0,0).m)};
  });
  const g=Object.create(GrassPatchStream.prototype);
  Object.assign(g,{active:true,dirty:true,refreshWork:null,refreshWorkMs:0,refreshMaxMs:0,
    sources,sprites,focus:{x:0,z:0},patches:new Map([['0:0',patch(12,false)],['5:0',patch(140,true)]]),
    patchDetails:new Map([['0:0',true],['5:0',true]]),cache:new GrassPatchCache(),patchExclusions:new Map(),exclusions:()=>[],
    queue:[],building:null,world:{source:{isReady:()=>false}},selectionX:0,selectionZ:0});
  const drain=()=>{let n=0;while((g.refreshWork||g.dirty)&&n++<500)g.update(5);assert.ok(n<500);return n};
  assert.ok(drain()>1);
  assert.equal(g.nearCount,1024);assert.equal(g.spriteCount,1024);
  for(const k of GRASS_VARIANTS){assert.equal(sources.get(k).thinInstanceCount,256);assert.equal(sprites.get(k).thinInstanceCount,256);}
  g.refreshExclusions();g.update(5);g.setFocus(120,0);drain();
  assert.equal(g.nearCount,1024);assert.equal(g.spriteCount,0,'the previous far patch now supplies the complete near LOD');
  for(const k of GRASS_VARIANTS){
    assert.equal(sources.get(k).thinInstanceCount,256);assert.equal(sprites.get(k).thinInstanceCount,0);
    assert.ok(sources.get(k)._thinInstanceDataStorage.matrixData[12]>=140);
  }
  g.refreshExclusions();g.update(5);g.deactivate();g.update(5);
  assert.equal(g.refreshWork,null);assert.equal(g.instanceCount,0);
  for(const m of [...sources.values(),...sprites.values()])assert.equal(m.thinInstanceCount,0,'cancelled work cannot republish after deactivation');
  console.log('Streaming: shared deadline/fairness, incremental selections, movement during build, complete LOD families and cancellation passed.');
}finally{
  if(originalNow)Object.defineProperty(performance,'now',originalNow);else delete performance.now;
  scene.dispose();engine.dispose();
}
