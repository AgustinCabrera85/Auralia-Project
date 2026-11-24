import assert from 'node:assert/strict';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { NullEngine,Scene,FreeCamera,Vector3 } from '@babylonjs/core';

const runtime=resolve('.test-build/dogo-runtime');mkdirSync(runtime,{recursive:true});
for(const [name,folder] of ['DogoCatalog','DogoFollowController','GroundFootPlacement','DogoSwimAnimations','DogoRunMotion','DogoPlayController','DogoPlayMotion','DogoCompanion'].map(n=>[n,'game']).concat([['GpuAssets','world'],['gpuAssetManifest','world']])){
  const source=readFileSync(`src/${folder}/${name}.ts`,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replaceAll("from './GroundFootPlacement'","from './GroundFootPlacement.mjs'")
    .replaceAll("from './DogoCatalog'","from './DogoCatalog.mjs'")
    .replaceAll("from './DogoFollowController'","from './DogoFollowController.mjs'")
    .replaceAll("from './DogoSwimAnimations'","from './DogoSwimAnimations.mjs'")
    .replaceAll("from './DogoRunMotion'","from './DogoRunMotion.mjs'")
    .replaceAll("from './DogoPlayController'","from './DogoPlayController.mjs'")
    .replaceAll("from './DogoPlayMotion'","from './DogoPlayMotion.mjs'")
    .replaceAll("from '../world/GpuAssets'","from './GpuAssets.mjs'")
    .replaceAll("from './gpuAssetManifest'","from './gpuAssetManifest.mjs'")
    .replaceAll("from '@babylonjs/loaders/glTF/2.0/glTFLoader'","from '@babylonjs/loaders/glTF/2.0/glTFLoader.js'")
    .replaceAll("import '@babylonjs/loaders/glTF'","import '@babylonjs/loaders/glTF/index.js'");
  writeFileSync(resolve(runtime,`${name}.mjs`),js);
}
const {DOGO,DOGO_CLIPS,DOGO_FOOT_CHAINS}=await import(pathToFileURL(resolve(runtime,'DogoCatalog.mjs')));
const {DogoFollowController}=await import(pathToFileURL(resolve(runtime,'DogoFollowController.mjs')));
const {DogoCompanion}=await import(pathToFileURL(resolve(runtime,'DogoCompanion.mjs')));
const {DogoPlayController}=await import(pathToFileURL(resolve(runtime,'DogoPlayController.mjs')));
const flat={ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?{height:0,normalY:1}:null,
  wall:()=>null,solidTop:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0};
const target={x:0,y:0,z:0,heading:0,supported:true,context:'mainland'};
for(const hz of [30,60,144]){
  const follow=new DogoFollowController(),play=new DogoPlayController(),seen=new Set();let chaseDistance=0;
  for(let i=0;i<hz*80;i++){
    const old={...follow.position};
    if(!play.update(1/hz,follow,target,flat))follow.step(1/hz,target,flat);
    seen.add(play.mode);
    if(play.mode==='chaseTail')chaseDistance+=Math.hypot(old.x-follow.position.x,old.z-follow.position.z);
    assert.ok(Math.hypot(follow.position.x,follow.position.z)<8,'play stays close to the player');
    if(play.mode==='greet')assert.ok(Math.abs(Math.hypot(follow.position.x,follow.position.z)-.95)<.06);
  }
  assert.ok(['approach','greet','retreat','chaseTail'].every(mode=>seen.has(mode)),`both spontaneous play routines at ${hz} Hz: ${[...seen]}`);
  assert.ok(chaseDistance>7,'chases its tail through complete circles');
  assert.equal(follow.recoveries,1,'playing never teleports the companion');
  Object.assign(play,{mode:'greet',elapsed:2});
  assert.equal(play.update(1/hz,follow,{...target,z:.5},flat),false,'player movement interrupts play');
  assert.equal(play.mode,'none');
}
for(const hz of [30,60,144]){
  const f=new DogoFollowController(),t={...target};f.step(1/hz,t,flat);
  assert.ok(f.visible);const initial={...f.position};
  for(let i=0;i<hz*2;i++)f.step(1/hz,t,flat);
  assert.deepEqual(f.position,initial,'idle companion does not circle the player');
  let moved=false;
  for(let i=0;i<hz*12;i++){t.z+=11/hz;f.step(1/hz,t,flat);moved||=f.speed>0;
    assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)>2,'no overlap with Santi');}
  assert.ok(moved);assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)<9);
  for(let i=0;i<hz*8;i++){t.z+=27/hz;f.step(1/hz,t,flat);}
  assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)<24,'catches up to sprint');
  for(let i=0;i<hz*6;i++)f.step(1/hz,t,flat);
  assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)<7.1);
  assert.equal(f.recoveries,1,'ordinary follow never teleports');
  t.x=500;t.z=500;f.step(1/hz,t,flat);
  assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)<6,'travel reunites safely');
}
// Turning the player changes a destination, never the dog's actual transform.
// Stopping releases the throttle and preserves a short, decelerating stride.
for(const hz of [30,60,144]){
  const dt=1/hz,f=new DogoFollowController(),t={...target};f.step(dt,t,flat);
  for(let i=0;i<hz*5;i++){t.z+=11*dt;f.step(dt,t,flat);}
  const speed=f.speed,before={...f.position};f.step(dt,t,flat);
  assert.ok(f.speed>0&&f.speed<speed,'first stopped frame still travels, but slows');
  let previous=f.speed;
  for(let i=0;i<hz;i++){
    f.step(dt,t,flat);
    assert.ok(f.speed<=previous+.001,'no stop/start oscillation while braking');previous=f.speed;
  }
  assert.equal(f.speed,0);
  assert.ok(Math.hypot(f.position.x-before.x,f.position.z-before.z)>.3,'finishes the braking stride');
  const resting={...f.position};
  for(let i=0;i<hz;i++){t.heading+=Math.PI*dt;f.step(dt,t,flat);}
  assert.deepEqual(f.position,resting,'stationary player rotation does not orbit or teleport Dogo');
  for(let i=0;i<hz*8;i++){
    t.heading=Math.PI;t.z-=11*dt;
    const p={...f.position},heading=f.heading;f.step(dt,t,flat);
    const turn=Math.abs(Math.atan2(Math.sin(f.heading-heading),Math.cos(f.heading-heading)));
    assert.ok(turn<=DOGO.turnRate*dt+1e-6,'bounded turn rate');
    assert.ok(Math.hypot(f.position.x-p.x,f.position.z-p.z)<=DOGO.catchupSpeed*dt+.001,'no position jumps');
  }
  assert.equal(f.recoveries,1);
  let sniffed=false,explored=false;
  for(let i=0;i<hz*25;i++){
    f.step(dt,t,flat);sniffed||=f.sniffing;explored||=f.status.behavior==='curious';
    assert.ok(Math.hypot(t.x-f.position.x,t.z-f.position.z)<8.5,'idle investigations stay nearby');
  }
  assert.ok(sniffed&&explored,'alternates sniffing with nearby exploration');
  t.z+=dt*11;f.step(dt,t,flat);assert.equal(f.sniffing,false,'movement interrupts sniff');
}
// Ground inclination and cadence use real support heights, including cross slopes.
for(const hz of [30,60,144])for(const [sx,sz] of [[0,.7],[.4,0],[0,-.7]]){
  const slope={...flat,ground:(x,z,o,m)=>{
    const height=x*sx+z*sz;
    return height<=o+.001&&height>=o-m-.001?{height,normalY:1/Math.hypot(1,sx,sz)}:null;
  }};
  const dt=1/hz,f=new DogoFollowController(),t={...target};f.step(dt,t,slope);
  let maxGait=0;
  for(let i=0;i<hz*8;i++){
    t.z+=4*dt;t.y=t.z*sz;const pitch=f.pitch,roll=f.roll;f.step(dt,t,slope);
    assert.ok(Math.abs(f.pitch-pitch)<=1.8*dt+1e-6);
    assert.ok(Math.abs(f.roll-roll)<=1.4*dt+1e-6);
    assert.ok(Math.abs(f.position.y-(f.position.x*sx+f.position.z*sz))<.001,'feet stay on authoritative slope');
    maxGait=Math.max(maxGait,f.gaitSpeed);
  }
  assert.ok(maxGait>1&&Math.hypot(t.x-f.position.x,t.z-f.position.z)<12,'walks up/down slope');
  assert.ok(Math.abs(f.pitch)> .3||Math.abs(f.roll)>.2,'body actually inclines');
  assert.equal(f.recoveries,1);
}
// A thin wall cannot be crossed, even at catch-up speed and low FPS.
{
  const f=new DogoFollowController();f.step(.033,target,flat);
  const wall={...flat,canMove:(x,z,fx,fz)=>fz<5?z<5:z>=5};
  for(let i=0;i<180;i++)f.step(.033,{...target,z:30},wall);
  assert.ok(f.position.z<5);assert.equal(f.locomotion,'idle');
  const before={...f.position};
  const cliff={...flat,ground:(x,z,o,m)=>z>before.z+.1?null:flat.ground(x,z,o,m)};
  f.step(.1,{...target,z:40},cliff);assert.ok(f.position.z<=before.z+.1);
}
{
  const f=new DogoFollowController();
  const lake={...flat,ground:(x,z,o,m)=>o>=-12&&o-m<=-12?{height:-12,normalY:1}:null,waterLevel:()=>0};
  const t={...target,y:-1.25,context:'lake'};f.step(.033,t,lake);
  assert.equal(f.locomotion,'swimIdle');assert.ok(Math.abs(f.position.y+DOGO.height*.56)<1e-6);
  t.z=30;for(let i=0;i<30;i++)f.step(.033,t,lake);
  assert.equal(f.locomotion,'swim');
  const bad={...flat,ground:()=>null};
  f.step(.033,{...target,context:'floating'},bad);
  assert.equal(f.visible,false,'no floating model over unloaded/absent support');
  f.step(.033,{...target,context:'floating'},flat);assert.equal(f.visible,true);
}
const bytes=readFileSync('public'+DOGO.model);
assert.equal(createHash('sha256').update(bytes).digest('hex'),DOGO.sha256);
const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
assert.equal(gltf.animations.length,36);
for(const clip of Object.values(DOGO_CLIPS))assert.ok(gltf.animations.some(a=>a.name===`[RA] A_metarig_${clip}`));
assert.equal(gltf.skins[0].joints.length,190);
const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('qa',new Vector3(0,3,-8),scene);
scene.useConstantAnimationDeltaTime=true;
const observerCounts=()=>[scene.onBeforeAnimationsObservable.observers.length,scene.onAfterAnimationsObservable.observers.length];
const initialObservers=observerCounts();
const dogo=new DogoCompanion(scene);
await dogo.load('data:application/octet-stream;base64,'+bytes.toString('base64'));
assert.equal(dogo.actions.size,36,'34 native actions plus two compatible swimming cycles');
assert.equal(new Set(dogo.actions.values()).size,dogo.actions.size,'duplicate export actions are not layered');
for(const [name,group] of dogo.actions){
  assert.ok(group.getLength()>0&&group.targetedAnimations.length===570,name);
  assert.ok(group.targetedAnimations.some(t=>{
    const keys=t.animation.getKeys();return keys.some(k=>JSON.stringify(k.value)!==JSON.stringify(keys[0].value));
  }),`${name}: actual joint animation`);
}
const body=scene.getMeshByName('Dogo_LP');body.computeWorldMatrix(true);
assert.ok(Math.abs(body.getBoundingInfo().boundingBox.extendSizeWorld.y*2-DOGO.height)<.001);
const head=scene.getTransformNodeByName('nose');head.computeWorldMatrix(true);
assert.ok(head.absolutePosition.z>0,'faces +Z like the follower heading');
dogo.update(.033,target,flat,{x:0,z:0});scene.render();assert.equal(dogo.status.action,'Idle');
for(let i=0;i<40;i++){
  dogo.update(.033,{...target,z:15+i*.5},flat,{x:0,z:0});scene.render();
  assert.ok(dogo.status.activeClips.length<=4,'only Idle/Walk/Trot/Run locomotion layers');
}
assert.equal(dogo.status.action,'Run');
const end={...target,x:dogo.follow.position.x,z:dogo.follow.position.z+2};
for(let i=0;i<75;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.deepEqual(dogo.status.activeClips,['Idle']);
// Rotating in place blends live Walk with Idle; no stiff yaw-only pose.
dogo.follow.step=()=>{};
Object.assign(dogo.follow,{speed:0,gaitSpeed:0,angularSpeed:1,locomotion:'idle',sniffing:false});
for(let i=0;i<30;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.ok(dogo.status.animationWeights.Idle>.2&&dogo.status.animationWeights.Walk>.4);
assert.ok(dogo.actions.get('Walk').isStarted&&dogo.actions.get('Walk').speedRatio>=.4);
assert.deepEqual(dogo.status.footContact.feet.map(f=>f.name),DOGO_FOOT_CHAINS.map(c=>c[2]));
// The native sniff lowers the muzzle and releases cleanly back to breathing.
const muzzleY=()=>{scene.transformNodes.forEach(n=>n.computeWorldMatrix(true));return head.absolutePosition.y;};
Object.assign(dogo.follow,{angularSpeed:0,sniffing:true});
const standingMuzzle=muzzleY();
let lowestMuzzle=Infinity;
for(let i=0;i<150;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();lowestMuzzle=Math.min(lowestMuzzle,muzzleY());}
assert.ok(lowestMuzzle<standingMuzzle-.5,'authored sniff lowers the muzzle');
assert.equal(dogo.actions.get('Sniff').name,'[RA] A_metarig_sniff_ground');
Object.assign(dogo.follow,{sniffing:false});
for(let i=0;i<90;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.ok(Math.abs(muzzleY()-standingMuzzle)<.12,'sniff overlay cleanly releases the rig');

// Water retains the same follower behavior and frees all ground constraints.
Object.assign(dogo.follow,{locomotion:'swim',speed:10,gaitSpeed:10});
for(let i=0;i<40;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.equal(dogo.status.action,'Swim_Forward');assert.equal(dogo.status.footContact.enabled,false);
assert.deepEqual(dogo.status.activeClips,['Swim_Forward']);
assert.ok(dogo.actions.get('Swim_Forward').getLength()<1&&dogo.actions.get('Swim_Forward').speedRatio>=1,'brisk paddling while advancing');
Object.assign(dogo.follow,{locomotion:'swimIdle',speed:0,gaitSpeed:0});
for(let i=0;i<40;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.deepEqual(dogo.status.activeClips,['Swim_Idle']);
assert.ok(dogo.actions.get('Swim_Idle').getLength()<1,'keeps paddling while floating');
for(const name of ['Swim_Forward','Swim_Idle'])for(const side of ['L','R']){
  const span=joint=>{
    const keys=dogo.actions.get(name).targetedAnimations.find(t=>t.target.name===joint&&t.animation.targetProperty==='rotationQuaternion').animation.getKeys();
    let max=0;
    for(const a of keys)for(const b of keys){
      const dot=Math.abs(a.value.x*b.value.x+a.value.y*b.value.y+a.value.z*b.value.z+a.value.w*b.value.w);
      max=Math.max(max,2*Math.acos(Math.min(1,dot)));
    }
    return max;
  };
  const wrist=span('front_foot.'+side),elbow=span('front_shin.'+side),upper=span('front_thigh.'+side);
  assert.ok(wrist>.5&&wrist<.8&&wrist>elbow*1.2,'wrist leads the paddling flexion within a bounded range');
  assert.ok(elbow>.3&&upper>.15&&upper<.3,'shoulder and elbow visibly accompany the wrist stroke');
}
for(const name of ['Swim_Forward','Swim_Idle'])for(const {animation} of dogo.actions.get(name).targetedAnimations){
 const keys=animation.getKeys();assert.deepEqual(keys[0].value,keys.at(-1).value,'paddling has no loop seam');
}
// Secondary running motion is additive, bounded, phase-locked and reversible.
Object.assign(dogo.follow,{locomotion:'run',speed:15,gaitSpeed:15,sniffing:false,angularSpeed:0});
for(let i=0;i<90;i++){dogo.update(1/60,end,flat,{x:0,z:0});scene.render();}
const run=dogo.actions.get('Run'),pelvis=scene.getTransformNodeByName('spine.004');
const tracked=['ear.L','ear.L.001','ear.R','ear.R.001','spine.006','spine.009','spine.010'].map(n=>scene.getTransformNodeByName(n));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)/(Math.hypot(a.x,a.y,a.z,a.w)*Math.hypot(b.x,b.y,b.z,b.w))));
const sampleBounce=phase=>{
  scene.onBeforeAnimationsObservable.notifyObservers(scene);run.goToFrame(run.from+(run.to-run.from)*phase);
  const native=tracked.map(n=>n.rotationQuaternion.clone()),position=pelvis.position.clone();
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  return {angles:tracked.map((n,i)=>angle(native[i],n.rotationQuaternion)),body:pelvis.position.subtract(position).length(),pose:tracked.map(n=>n.rotationQuaternion.clone())};
};
const samples=Array.from({length:16},(_,i)=>sampleBounce(i/16));
for(let i=0;i<tracked.length;i++){
  const peak=Math.max(...samples.map(s=>s.angles[i]));
  assert.ok(peak>.008&&peak<.09,`${tracked[i].name}: subtle visible secondary motion ${peak}`);
}
assert.ok(Math.max(...samples.map(s=>s.body))>.015&&samples.every(s=>s.body<.025),'bounded torso bounce');
const held=sampleBounce(.3);
for(let i=0;i<150;i++)sampleBounce(.3);
const repeated=sampleBounce(.3);
assert.ok(repeated.pose.every((q,i)=>angle(q,held.pose[i])<.0001),'secondary motion never accumulates pose drift');
Object.assign(dogo.follow,{locomotion:'idle',speed:0,gaitSpeed:0});
for(let i=0;i<120;i++){dogo.update(1/60,end,flat,{x:0,z:0});scene.render();}
scene.onBeforeAnimationsObservable.notifyObservers(scene);
const settled=tracked.map(n=>n.rotationQuaternion.clone()),settledBody=pelvis.position.clone();
scene.onAfterAnimationsObservable.notifyObservers(scene);
assert.ok(tracked.every((n,i)=>angle(n.rotationQuaternion,settled[i])<.0001)&&pelvis.position.equalsWithEpsilon(settledBody,1e-6),'bounce fully releases at rest');
dogo.dispose();assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(observerCounts(),initialObservers,'secondary motion and foot observers are removed');
scene.dispose();engine.dispose();
console.log('Dogo refined: 34 native actions, compatible swimming, asset integrity, scale, four paws, blending, follow 30/60/144 Hz, obstacles, travel and disposal OK');
