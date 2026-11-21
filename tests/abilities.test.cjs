const assert=require('node:assert/strict');
const {AbilityManager}=require('../.test-build/domain/abilities/AbilityManager.js');
const {AbilityConditions}=require('../.test-build/domain/abilities/conditions.js');
const {ABILITIES,ROOT_PROFILES}=require('../.test-build/domain/abilities/catalog.js');
const {AbilityTargets,ForestRootsBehavior,planRoots}=require('../.test-build/domain/abilities/forestRoots.js');
const {RootsSurfaceAdapter}=require('../.test-build/game/abilities/RootsSurfaceAdapter.js');
const {RootsCameraShake,sampleRootsShake}=require('../.test-build/game/abilities/RootsCameraShake.js');
const {sampleRootLean}=require('../.test-build/domain/abilities/rootLean.js');
const {normalizeAbilityProgress}=require('../.test-build/domain/abilities/progress.js');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {LocalStorageSaveRepository}=require('../.test-build/persistence/SaveRepository.js');
let cases=0;
function test(name,run){run();cases++;console.log('OK',name);}
const root=ABILITIES.find(a=>a.id==='forest_roots');
function harness(definition=root){
  const ctx={unlocked:['forest_roots'],equipment:'sword',swordLevel:1,levels:{},playerState:'grounded',
    position:{x:0,y:2,z:0},scope:'test',blocked:null,actionBusy:false,facts:{}};
  const events=[],hits=[],targets=new AbilityTargets();let ready=true,credits=3,spent=0;
  const presentation={prepare(){},ready:()=>ready?{ok:true}:{ok:false,reason:'missing asset'},
    start(e){events.push(['start',e.id]);return true;},fx(e){events.push(['fx',e.id]);},
    update(){},end(e){events.push(['end',e.id]);},dispose(){events.push(['dispose']);}};
  const world={surface:(x,z)=>({x,y:2,z,normal:{x:0,y:1,z:0}}),clear:()=>true,baseDamage:()=>10};
  const manager=new AbilityManager([definition,...ABILITIES.filter(a=>a.id!==definition.id)],()=>ctx,presentation,
    {has:(_,amount)=>credits>=amount,spend:(_,amount)=>{if(credits<amount)return false;credits-=amount;spent++;return true;}},s=>events.push(['reason',s]));
  const behavior=new ForestRootsBehavior(world,targets);manager.register('forest_roots',behavior);
  targets.register({id:'one',position:{x:1,y:2,z:0},radius:.2,valid:()=>true,receive:h=>hits.push(h)});
  return {manager,ctx,events,hits,targets,world,presentation,behavior,setReady:v=>ready=v,spent:()=>spent};
}
test('unlock, equipped sword, current state and pending ultimate fail closed',()=>{
  const h=harness();h.ctx.unlocked=[];assert.equal(h.manager.request('forest_roots').ok,false);
  h.ctx.unlocked=['forest_roots'];h.ctx.equipment='unarmed';assert.equal(h.manager.request('forest_roots').ok,false);
  h.ctx.equipment='sword';h.ctx.playerState='swimming';assert.equal(h.manager.request('forest_roots').ok,false);
  h.ctx.unlocked.push('forest_ultimate');assert.equal(h.manager.request('forest_ultimate').ok,false);
  assert.equal(h.manager.status('forest_ultimate').implementation,'pending');
});
test('composed all/any, custom evaluators, empty groups and unknown rules',()=>{
  const h=harness(),rules=new AbilityConditions();rules.register('meter',(c,v)=>c.facts.meter>=v);
  const condition={all:[{rule:'equipment',value:'sword',reason:'sword'},
    {any:[{rule:'fact',value:'boss',reason:'boss'},{rule:'meter',value:100,reason:'meter'}]}]};
  assert.equal(rules.evaluate(condition,h.ctx).ok,false);h.ctx.facts.meter=100;
  assert.equal(rules.evaluate(condition,h.ctx).ok,true);
  for(const c of [null,{all:[]},{any:[]},{rule:'unknown',reason:'pending'}])assert.equal(rules.evaluate(c,h.ctx).ok,false);
});
for(let level=1;level<=4;level++)test(`level ${level} real profile, fixed origin, unique damage and recovery`,()=>{
  const h=harness();h.ctx.swordLevel=level;assert.equal(h.manager.request('forest_roots').ok,true);
  assert.equal(h.manager.request('forest_roots').ok,false);h.manager.update(.4);
  const e=h.manager.execution,p=ROOT_PROFILES[level-1];
  assert.equal(e.profile.radius,p.radius);assert.equal(e.plan.placements.length,p.roots);
  assert.ok(e.plan.placements.every(r=>Math.hypot(r.x,r.z)>1));
  h.ctx.position={x:100,y:2,z:100};h.ctx.swordLevel=1;
  assert.equal(e.plan.center.x,0);assert.equal(e.profile.damageMultiplier,p.damageMultiplier);
  h.manager.update(.34);assert.equal(h.hits.length,0);h.manager.update(.02);
  assert.equal(h.hits.length,1);assert.equal(h.hits[0].damage,10*p.damageMultiplier);
  h.behavior.impact(e,0);h.manager.update(.2);assert.equal(h.hits.length,1);
  h.manager.update(e.timeline.recovery-e.elapsed+.001);assert.equal(h.manager.execution.phase,'recovering');
  h.manager.update(.3);assert.equal(h.manager.controlLocked,false);
  assert.equal(h.manager.request('forest_roots').ok,false);h.manager.update(12);
  assert.equal(h.manager.request('forest_roots').ok,true);
});
test('request and commit revalidate equipment, state, unlock and assets',()=>{
  for(const change of [h=>h.ctx.equipment='unarmed',h=>h.ctx.playerState='airborne',
    h=>h.ctx.unlocked=[],h=>h.setReady(false)]){
    const h=harness();h.manager.request('forest_roots');change(h);h.manager.update(.4);
    assert.equal(h.manager.execution,null);assert.equal(h.hits.length,0);assert.equal(h.manager.status('forest_roots').cooldown,0);
  }
});
test('level at commitment is snapshotted, not the requested level',()=>{
  const h=harness();h.manager.request('forest_roots');h.ctx.swordLevel=4;h.manager.update(.4);
  assert.equal(h.manager.execution.profile.level,4);h.ctx.swordLevel=1;
  assert.equal(h.manager.execution.profile.level,4);assert.ok(Object.isFrozen(h.manager.execution.profile));
  assert.equal(h.manager.execution.profile.rings.length,4);
  assert.ok(Object.isFrozen(h.manager.execution.profile.rings[3]));
  assert.ok(Object.isFrozen(h.manager.execution.timeline.impacts));
  assert.ok(Math.abs(h.manager.execution.timeline.release-2.97)<1e-8);
});

