const assert=require('node:assert/strict');
const {SpatialHash,overlaps}=require('../.test-build/physics/SpatialHash.js');
const {ChainDynamics}=require('../.test-build/physics/ChainDynamics.js');
const {ChainCurve}=require('../.test-build/physics/ChainCurve.js');
const {sampleField,fieldSample,closestSegments,segmentField,sweepSphere}=require('../.test-build/physics/DistanceFields.js');
const base={id:1,group:1,mask:1,friction:.2,restitution:0},focus={x:0,y:0,z:0};
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const box=(x,y,z,r)=>({minX:x-r,maxX:x+r,minY:y-r,maxY:y+r,minZ:z-r,maxZ:z+r});
let seed=43;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/2**32;
const grid=new SpatialHash(3,100),entries=new Map(),out=[];
for(let i=0;i<350;i++){const b=box(random()*100-50,random()*20-10,random()*100-50,random()*10+.1);entries.set(i,b);grid.upsert(i,b);}
for(let i=0;i<300;i++){
  const b=box(random()*100-50,random()*20-10,random()*100-50,random()*10);
  assert.deepEqual(grid.query(b,out).sort((a,b)=>a-b),[...entries].filter(([,e])=>overlaps(b,e)).map(([id])=>id).sort((a,b)=>a-b),'multi-cell index equals exhaustive AABBs');
}
grid.upsert(999,box(-.1,0,0,.2));assert.ok(grid.query(box(0,0,0,0),out).includes(999));
grid.upsert(999,box(200,0,0,2));assert.ok(!grid.query(box(0,0,0,0),out).includes(999));
grid.remove(999);assert.ok(!grid.query(box(200,0,0,3),out).includes(999));grid.clear();assert.equal(grid.cellCount,0);
assert.throws(()=>new SpatialHash(0));
assert.throws(()=>grid.query({...box(0,0,0,1),maxX:Infinity},out));
grid.upsert(1,box(1e20,0,0,1));assert.deepEqual(grid.query(box(1e20,0,0,1),out),[1]);grid.clear();
const sample=fieldSample(),hit={...sample,s:0,t:0};
const sphere={...base,kind:'sphere',x:0,y:0,z:0,radius:1};
near(sampleField(sphere,2,0,0,sample).distance,1);near(sample.nx,1);
sampleField(sphere,0,0,0,sample);assert.ok(Number.isFinite(sample.nx));
const obb={...base,kind:'box',x:0,y:0,z:0,hx:2,hy:1,hz:.5,yaw:Math.PI/2};
near(sampleField(obb,1.5,0,0,sample).distance,1);
near(sampleField(obb,0,0,0,sample).distance,-.5);
closestSegments(-1,0,0,1,0,0,0,-1,0,0,1,0,hit);near(hit.distance,0);near(hit.s,.5);near(hit.t,.5);
closestSegments(0,0,0,0,0,0,2,0,0,2,0,0,hit);near(hit.distance,2);
closestSegments(-2,0,0,2,0,0,-1,1,0,3,1,0,hit);near(hit.distance,1);
segmentField(sphere,-3,0,0,3,0,0,hit);near(hit.distance,-1);near(hit.s,.5);
const thinWall={...base,kind:'box',x:0,y:0,z:0,hx:.02,hy:4,hz:4,yaw:0};
assert.ok(sweepSphere(thinWall,-10,0,0,10,0,0,.1,sample)<.5,'swept sphere cannot pass through thin wall');
segmentField(thinWall,-10,0,0,10,0,0,hit);assert.ok(hit.distance<0,'sparse segment sees wall between endpoints');
function chainWorld(options={}){
  const w=new ChainDynamics();w.useLod=false;const c=w.add({points:Array.from({length:6},(_,i)=>({x:0,y:3-i*.4,z:0})),worldCollision:false,...options});return {w,c};
}
for(const mode of ['analytic','ftl','pbd','xpbd']){
  const {w,c}=chainWorld({mode});c.impulse(2,0,0);
  for(let i=0;i<300;i++)w.advance(1/60,focus);
  near(c.p[0],0);near(c.p[1],3);assert.ok([...c.p].every(Number.isFinite));assert.ok(w.metrics.maxLengthError<.025,mode+' length error');
  const curve=new ChainCurve();curve.update(c,.5);
  assert.ok([...curve.points,...curve.normals,...curve.binormals].every(Number.isFinite));
  for(let i=0;i<25;i++)near(Math.hypot(...curve.normals.slice(i*3,i*3+3)),1,1e-5);
  w.dispose();assert.equal(w.chains.size,0);
}
// Identical fixed-step trajectories at different render rates.
const a=chainWorld(),b=chainWorld();a.c.impulse(1,1,.3);b.c.impulse(1,1,.3);
for(let i=0;i<120;i++)a.w.advance(1/30,focus);for(let i=0;i<576;i++)b.w.advance(1/144,focus);
for(let i=0;i<a.c.p.length;i++)near(a.c.p[i],b.c.p[i],1e-8);
const original=a.c.p.slice();a.c.setAnchor(20,23,-4,true);for(let i=0;i<a.c.count;i++){near(a.c.p[i*3],original[i*3]+20);near(a.c.p[i*3+1],original[i*3+1]+20);}
a.w.advance(100,focus);assert.equal(a.w.metrics.steps,8);assert.ok(a.w.metrics.droppedSeconds>99);assert.ok(a.w.alpha<1);
a.w.pause();assert.ok(a.c.velocity.every(v=>v===0));near(a.w.alpha,0);
const soft=chainWorld({compliance:.002}),hard=chainWorld({compliance:0});
for(let i=0;i<180;i++){soft.w.advance(1/60,focus);hard.w.advance(1/60,focus);}
assert.ok(soft.w.metrics.maxLengthError>hard.w.metrics.maxLengthError,'compliance changes extension');
const masses=new ChainDynamics();masses.useLod=false;
const mc=masses.add({points:[{x:0,y:0,z:0},{x:1,y:0,z:0}],inverseMasses:[1,3],gravity:0,worldCollision:false,compliance:0});mc.p[3]=2;
masses.advance(1/120,focus);near(mc.p[0],.25);near(mc.p[3],1.25);
mc.p[3]=mc.p[0];mc.velocity.fill(0);masses.advance(1/120,focus);near(mc.p[3]-mc.p[0],1);
// A fully coincident authored chain is valid and produces finite geometry.
const degenerate=chainWorld({points:[{x:0,y:1,z:0},{x:0,y:1,z:0}],gravity:0});
degenerate.w.advance(1/60,focus);const degenerateCurve=new ChainCurve();degenerateCurve.update(degenerate.c,.5);assert.ok(degenerateCurve.normals.every(Number.isFinite));
// Indexed and naive use the same solver, contacts and geometry.
function collisionWorld(index){
  const o=chainWorld({worldCollision:true});o.w.useIndex=index;
  o.w.setCollider({...base,kind:'plane',x:0,y:.7,z:0,nx:0,ny:1,nz:0});
  o.w.setCollider({...sphere,id:2,x:.35,y:1.4,radius:.3});
  for(let i=3;i<23;i++)o.w.setCollider({...sphere,id:i,x:i*4,y:0,z:0});o.c.impulse(1,0,0);return o;
}
const indexed=collisionWorld(true),naive=collisionWorld(false);
let candidates=0,naiveCandidates=0;
for(let i=0;i<180;i++){
  indexed.w.advance(1/60,focus);naive.w.advance(1/60,focus);candidates+=indexed.w.metrics.candidates;naiveCandidates+=naive.w.metrics.candidates;
  for(let j=0;j<indexed.c.p.length;j++)near(indexed.c.p[j],naive.c.p[j],1e-7);
}
assert.ok(candidates<naiveCandidates/5);assert.ok(indexed.c.p.every(Number.isFinite));
assert.ok(indexed.w.measureResiduals().penetration<.003);
for(let i=0;i<indexed.c.count;i++)assert.ok(indexed.c.p[i*3+1]>=.759,'plane support');
const sleeper=chainWorld();for(let i=0;i<300;i++)sleeper.w.advance(1/60,focus);
assert.ok(sleeper.c.sleeping);sleeper.c.impulse(1,0,0);assert.ok(!sleeper.c.sleeping);
sleeper.w.useLod=true;sleeper.w.advance(.05,{x:1000,y:0,z:0});sleeper.w.advance(.2,{x:1000,y:0,z:0});assert.equal(sleeper.c.lod,2);
const frozen=sleeper.c.p.slice();sleeper.w.advance(.1,{x:1000,y:0,z:0});assert.deepEqual(sleeper.c.p,frozen);
sleeper.w.advance(.2,focus);assert.equal(sleeper.c.lod,0);assert.ok(sleeper.c.p.every(Number.isFinite));
// Critical chains survive both distance and decorative-work budget limits.
const priority=new ChainDynamics();priority.maxActiveCosmetics=0;
priority.add({points:[{x:5000,y:3,z:0},{x:5000,y:2,z:0}],critical:true});priority.advance(1/60,focus);assert.equal(priority.metrics.active,1);
const sleeping=chainWorld();for(let i=0;i<300;i++)sleeping.w.advance(1/60,focus);
sleeping.w.setCollider({...sphere,x:0,y:1,z:0});assert.ok(!sleeping.c.sleeping,'nearby obstacle wakes chain');
sleeping.w.remove(sleeping.c.id);assert.equal(sleeping.w.chains.size,0);
// Pair capsules: crossed segments separate, masked chains remain independent.
for(const masked of [false,true]){
  const w=new ChainDynamics();w.useLod=false;
  const c=w.add({points:[{x:-1,y:0,z:0},{x:1,y:0,z:0}],inverseMasses:[1,1],gravity:0,interCollision:true,worldCollision:false});
  const d=w.add({points:[{x:0,y:-1,z:0},{x:0,y:1,z:0}],inverseMasses:[1,1],gravity:0,interCollision:true,worldCollision:false,mask:masked?0:1});
  w.advance(1/120,focus);closestSegments(...c.p,...d.p,hit);assert.ok(masked?hit.distance<1e-8:hit.distance>=.119);
}
// Self contacts exclude neighboring segments; a folded non-neighbor crossing
// is resolved without changing the pinned end or producing invalid positions.
const folded=new ChainDynamics();folded.useLod=false;
const fc=folded.add({points:[{x:-1,y:0,z:0},{x:1,y:0,z:0},{x:2,y:1,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0}],gravity:0,selfCollision:true,worldCollision:false});
folded.advance(1/120,focus);assert.ok(folded.metrics.contacts>0);near(fc.p[0],-1);assert.ok(fc.p.every(Number.isFinite));
folded.remove(fc.id);folded.advance(1/60,focus);assert.equal(folded.segments.length,0,'unloaded chains leave no pair records');
const terrain=chainWorld({worldCollision:true});terrain.w.terrainHeight=()=>1.2;
for(let i=0;i<60;i++)terrain.w.advance(1/60,focus);assert.ok(terrain.c.p[16]>=1.26-1e-8,'vertical terrain support adapter');
console.log('Physics: spatial index, SDFs, segment contacts, CCD, 4 solvers, masses, compliance, fixed time, lifecycle, sleep/LOD, curves and masks passed.');
