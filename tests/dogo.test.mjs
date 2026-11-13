import assert from 'node:assert/strict';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { NullEngine,Scene,FreeCamera,Vector3 } from '@babylonjs/core';

const runtime=resolve('.test-build/dogo-runtime');mkdirSync(runtime,{recursive:true});
for(const name of ['DogoCatalog','DogoFollowController','GroundFootPlacement','DogoCompanion']){
  const source=readFileSync(`src/game/${name}.ts`,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replaceAll("from './GroundFootPlacement'","from './GroundFootPlacement.mjs'")
    .replaceAll("from './DogoCatalog'","from './DogoCatalog.mjs'")
    .replaceAll("from './DogoFollowController'","from './DogoFollowController.mjs'")
    .replaceAll("from '@babylonjs/loaders/glTF/2.0/glTFLoader'","from '@babylonjs/loaders/glTF/2.0/glTFLoader.js'")
    .replaceAll("import '@babylonjs/loaders/glTF'","import '@babylonjs/loaders/glTF/index.js'");
  writeFileSync(resolve(runtime,`${name}.mjs`),js);
}
const {DOGO,DOGO_NLA_ACTIONS}=await import(pathToFileURL(resolve(runtime,'DogoCatalog.mjs')));
const {DogoFollowController}=await import(pathToFileURL(resolve(runtime,'DogoFollowController.mjs')));
const {DogoCompanion}=await import(pathToFileURL(resolve(runtime,'DogoCompanion.mjs')));
const flat={ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?{height:0,normalY:1}:null,
  wall:()=>null,solidTop:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0};
const target={x:0,y:0,z:0,heading:0,supported:true,context:'mainland'};
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
const bytes=readFileSync('public/assets/characters/dogo/Dogo_Auralia.glb');
assert.equal(createHash('sha256').update(bytes).digest('hex'),'cdabbdbcfea9c9c7ca5f2eedfb74013b6a0b6926d22edd9815751d662cca7f5d');
const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
assert.deepEqual(gltf.animations.map(a=>a.name).sort(),[...DOGO_NLA_ACTIONS].sort());
const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('qa',new Vector3(0,3,-8),scene);
const dogo=new DogoCompanion(scene);
await dogo.load('data:application/octet-stream;base64,'+bytes.toString('base64'));
assert.equal(dogo.actions.size,22);
for(const [name,group] of dogo.actions){
  assert.ok(group.getLength()>0&&group.targetedAnimations.length>=91,name);
  assert.ok(group.targetedAnimations.some(t=>{
    const keys=t.animation.getKeys();return keys.some(k=>JSON.stringify(k.value)!==JSON.stringify(keys[0].value));
  }),`${name}: actual joint animation`);
}
const body=scene.getMeshByName('Dogo_primitive0');body.computeWorldMatrix(true);
assert.ok(Math.abs(body.getBoundingInfo().boundingBox.extendSizeWorld.y*2-DOGO.height)<.001);
const head=scene.getTransformNodeByName('MouthSocket');head.computeWorldMatrix(true);
assert.ok(head.absolutePosition.z>0,'faces +Z like the follower heading');
dogo.update(.033,target,flat,{x:0,z:0});scene.render();assert.equal(dogo.status.action,'Idle');
for(let i=0;i<40;i++){
  dogo.update(.033,{...target,z:15+i*.5},flat,{x:0,z:0});scene.render();
  assert.ok(dogo.status.activeClips.length<=3,'only Idle/Walk/Run locomotion layers');
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
// Sniff overlay lowers the muzzle and restores it without accumulating rotations.
const muzzleY=()=>{scene.transformNodes.forEach(n=>n.computeWorldMatrix(true));return head.absolutePosition.y;};
Object.assign(dogo.follow,{angularSpeed:0,sniffing:true});
const standingMuzzle=muzzleY();
for(let i=0;i<90;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.ok(muzzleY()<standingMuzzle-.3,'sniff lowers the muzzle');
Object.assign(dogo.follow,{sniffing:false});
for(let i=0;i<90;i++){dogo.update(.033,end,flat,{x:0,z:0});scene.render();}
assert.ok(Math.abs(muzzleY()-standingMuzzle)<.12,'sniff overlay cleanly releases the rig');
dogo.dispose();assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
scene.dispose();engine.dispose();
console.log('Dogo: 22 NLA, asset integrity, scale, blending, follow 30/60/144 Hz, obstacles, swimming, travel and disposal OK');