test('levels add concentric rings with increasing size and staggered onset',()=>{
  let previous=[];
  for(const p of ROOT_PROFILES){
    const h=harness(),plan=planRoots(h.ctx,p,h.world);
    assert.equal(p.rings.length,p.level);
    assert.equal(plan.placements.length,[6,16,30,48][p.level-1]);
    assert.deepEqual(plan.placements.slice(0,previous.length).map(r=>[r.x,r.z]),previous.map(r=>[r.x,r.z]));
    for(let i=0;i<p.rings.length;i++){
      const ring=plan.placements.filter(r=>r.ring===i);
      assert.equal(ring.length,6+i*4);
      for(const r of ring){
        assert.ok(Math.abs(Math.hypot(r.x,r.z)-(3.4+2*i))<1e-8);
        assert.equal(r.delay,i*.24);assert.equal(r.scale,p.rootScale+i*.1);
      }
      if(i)assert.ok(ring[0].scale>plan.placements.find(r=>r.ring===i-1).scale);
    }
    if(previous.length)assert.ok(plan.placements[0].scale>previous[0].scale);
    previous=plan.placements;
  }
});
test('root tips lean in alternating directions with fixed ground anchors',()=>{
  const h=harness(),profile=ROOT_PROFILES[3],plan=planRoots(h.ctx,profile,h.world);
  for(let ring=0;ring<4;ring++){
    const p=plan.placements.find(p=>p.ring===ring),anchor={...p};
    const lean=sampleRootLean(p.lean,profile.emergence,profile);
    assert.equal(Math.sign(lean),ring%2===0?1:-1);assert.ok(Math.abs(Math.abs(lean)-22*Math.PI/180)<1e-8);
    assert.deepEqual(p,anchor);assert.ok(Object.isFrozen(p));
  }
});
test('tip inclination eases in, holds and relaxes during retraction',()=>{
  const p=ROOT_PROFILES[0],lean=p.rings[0].lean;
  assert.equal(sampleRootLean(lean,-1,p),0);assert.equal(sampleRootLean(lean,0,p),0);
  const half=sampleRootLean(lean,p.emergence/2,p);
  assert.ok(Math.abs(half-lean/2)<1e-8);
  assert.equal(sampleRootLean(lean,p.emergence+p.hold/2,p),lean);
  assert.ok(Math.abs(sampleRootLean(lean,p.emergence+p.hold+p.retraction/2,p)-half)<1e-8);
  assert.equal(sampleRootLean(lean,5,p),0);
});

