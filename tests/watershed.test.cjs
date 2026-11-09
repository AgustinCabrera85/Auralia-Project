const assert=require('node:assert/strict');
const {PILOT_DRAINAGE,validateDrainage,WatershedHydrology,catchmentSupply}=require('../.test-build/world/WatershedHydrology.js');
const {LAGOON_CHANNELS,lagoonWaterAt}=require('../.test-build/world/lagoonData.js');
const {HEADWATER_LAKE,HEADWATER_CATCHMENTS}=require('../.test-build/world/watershedHeadwaters.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const ground=(x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight);
assert.deepEqual(validateDrainage(),[]);
const modified=(id,change)=>PILOT_DRAINAGE.map(r=>r.id===id?{...r,...change}:r);
assert.ok(validateDrainage(modified('sea',{to:'reach-0'})).some(e=>e.includes('cycle')));
assert.ok(validateDrainage(modified('prado',{to:null})).some(e=>e.includes('dead end')));
assert.ok(validateDrainage(modified('reach-1',{to:'reach-0'})).some(e=>e.includes('uphill junction')));
assert.ok(validateDrainage(modified('prado',{points:[{x:900,z:900,level:2,width:3}]})).some(e=>e.includes('disconnected')));
// A valid graph alone isn't enough: check the rendered 6 m triangles for dams.
let stations=0;
for(const [n,route] of LAGOON_CHANNELS.entries()){
  let along=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/3);
    for(let j=1;j<=steps;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(n>=4&&along+length*t<24)continue; // wet rill emerges gradually from its dry head
      const water=lagoonWaterAt(x,z);
      assert.ok(water&&water.level-ground(x,z)>.05,`dam in rendered reach ${n} at ${x},${z}`);
      stations++;
    }
    along+=length;
  }
}
const l=HEADWATER_LAKE;
assert.ok(l.level-ground(l.x,l.z)>6.8,'upland lake has a deep basin');
for(const [dx,dz] of [[l.radiusX*1.15,0],[-l.radiusX*1.15,0],[0,-l.radiusZ*1.15]]){
  // Northern inlet is offset east; the other shoulders retain water.
  assert.ok(ground(l.x+dx,l.z+dz)>l.level,'tarn has containing banks');
}
const mouth=PILOT_DRAINAGE.find(r=>r.kind==='sea').points[0];
assert.ok(ground(mouth.x,mouth.z)<mouth.level-5,'mouth terminates in the sea, not inland');
for(let i=0;i<3;i++){
  assert.ok(catchmentSupply(i,0,'winter')>0,'permanent baseflow');
  assert.ok(catchmentSupply(i,1,'spring')>catchmentSupply(i,0,'spring'),'rain adds supply');
}
assert.ok(catchmentSupply(2,0,'spring')>catchmentSupply(2,0,'winter'),'high basin seasonal melt');
const model=new WatershedHydrology();model.update(0,0,'spring');
const baseline=[...model.flows],phase=model.phase;
const sea=PILOT_DRAINAGE.findIndex(r=>r.id==='sea');
assert.ok(Math.abs(baseline[sea]-HEADWATER_CATCHMENTS.reduce((sum,_,i)=>sum+catchmentSupply(i,0,'spring'),0))<1e-9,
  'confluences conserve the pilot catchment supply at equilibrium');
model.update(1/60,1,'spring');
assert.ok(model.phase>phase&&model.phase-phase<.03,'no texture phase jump on weather change');
assert.ok(model.flows[sea]-baseline[sea]<.001,'lake storage damps the immediate storm response');
for(let i=0;i<9000;i++)model.update(.1,1,'spring');
assert.ok(model.flows[sea]>baseline[sea]*2,'sustained rain increases outflow');
const storm=model.flows[sea];model.update(.1,0,'winter');
assert.ok(model.flows[sea]>storm*.99,'stored water does not disappear when the rain stops');
assert.ok(model.flows.every(v=>Number.isFinite(v)&&v>=0));
console.log(`✓ Pilot drainage: ${PILOT_DRAINAGE.length} reaches, ${stations} rendered channel stations, sources, junctions, sea outlet and damped seasonal supply`);