function ringTargets(h){
  h.targets.clear();const hits=[];
  for(let i=0;i<4;i++)h.targets.register({id:`ring-${i}`,position:{x:3.4+2*i,y:2,z:0},radius:.1,
    valid:()=>true,receive:impact=>hits.push({target:i,index:impact.impactIndex})});
  h.targets.register({id:'boundary',position:{x:4,y:2,z:0},radius:.25,
    valid:()=>true,receive:impact=>hits.push({target:'boundary',index:impact.impactIndex})});
  return hits;
}
test('each wave damages its annulus at emergence, with one hit across overlapping rings',()=>{
  const h=harness();h.ctx.swordLevel=4;const hits=ringTargets(h);h.manager.request('forest_roots');
  const times=[.75,.99,1.23,1.47];
  for(let i=0;i<4;i++){
    h.manager.update(times[i]-.001-h.manager.execution.elapsed);
    assert.equal(hits.some(h=>h.target===i),false,'outer annulus hit too early');
    h.manager.update(.002);
    assert.deepEqual(hits.find(h=>h.target===i),{target:i,index:i});
  }
  assert.equal(hits.filter(h=>h.target==='boundary').length,1);
  h.manager.update(2);assert.equal(hits.length,5);assert.equal(h.manager.execution,null);
});
test('long steps deliver every ring once; cancelling stops rings that have not impacted',()=>{
  const h=harness();h.ctx.swordLevel=4;const hits=ringTargets(h);
  h.manager.request('forest_roots');h.manager.update(4);
  assert.equal(hits.length,5);assert.equal(h.manager.execution,null);
  const c=harness();c.ctx.swordLevel=4;const cancelled=ringTargets(c);
  c.manager.request('forest_roots');c.manager.update(.8);c.manager.cancel();c.manager.update(4);
  assert.deepEqual(cancelled.map(h=>h.target),[0,'boundary']);
});
test('a profile can extend recovery without replacing the base impact markers',()=>{
  const profiles=root.profiles.map(({rings,timeline,...p})=>({...p,timeline:{recovery:2.5,release:2.7}}));
  const h=harness({...root,profiles});h.manager.request('forest_roots');h.manager.update(.8);
  assert.equal(h.hits.length,1);assert.deepEqual(h.manager.execution.timeline.impacts,[.75]);
  h.manager.update(1.8);assert.equal(h.manager.execution.phase,'recovering');
  h.manager.update(.2);assert.equal(h.manager.execution,null);
});
test('camera tremor pulses at every ring onset and settles between waves',()=>{
  let previousPeak=0;
  for(const p of ROOT_PROFILES){
    const h=harness();h.ctx.swordLevel=p.level;h.manager.request('forest_roots');h.manager.update(.4);
    const e=h.manager.execution,out={x:0,y:0};
    for(const ring of p.rings){
      e.elapsed=.4+ring.delay+.035;sampleRootsShake(e,out);
      assert.ok(Math.hypot(out.x,out.y)>.001&&Math.hypot(out.x,out.y)<=.16,'missing or excessive pulse');
      e.elapsed=.4+ring.delay+.21;sampleRootsShake(e,out);assert.deepEqual(out,{x:0,y:0});
    }
    e.elapsed=.435;sampleRootsShake(e,out);const peak=Math.hypot(out.x,out.y);
    assert.ok(peak>previousPeak);previousPeak=peak;
    e.elapsed=20;sampleRootsShake(e,out);assert.deepEqual(out,{x:0,y:0},'late impulses must not queue');
  }
});
test('camera tremor does not accumulate and restores offset on cancellation or camera change',()=>{
  const h=harness();h.ctx.swordLevel=4;h.manager.request('forest_roots');h.manager.update(.435);
  const e=h.manager.execution,shake=new RootsCameraShake(),camera={x:.12,y:-.06},other={x:0,y:0};
  const center={...e.plan.center};shake.apply(e,camera);const once={...camera};
  for(let i=0;i<1000;i++)shake.apply(e,camera);
  assert.ok(Math.abs(camera.x-once.x)<1e-9&&Math.abs(camera.y-once.y)<1e-9);
  shake.apply(e,other);assert.ok(Math.abs(camera.x-.12)<1e-9&&Math.abs(camera.y+.06)<1e-9);
  shake.clear();assert.ok(Math.hypot(other.x,other.y)<1e-9);
  assert.deepEqual(e.plan.center,center);
  e.plan={...e.plan,placements:[]};shake.apply(e,other);assert.deepEqual(other,{x:0,y:0});
});
test('cancel before and after commitment; paused simulation',()=>{
  const h=harness();h.manager.request('forest_roots');h.manager.update(.2);h.manager.cancel();
  assert.equal(h.manager.status('forest_roots').cooldown,0);
  h.manager.request('forest_roots');h.manager.update(.4);h.manager.update(100,true);
  assert.equal(h.manager.execution.elapsed,.4);assert.equal(h.manager.status('forest_roots').cooldown,12);
  h.manager.cancel();h.manager.update(1);assert.equal(h.hits.length,0);
  assert.equal(h.manager.status('forest_roots').cooldown,11);assert.equal(h.manager.controlLocked,false);
});
test('optional cost spent once at commitment; interruption policy has no refund',()=>{
  const h=harness({...root,cost:{resource:'charge',amount:1}});
  h.manager.request('forest_roots');h.manager.cancel();assert.equal(h.spent(),0);
  h.manager.request('forest_roots');h.manager.update(.4);h.manager.update(.2);h.manager.cancel();assert.equal(h.spent(),1);
  assert.ok(h.manager.status('forest_roots').cooldown>0);
});
test('missing resources/animation blocked; visual failure after commit does not suppress damage',()=>{
  const h=harness();h.setReady(false);assert.equal(h.manager.request('forest_roots').ok,false);
  h.setReady(true);h.presentation.fx=()=>{throw Error('visual failed');};
  h.manager.request('forest_roots');h.manager.update(.8);assert.equal(h.hits.length,1);
});
test('no surface rejects commitment without cost; obstacles and target validity respected',()=>{
  const h=harness();h.world.surface=()=>null;h.manager.request('forest_roots');h.manager.update(.4);
  assert.equal(h.manager.execution,null);assert.equal(h.manager.status('forest_roots').cooldown,0);
  const g=harness();g.targets.register({id:'invalid',position:{x:0,y:2,z:0},radius:1,valid:()=>false,receive:()=>assert.fail()});
  g.manager.request('forest_roots');g.manager.update(.4);g.world.clear=()=>false;g.manager.update(.4);
  assert.equal(g.hits.length,0);
});
test('instant markers fire once, explicit multi-hit markers may hit again',()=>{
  const h=harness({...root,activation:'instant',profiles:root.profiles.map(({rings,timeline,...p})=>p),
    timeline:{commit:0,fx:[0],impacts:[0,.1],recovery:.2,release:.3}});
  h.manager.request('forest_roots');h.manager.update(0);h.manager.update(0);
  assert.equal(h.events.filter(e=>e[0]==='fx').length,1);assert.equal(h.hits.length,1);
  h.manager.update(.2);assert.equal(h.hits.length,2);h.manager.update(.2);assert.equal(h.manager.execution,null);
});
test('toggle supports sustain, release on a second request and cleanup',()=>{
  const h=harness({...root,activation:'toggle'});h.manager.request('forest_roots');h.manager.update(3);
  assert.equal(h.manager.execution.phase,'active');assert.equal(h.manager.controlLocked,false);
  assert.equal(h.manager.request('forest_roots').ok,true);assert.equal(h.manager.execution,null);
});
test('scene transition/disposal cancels future damage and releases presentation',()=>{
  const h=harness();h.manager.request('forest_roots');h.manager.update(.4);h.ctx.scope='new';h.manager.update(.4);
  assert.equal(h.hits.length,0);assert.equal(h.manager.controlLocked,false);h.manager.dispose();
  assert.equal(h.manager.request('forest_roots').ok,false);assert.equal(h.events.filter(e=>e[0]==='dispose').length,1);
});
test('surface adapter transforms local/global coordinates and rejects water, void and buildings',()=>{
  let water=null,admitted=true,voidGround=false;
  const ground=(x,z)=>voidGround?null:{height:2+x*.1+z*.2,normalY:.97};
  const w={ground,waterLevel:()=>water,canMove:()=>true,headroom:()=>true,wall:()=>null};
  const a=new RootsSurfaceAdapter(()=>w,()=>({x:100,y:10,z:200}),()=>admitted,()=>10);
  const p=a.surface(102,203,13);assert.equal(p.y,12.8);assert.ok(p.normal.x<0&&p.normal.z<0&&p.normal.y>.9);
  water=3;assert.equal(a.surface(102,203,13),null);water=null;admitted=false;
  assert.equal(a.surface(102,203,13),null);admitted=true;voidGround=true;assert.equal(a.surface(102,203,13),null);
});
function slopeWorld(gradeX,gradeZ){
  const height=(x,z)=>2+x*gradeX+z*gradeZ;
  const normalY=1/Math.hypot(1,gradeX,gradeZ);
  const world={
    ground:(x,z,origin,max)=>{const y=height(x,z);return y<=origin+.001&&y>=origin-max-.001?{height:y,normalY}:null;},
    waterLevel:()=>null,headroom:()=>true,canMove:()=>true,
    // Horizontal terrain ray: reproduces the ground being mistaken for a wall uphill.
    wall:(x,y,z,dx,dz,reach)=>{
      const rise=dx*gradeX+dz*gradeZ;
      const distance=rise>0?(y-height(x,z))/rise:Infinity;
      return distance>=0&&distance<=reach?{distance,normalY,terrain:true}:null;
    }
  };
  return {world,height};
}
test('roots find the high side of a valid slope beyond the old 1.8m ceiling',()=>{
  const {world}=slopeWorld(.7,0);
  const a=new RootsSurfaceAdapter(()=>world,()=>({x:100,y:10,z:200}),()=>true,()=>10);
  const high=a.surface(104,200,12,4);
  assert.ok(high,'valid ground 2.8m uphill must be found');assert.equal(high.y,14.8);
  assert.equal(a.clear({x:100,y:12,z:200},high),true,'rising ground is not an intervening wall');
});
test('all four root rings retain uphill and downhill placements on rotated slopes',()=>{
  const ctx=harness().ctx;
  for(const [gx,gz] of [[.7,0],[-.7,0],[0,.7],[0,-.7],[.5,.5],[1,0],[.7,.7]]){
    const {world,height}=slopeWorld(gx,gz),a=new RootsSurfaceAdapter(()=>world,()=>({x:0,y:0,z:0}),()=>true,()=>10);
    const flat=new RootsSurfaceAdapter(()=>slopeWorld(0,0).world,()=>({x:0,y:0,z:0}),()=>true,()=>10);
    for(const p of ROOT_PROFILES){
      const plan=planRoots(ctx,p,a),reference=planRoots(ctx,p,flat);
      assert.equal(plan.placements.length,p.roots);
      assert.deepEqual(plan.placements.map(r=>[r.x,r.z]),reference.placements.map(r=>[r.x,r.z]),
        'a valid slope must not redistribute uphill roots to the low side');
      for(const r of plan.placements){
        assert.ok(Math.abs(r.y-height(r.x,r.z))<1e-8);
      }
      assert.ok(plan.placements.some(r=>r.y>2)&&plan.placements.some(r=>r.y<2));
    }
  }
});
test('slope following still rejects walls, water gaps and disconnected upper platforms',()=>{
  const {world}=slopeWorld(.7,0),a=new RootsSurfaceAdapter(()=>world,()=>({x:0,y:0,z:0}),()=>true,()=>10);
  const from={x:0,y:2,z:0},to={x:4,y:4.8,z:0};
  const terrainWall=world.wall;
  world.wall=(x,y,z,dx,dz,reach)=>x<2&&x+dx*reach>=2?{distance:(2-x)/dx,normalY:0}:terrainWall(x,y,z,dx,dz,reach);
  assert.equal(a.clear(from,to),false);world.wall=terrainWall;
  world.waterLevel=x=>x>1&&x<2?10:null;assert.equal(a.clear(from,to),false);world.waterLevel=()=>null;
  const ground=world.ground;
  world.ground=(x,z,origin,max)=>x>1&&x<2?null:ground(x,z,origin,max);
  assert.equal(a.clear(from,to),false);
  world.ground=(x,z,origin,max)=>{const y=x>=2?4.8:2;return y<=origin+.001&&y>=origin-max-.001?{height:y,normalY:1}:null;};
  assert.equal(a.clear(from,to),false);
  // An overhead platform must not be accepted by tracing the continuous floor below it.
  world.wall=()=>null;
  world.ground=(x,z,origin,max)=>{
    const y=(x>=2?[4.8,2]:[2]).find(y=>y<=origin+.001&&y>=origin-max-.001);
    return y===undefined?null:{height:y,normalY:1};
  };
  assert.equal(a.clear(from,to,true),false);
  assert.equal(a.clear(from,{...to,y:2},true),true);
});
test('old saves retain inventory, positions, structures and discoveries; fields sanitized',()=>{
  const old=newGame();old.inventory.sword=1;old.inventory.fireCrystal=2;
  old.discoveredPlaces=['hito-ecos','reino-igneo-cristal'];old.playerPosition={zone:'brisalia',x:30,z:50};
  old.structures=[{id:'old',type:'wall',zone:'brisalia',x:1,z:2,rotation:0}];
  old.abilities={unlocked:['unknown','forest_ultimate','forest_ultimate'],selected:'forest_ultimate',levels:{forest_roots:99,igneo_fire:-1}};
  global.localStorage={getItem:()=>JSON.stringify(old)};
  const loaded=new LocalStorageSaveRepository().load();
  assert.deepEqual(loaded.inventory,old.inventory);assert.deepEqual(loaded.playerPosition,old.playerPosition);
  assert.deepEqual(loaded.discoveredPlaces,old.discoveredPlaces);assert.equal(loaded.structures[0].id,'old');
  assert.deepEqual(loaded.abilities.unlocked,['forest_ultimate','forest_roots','igneo_fire']);
  assert.equal(loaded.abilities.selected,'forest_roots');assert.deepEqual(loaded.abilities.levels,{});
  assert.equal(normalizeAbilityProgress(null,newGame()).selected,null);
});
test('permanent knowledge, real fire source and idempotent reward do not save each frame',()=>{
  let data=newGame(),saves=0;data.inventory.sword=1;data.inventory.fireCrystal=5;
  const store=new GameStore({load:()=>data,save:s=>{data=s;saves++;},clear:()=>{data=newGame();}});
  assert.equal(store.hasFirePower,false);assert.equal(store.awakenFirePower(),true);assert.equal(store.awakenFirePower(),false);
  data.inventory.fireCrystal=0;assert.equal(store.hasFirePower,true);
  assert.equal(store.unlockAbility('forest_roots'),false);assert.equal(store.unlockAbility('albor_flight'),true);
  const count=saves;assert.equal(store.unlockAbility('albor_flight'),false);assert.equal(saves,count);
  assert.equal(store.selectAbility('albor_flight'),false);assert.equal(store.swordLevel,1);
});
console.log(`${cases} ability checks passed.`);
