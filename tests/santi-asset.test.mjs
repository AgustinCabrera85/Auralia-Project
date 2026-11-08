import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { FreeCamera, NullEngine, Scene, LoadAssetContainerAsync, MorphTarget, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { SANTI_COMBAT, SANTI_EXPRESSIONS, SANTI_NLA_ACTIONS,
  availableCombatAttacks, combatInputForKey } from '../src/game/SantiCatalog.ts';
import { SpeedBlurEnvelope, SpeedMotionBlur } from '../src/game/SpeedMotionBlur.ts';

const bytes=readFileSync(new URL('../public/assets/characters/santi/Santi_NLA_SK_Opt.glb',import.meta.url));
assert.equal(bytes.toString('ascii',0,4),'glTF');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
assert.deepEqual(gltf.animations.map(action=>action.name).sort(),[...SANTI_NLA_ACTIONS].sort(),
  'every exported NLA action is registered');
assert.ok(!SANTI_COMBAT.attacks.includes(SANTI_COMBAT.sweep),
  'the sweep is exclusive to its dedicated button');
assert.deepEqual(availableCombatAttacks('unarmed'),SANTI_COMBAT.kicks,
  'bare hands use kick attacks');
assert.deepEqual(availableCombatAttacks('sword'),SANTI_COMBAT.swordAttacks,
  'sword attacks require the sword to be selected');
assert.deepEqual(availableCombatAttacks('pickaxe'),[],
  'tools do not expose sword attacks');
assert.equal(combatInputForKey('q','grounded',0),'attack');
assert.equal(combatInputForKey('q','airborne',1),'airKick',
  'Q after takeoff reaches the aerial kick instead of the grounded-only attack gate');
assert.equal(combatInputForKey('q','airborne',2),null,
  'Q cannot spend a third jump or restart the kick');
assert.equal(combatInputForKey('q','climbing',0),null);
assert.equal(combatInputForKey('f','airborne',1),null);
assert.equal(combatInputForKey('r','airborne',1),null);
const face=gltf.meshes.find(mesh=>mesh.name==='Santi_MeshData');
assert.ok(face);
for(const name of SANTI_EXPRESSIONS)
  assert.ok(face.extras.targetNames.includes(name),`facial expression ${name} exists`);

const engine=new NullEngine();
const scene=new Scene(engine);
scene.activeCamera=new FreeCamera('test-camera',new Vector3(0,2,-6),scene);
const blurEnvelope=new SpeedBlurEnvelope();
assert.equal(blurEnvelope.update(.016,false),0);
const sprintBlur=blurEnvelope.update(.12,true);
assert.ok(sprintBlur>0&&sprintBlur<.01,'double-Shift run gets only subtle blur');
blurEnvelope.triggerDoubleJump();
const jumpBlur=blurEnvelope.update(.016,false);
assert.ok(jumpBlur>.04,'double jump starts with a stronger blur impulse');
for(let i=0;i<25;i++)blurEnvelope.update(.016,false);
assert.ok(blurEnvelope.update(.016,false)<.001,
  'the jump blur and sprint blur both fade away');
const blurEffect=new SpeedMotionBlur(scene.activeCamera,engine);
blurEffect.triggerDoubleJump();blurEffect.update(.016,false);
assert.equal(blurEffect.active,true,'jump impulse attaches the postprocess');
for(let i=0;i<40;i++)blurEffect.update(.016,false);
assert.equal(blurEffect.active,false,'idle rendering detaches the postprocess');
blurEffect.dispose();
const url='data:application/octet-stream;base64,'+bytes.toString('base64');
const asset=await LoadAssetContainerAsync(url,scene);
assert.equal(asset.animationGroups.length,35);
assert.equal(asset.skeletons.length,1);
const body=asset.meshes.find(mesh=>mesh.name==='Santi_Mesh_primitive0');
assert.ok(body);
body.computeWorldMatrix(true);
const box=body.getBoundingInfo().boundingBox;
const height=box.maximumWorld.y-box.minimumWorld.y;
assert.ok(height>.9&&height<1.1,'body scale is measured before fitting the player collider');
const targets=new Set(asset.meshes.flatMap(mesh=>{
  const manager=mesh.morphTargetManager;
  return manager?Array.from({length:manager.numTargets},(_,i)=>manager.getTarget(i).name):[];
}));
assert.ok(targets.size>=52,'expression, action unit and viseme shape keys load');
for(const group of asset.animationGroups){
  assert.ok(group.targetedAnimations.length>0,`${group.name} has keyframes`);
  assert.ok(group.targetedAnimations.some(track=>{
    if(track.target instanceof MorphTarget)return false;
    const keys=track.animation.getKeys();
    return keys.length>1&&keys.some(key=>JSON.stringify(key.value)!==JSON.stringify(keys[0].value));
  }),`${group.name} changes a skeletal joint instead of exporting the rest pose`);
  for(const track of group.targetedAnimations){
    if(!(track.target instanceof MorphTarget))continue;
    assert.ok(track.animation.getKeys().every(key=>key.value===0),
      `${group.name} has only neutral morph tracks`);
  }
}
const idle=asset.animationGroups.find(group=>group.name==='Idle (1)');
const smile=Array.from({length:body.morphTargetManager.numTargets},
  (_,i)=>body.morphTargetManager.getTarget(i))
  .find(target=>target.name==='SF_01_FELIZ_SonrisaNatural');
assert.ok(idle&&smile);
for(const track of [...idle.targetedAnimations])
  if(track.target instanceof MorphTarget)idle.removeTargetedAnimation(track.animation);
smile.influence=.4;
idle.start(true);scene.render();
assert.equal(smile.influence,.4,'a skeletal NLA action leaves the chosen expression intact');
idle.stop();
for(const name of ['Idle (1)','Walking (6)','Run','Jumping','Climbing']){
  const group=asset.animationGroups.find(group=>group.name===name);
  assert.ok(group);
  group.start(false);
  scene.render();
  group.stop();
}
asset.dispose();

// Load the actual controller with the same Babylon scene and bundled GLB.
// The temporary ESM copies are TypeScript transpilation only; no browser is needed.
const runtimeDir=resolve('.test-build');
mkdirSync(runtimeDir,{recursive:true});
const modules=['SantiCatalog','traversalRules','SantiCharacter','CharacterTraversalController'];
const runtimeFiles=modules.map(name=>resolve(runtimeDir,`santi-${name}.mjs`));
for(const [index,name] of modules.entries()){
  const source=readFileSync(new URL(`../src/game/${name}.ts`,import.meta.url),'utf8');
  const javascript=ts.transpileModule(source,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
  }}).outputText
    .replace("from './traversalRules'","from './santi-traversalRules.mjs'")
    .replace("from './SantiCatalog'","from './santi-SantiCatalog.mjs'");
  writeFileSync(runtimeFiles[index],javascript);
}
try{
  globalThis.window={location:{search:''}};
  const {SantiCharacter}=await import(pathToFileURL(runtimeFiles[2]).href);
  const {CharacterTraversalController}=await import(pathToFileURL(runtimeFiles[3]).href);
  const parent=new TransformNode('test-player',scene);
  const managersBeforeSanti=new Set(scene.morphTargetManagers);
  const santi=new SantiCharacter(scene,parent,url);
  assert.equal(await santi.load(),true);
  assert.equal(santi.actions.size,35);
  assert.ok(santi.shapeKeys.size>=52);
  const santiManagers=scene.morphTargetManagers.filter(manager=>!managersBeforeSanti.has(manager));
  assert.ok(santiManagers.length>0);
  assert.ok(santiManagers.every(manager=>manager.optimizeInfluencers&&manager.numMaxInfluencers===0),
    'character shaders process active facial weights instead of all exported targets');
  assert.ok(santiManagers.every(manager=>manager.numInfluencers<=1),
    'the default smile activates at most one target per mesh');
  assert.ok(santiManagers.every(manager=>!manager.useTextureToStoreTargets),
    'ordinary expressions do not allocate an atlas containing every facial target');
  const jumpSpin=scene.getAnimationGroupByName('Santi Air Kick');
  assert.ok(jumpSpin,'the Q air attack has its own aerial copy of the kick');
  const rootTrack=group=>group.targetedAnimations.find(track=>
    track.target.name==='mixamorig:Hips'&&track.animation.targetProperty==='position');
  const aerialRoot=rootTrack(jumpSpin).animation;
  const attackRoot=rootTrack(santi.actions.get('Inside Crescent Kick')).animation;
  assert.notEqual(aerialRoot,attackRoot);
  assert.ok(aerialRoot.getKeys().every(key=>
    key.value.equals(aerialRoot.getKeys()[0].value)),
    'the airborne kick cannot add horizontal or vertical root displacement');
  assert.ok(attackRoot.getKeys().some(key=>key.value.z!==attackRoot.getKeys()[0].value.z),
    'pinning the aerial clip preserves the ground attack crouch');
  const loadedBody=scene.getMeshByName('Santi_Mesh_primitive0');
  assert.ok(loadedBody);
  loadedBody.computeWorldMatrix(true);
  const fitted=loadedBody.getBoundingInfo().boundingBox;
  assert.ok(Math.abs(fitted.maximumWorld.y-fitted.minimumWorld.y-3.8)<.02,
    'Santi is fitted to the gameplay collider');
  santi.update(.016,{mode:'grounded',moving:true,run:false,backward:false,
    sprint:false,feetY:0,jumpStarted:false});
  assert.ok(santi.actions.get('Walking (6)').isPlaying);
  santi.update(.2,{mode:'grounded',moving:true,run:true,backward:false,
    sprint:false,feetY:0,jumpStarted:false});
  assert.ok(santi.actions.get('Run').isPlaying);
  assert.equal(santi.actions.get('Run').speedRatio,1);
  santi.update(.016,{mode:'grounded',moving:true,run:true,sprint:true,backward:false,
    feetY:0,jumpStarted:false});
  assert.ok(santi.actions.get('Run').isPlaying);
  assert.equal(santi.actions.get('Run').speedRatio,2,
    'double Shift plays the same running animation twice as fast');
  santi.update(.016,{mode:'grounded',moving:true,run:true,sprint:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.equal(santi.actions.get('Run').speedRatio,1,
    'releasing Shift restores normal animation speed');
  const runningJump=santi.actions.get('Running Jump');
  const fall=santi.actions.get('Falling Idle');
  const hipsTrack=runningJump.targetedAnimations.find(track=>
    track.target.name==='mixamorig:Hips'&&track.animation.targetProperty==='position');
  assert.ok(hipsTrack);
  assert.ok(hipsTrack.animation.getKeys().every(key=>
    JSON.stringify(key.value)===JSON.stringify(hipsTrack.animation.getKeys()[0].value)),
  'jump root motion stays with the physics controller');
  santi.update(.016,{mode:'airborne',moving:true,run:true,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  assert.ok(runningJump.isPlaying,'running jump starts at takeoff');
  santi.update(.6,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:2,jumpStarted:false});
  assert.ok(!fall.isPlaying,'normal running jump does not switch to falling');
  santi.update(.3,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:.1,jumpStarted:false});
  assert.ok(!fall.isPlaying,'descent to the takeoff level stays in the jump');
  santi.update(.016,{mode:'grounded',moving:true,run:true,backward:false,
    feetY:0,jumpStarted:false});
  assert.ok(!fall.isPlaying,'level landing blends back to locomotion');
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  const standingJump=santi.actions.get('Jumping');
  assert.ok(standingJump.isStarted&&!standingJump.isPlaying,
    'standing jump is sampled from physical time without looping');
  assert.ok(standingJump.animatables.every(animatable=>
    animatable.toFrame<standingJump.to*.6),
  'takeoff stops at the suspended pose before the landing frames');
  const takeoffFrame=standingJump.getCurrentFrame();
  santi.update(.2,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:1.7,jumpStarted:false});
  assert.ok(standingJump.getCurrentFrame()>takeoffFrame,
    'takeoff advances only once as Santi rises');
  santi.update(.25,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:2.2,jumpStarted:false});
  assert.ok(standingJump.isStarted&&!standingJump.isPlaying,
    'the suspended pose remains held by a paused animation');
  assert.ok(Math.abs(standingJump.getCurrentFrame()-standingJump.to*25/54)<1,
    'the paused animation remains on its airborne frame');
  santi.update(.35,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.4,jumpStarted:false});
  assert.ok(standingJump.isStarted&&!standingJump.isPlaying,
    'the suspended pose stays paused through physical descent');
  assert.ok(!fall.isPlaying,'standing jump keeps its suspended pose while descending');
  santi.update(.016,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.ok(standingJump.isPlaying,'standing jump recovery begins at physical landing');
  assert.ok(standingJump.speedRatio>1,'landing recovery has its own timing');
  assert.ok(standingJump.animatables.every(animatable=>
    animatable.fromFrame>standingJump.to*.6),
  'landing starts at the contact pose after the suspended frames');
  assert.ok(Math.abs(standingJump.getCurrentFrame()-standingJump.to*35/54)<1,
    'landing applies the contact pose on the first grounded frame');
  santi.update(.6,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.ok(santi.actions.get('Idle (1)').isPlaying,'idle resumes after landing recovery');
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  santi.update(.45,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:2.2,jumpStarted:false});
  const firstJumpHover=standingJump.getCurrentFrame();
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:2.3,doubleJumpStarted:true,jumpStarted:false});
  assert.ok(!jumpSpin.isStarted,'stationary double Space must never select the Q air attack');
  assert.ok(standingJump.isStarted&&!standingJump.isPlaying,
    'stationary double jump samples Jumping from the second vertical impulse');
  assert.ok(standingJump.getCurrentFrame()<firstJumpHover,
    'the second jump restarts its takeoff instead of holding the first jump pose');
  assert.equal(santi.combatState,null,'the second jump does not start a grounded combo or movement lock');
  const secondTakeoffFrame=standingJump.getCurrentFrame();
  santi.update(.2,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:3.3,jumpStarted:false});
  assert.ok(standingJump.getCurrentFrame()>secondTakeoffFrame,'the second jump advances with physical time');
  santi.update(.4,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:3.8,jumpStarted:false});
  assert.ok(Math.abs(standingJump.getCurrentFrame()-firstJumpHover)<1,
    'the second jump holds the suspended pose until ground contact');
  santi.update(.016,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.ok(standingJump.isPlaying,'double jump also recovers on landing');
  santi.update(.6,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.2,jumpStarted:false,doubleJumpStarted:true,airKickStarted:true});
  const earlySpinLanding=santi.update(.016,{mode:'grounded',moving:false,run:false,
    backward:false,feetY:0,jumpStarted:false});
  assert.equal(earlySpinLanding?.kind,'standing',
    'early ground contact ends the airborne kick immediately');
  assert.equal(jumpSpin.isStarted,false);
  assert.ok(Math.abs(standingJump.getCurrentFrame()-standingJump.to*35/54)<1,
    'the aerial kick enters the landing contact pose, never its ground attack recovery');
  santi.update(.6,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  santi.update(.016,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  santi.update(.2,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:1.8,doubleJumpStarted:true,jumpStarted:false});
  assert.equal(jumpSpin.isStarted,false,'the directed double jump retains its travelling animation');
  const movingDoubleLanding=santi.update(.016,{mode:'grounded',moving:true,
    movementIntent:true,run:true,sprint:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.equal(movingDoubleLanding,null,
    'holding movement after a double jump skips the stationary landing hold');
  assert.ok(santi.actions.get('Run').isPlaying,
    'moving double jump blends directly into running');
  santi.update(.016,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  santi.update(.2,{mode:'airborne',moving:true,run:false,backward:false,
    feetY:1.8,doubleJumpStarted:true,jumpStarted:false});
  const walkingDoubleLanding=santi.update(.016,{mode:'grounded',moving:true,
    movementIntent:true,run:false,sprint:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.equal(walkingDoubleLanding,null);
  assert.ok(santi.actions.get('Walking (6)').isPlaying,
    'moving double jump can also blend directly into walking');
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:.1,takeoffY:0,jumpStarted:true});
  santi.update(.4,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:-1.6,jumpStarted:false});
  assert.ok(fall.isPlaying,'falling starts only after a significant lower drop');
  santi.update(.016,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:-1.6,jumpStarted:false});
  santi.update(.016,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:10,takeoffY:10,jumpStarted:false});
  santi.update(.3,{mode:'airborne',moving:false,run:false,backward:false,
    feetY:4,jumpStarted:false});
  santi.update(.016,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  const highFallRoll=santi.actions.get(SANTI_COMBAT.highFallRoll);
  assert.ok(highFallRoll.isPlaying,'a high drop automatically starts Falling To Roll');
  assert.ok(highFallRoll.animatables.every(animatable=>
    animatable.fromFrame>highFallRoll.to*.1),
  'high-fall roll begins at its ground-contact frames');
  assert.equal(santi.playAction('Kicking'),false,
    'the high-fall roll cannot be interrupted by another attack');
  santi.update(2,{mode:'grounded',moving:false,run:false,backward:false,
    feetY:0,jumpStarted:false});
  assert.equal(santi.setExpression('SF_06_EMOCION_Sorpresa',.6),true);
  scene.render();
  const surprise=santi.shapeKeys.get('SF_06_EMOCION_Sorpresa');
  assert.ok(surprise.every(target=>target.influence===.6),
    'skeletal locomotion leaves the facial expression intact');
  assert.equal(santi.setShapeKey('SF_01_FELIZ_SonrisaNatural',.3),true);
  assert.ok(santiManagers.some(manager=>manager.numInfluencers===2),
    'active-target optimization still supports blending multiple facial shapes');
  assert.ok(surprise.every(target=>target.influence===.6));
  assert.ok(santiManagers.every(manager=>!manager.useTextureToStoreTargets),
    'two active expressions fit the vertex-attribute budget');
  santi.setExpression(null);
  for(const name of SANTI_EXPRESSIONS.slice(0,5))santi.setShapeKey(name,.2);
  assert.ok(santiManagers.some(manager=>manager.useTextureToStoreTargets),
    'complex blends use texture storage instead of exceeding vertex attributes');
  for(const name of SANTI_EXPRESSIONS.slice(0,5))
    assert.ok(santi.shapeKeys.get(name).every(target=>target.influence===.2),
      'changing storage never truncates the requested facial blend');
  santi.setExpression('SF_06_EMOCION_Sorpresa',.6);
  assert.ok(santiManagers.every(manager=>!manager.useTextureToStoreTargets),
    'returning to one expression releases complex-blend texture storage');
  const grounded={mode:'grounded',moving:false,run:false,sprint:false,
    backward:false,feetY:0,jumpStarted:false,doubleJumpStarted:false};
  const settleCombat=()=>santi.update(5,grounded);
  const spinOrientation=scene.getTransformNodeByName('santi-spin-orientation');
  const hipsNode=scene.getTransformNodeByName('mixamorig:Hips');
  const kickFootNode=scene.getTransformNodeByName('mixamorig:RightFoot');
  const spinMotion={...grounded,mode:'airborne',feetY:2,movementIntent:true};
  const beginAirKick=()=>{
    settleCombat();
    santi.update(0,{...spinMotion,jumpStarted:true,takeoffY:0});
    santi.update(0,{...spinMotion,doubleJumpStarted:true,airKickStarted:true});
  };
  for(const heading of [0,Math.PI/2,-Math.PI+.2]){
    parent.rotation.y=heading;
    beginAirKick();
    // Sample the source's raised-foot contact frame through the real controller.
    const impactTime=.56*(.54-.4)/(.65-.4);
    for(let elapsed=0;elapsed<impactTime;){
      const dt=Math.min(1/60,impactTime-elapsed);
      santi.update(dt,spinMotion);scene.render();elapsed+=dt;
    }
    hipsNode.computeWorldMatrix(true);kickFootNode.computeWorldMatrix(true);
    const kick=kickFootNode.getAbsolutePosition().subtract(hipsNode.getAbsolutePosition());
    const forwardDot=(kick.x*Math.sin(heading)+kick.z*Math.cos(heading))/Math.hypot(kick.x,kick.z);
    assert.ok(forwardDot>.99,
      `the spinning kick impacts ahead of the player at heading ${heading}, dot=${forwardDot}`);
    assert.ok(spinOrientation.rotation.y<-Math.PI,
      'facing the impact forward follows the original turn instead of correcting in reverse');
  }
  parent.rotation.y=0;
  beginAirKick();
  let previousYaw=0,totalTurn=0;
  for(let elapsed=0;elapsed<.7;elapsed+=.02){
    santi.update(.02,spinMotion);
    const yaw=spinOrientation.rotation.y;
    let delta=yaw-previousYaw;
    while(delta>Math.PI)delta-=Math.PI*2;
    while(delta<-Math.PI)delta+=Math.PI*2;
    assert.ok(delta<=1e-6,'the extra turn never reverses, including its return to forward');
    totalTurn+=delta;previousYaw=yaw;
  }
  assert.ok(Math.abs(totalTurn+Math.PI*2)<1e-5,'the faster turn completes exactly one extra revolution');
  assert.equal(spinOrientation.rotation.y,0);
  beginAirKick();
  santi.update(.12,spinMotion);
  const earlyYaw=spinOrientation.rotation.y;
  santi.update(.016,grounded);
  assert.ok(spinOrientation.rotation.y<earlyYaw,
    'early touchdown finishes the rotation in the same direction');
  settleCombat();
  assert.equal(spinOrientation.rotation.y,0,'landing does not leave subsequent attacks turned sideways');
  // Full Space -> Space input path, including vertical movement reported by the
  // physics controller even though no horizontal movement key is held.
  for(const hz of [30,60,144]){
    settleCombat();
    const dt=1/hz,avatar=new CharacterTraversalController();avatar.teleport(0,0,0);
    const flat={ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?
      {height:0,normalY:1}:null,solidTop:()=>null,wall:()=>null,
      headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0};
    const frame=(key='')=>{
      const command=combatInputForKey(key,avatar.mode,avatar.jumpCount);
      const jumpPressed=key===' ',airKickPressed=command==='airKick';
      const beforeMode=avatar.mode,beforeJumps=avatar.jumpCount,beforeY=avatar.position.y;
      const moving=avatar.step(dt,{moveX:0,moveZ:0,forwardX:0,forwardZ:1,
        horizontal:0,vertical:0,run:false,sprint:false,jumpPressed,airKickPressed},flat);
      const doubleJumpStarted=(jumpPressed||airKickPressed)&&beforeJumps===1&&avatar.jumpCount===2;
      santi.update(dt,{...grounded,mode:avatar.mode,moving,movementIntent:false,
        feetY:avatar.position.y,takeoffY:beforeY,
        jumpStarted:beforeMode==='grounded'&&jumpPressed&&avatar.mode==='airborne',
        doubleJumpStarted,airKickStarted:doubleJumpStarted&&airKickPressed});
    };
    frame(' ');
    for(let elapsed=0;elapsed<.2;elapsed+=dt)frame();
    const beforeSecondJump=avatar.position.y;
    frame(' ');
    assert.equal(avatar.jumpCount,2);
    assert.ok(avatar.position.y>beforeSecondJump,'second Space gives a vertical impulse');
    assert.equal(avatar.airKickActive,false,'second Space does not enable attack physics');
    assert.ok(standingJump.isStarted&&!standingJump.isPlaying);
    for(let elapsed=0;avatar.mode==='airborne'&&elapsed<3;elapsed+=dt){
      assert.ok(!jumpSpin.isStarted,'double Space never plays the aerial kick');
      assert.equal(spinOrientation.rotation.y,0,'double Space does not rotate the character');
      assert.equal(avatar.position.x,0);assert.equal(avatar.position.z,0);
      frame();
    }
    assert.equal(avatar.mode,'grounded');
    assert.equal(avatar.jumpCount,0);
  }
  // Exercise the same Q command through physics and the real animation controller.
  for(const stationary of [false,true])for(const hz of [30,60,144]){
    settleCombat();
    const dt=1/hz;
    const avatar=new CharacterTraversalController();avatar.teleport(0,0,0);
    const flat={ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?
      {height:0,normalY:1}:null,solidTop:()=>null,wall:()=>null,
      headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0};
    const frame=(key='',moveX=0,moveZ=stationary?0:1)=>{
      const command=combatInputForKey(key,avatar.mode,avatar.jumpCount);
      const jumpPressed=key===' ',airKickPressed=command==='airKick';
      const beforeMode=avatar.mode,beforeJumps=avatar.jumpCount,beforeY=avatar.position.y;
      const moving=avatar.step(dt,{moveX,moveZ,forwardX:1,forwardZ:0,
        horizontal:0,vertical:stationary?0:1,run:!stationary,sprint:false,jumpPressed,airKickPressed},flat);
      const doubleJumpStarted=(jumpPressed||airKickPressed)&&beforeJumps===1&&avatar.jumpCount===2;
      santi.update(dt,{...grounded,mode:avatar.mode,moving,movementIntent:!stationary,run:!stationary,
        feetY:avatar.position.y,takeoffY:beforeY,
        jumpStarted:beforeMode==='grounded'&&jumpPressed&&avatar.mode==='airborne',
        doubleJumpStarted,airKickStarted:doubleJumpStarted&&airKickPressed});
    };
    frame(' ',stationary?0:1,0);
    for(let elapsed=0;elapsed<.12;elapsed+=dt)frame('',stationary?0:1,0);
    const beforeKick={...avatar.position};
    frame('q');
    assert.equal(avatar.jumpCount,2,'Space then Q spends the second jump');
    assert.ok(avatar.position.y>beforeKick.y,'Q applies the second vertical impulse');
    assert.equal(avatar.airKickActive,true);
    assert.ok(jumpSpin.isStarted&&!jumpSpin.isPlaying,
      'airborne Q starts the sampled spinning kick even with a direction held');
    assert.ok(jumpSpin.animatables.every(animatable=>
      animatable.fromFrame>=jumpSpin.to*.39&&animatable.toFrame<=jumpSpin.to*.66),
      'Q keeps only the airborne portion of the kick');
    assert.equal(santi.combatState,null,'airborne Q does not start a ground attack');
    const firstSpinFrame=jumpSpin.getCurrentFrame();
    for(let elapsed=dt;elapsed+dt<.55;elapsed+=dt){
      frame('q');
      assert.equal(avatar.jumpCount,2);
      assert.ok(Math.abs(avatar.position.x-beforeKick.x)<1e-6&&
        Math.abs(avatar.position.z-beforeKick.z)<1e-6,
        'the aerial kick stays in place despite previous running inertia and held steering');
    }
    assert.ok(jumpSpin.getCurrentFrame()>firstSpinFrame,
      'repeated Q presses do not rewind the aerial animation');
    for(let elapsed=0;avatar.mode==='airborne'&&elapsed<3;elapsed+=dt)frame('q');
    assert.equal(avatar.mode,'grounded','repeated Q cannot keep the character flying');
    assert.equal(avatar.airKickActive,false);
    assert.equal(avatar.jumpCount,0,'landing restores the second jump');
    assert.ok(santi.actions.get(stationary?'Jumping':'Run').isPlaying,
      'Q lands into recovery or held running according to movement input');
  }
  for(const hz of [30,60,144]){
    settleCombat();
    const dt=1/hz;
    const traversal=new CharacterTraversalController();
    traversal.teleport(0,0,0);
    const flat={ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?
      {height:0,normalY:1}:null,solidTop:()=>null,wall:()=>null,
      headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0};
    const move={moveX:1,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,
      vertical:1,run:true,sprint:false,jumpPressed:false};
    const tick=()=>{
      traversal.setAttackHold(santi.combatState?.remainingSeconds??0);
      const moving=traversal.step(dt,move,flat);
      santi.update(dt,{...grounded,moving,movementIntent:true,run:true});
    };
    assert.equal(santi.requestAttack('unarmed'),true);
    const first=santi.combatState;
    assert.ok(first.remainingSeconds<santi.actionDuration('Kicking'),
      'the combat clip has a brisker playback rate');
    assert.equal(santi.requestAttack('unarmed'),true,'Q during a strike queues the next hit');
    assert.equal(santi.requestAttack('unarmed'),false,'mashing cannot queue a whole combo');
    assert.equal(santi.playAction(SANTI_COMBAT.roll),false,
      'a queued combo cannot be interrupted by a roll');
    assert.equal(santi.playAction(SANTI_COMBAT.sweep),false,
      'the dedicated sweep cannot interrupt a strike');
    let firstElapsed=0;
    while(santi.combatState?.serial===first.serial&&firstElapsed<3){
      tick();firstElapsed+=dt;
    }
    assert.ok(firstElapsed>first.remainingSeconds*.7&&firstElapsed<first.remainingSeconds*.85,
      'the next hit waits for impact, then skips the first recovery');
    assert.ok(santi.actions.get('Inside Crescent Kick').isPlaying,
      'the buffered press links directly into the second kick');
    assert.equal(santi.actions.get('Idle (1)').isPlaying,false,
      'the combo never inserts an idle between hits');
    assert.equal(santi.actions.get('Run').isPlaying,false,
      'held movement cannot replace the combat animation');
    const second=santi.combatState;
    assert.equal(santi.requestAttack('unarmed'),true);
    for(let t=0;santi.combatState?.serial===second.serial&&t<3;t+=dt)tick();
    assert.ok(santi.actions.get('Kicking').isPlaying,'a third press reaches the finishing kick');
    assert.ok(santi.actions.get('Kicking').speedRatio>1.2);
    const finisher=santi.combatState;
    for(let t=0;santi.combatState&&t<3;t+=dt)tick();
    assert.equal(santi.combatState,null,'without another press the chain ends');
    assert.ok(Math.abs(traversal.position.x)<1e-6&&Math.abs(traversal.position.z)<1e-6,
      'all three kick animations remain planted even with movement held');
    tick();
    assert.ok(traversal.position.x>0,'movement resumes immediately after the final recovery');
    assert.ok(santi.actions.get('Run').isPlaying,'recovery blends back to the held run');
    assert.equal(santi.requestAttack('unarmed'),true);
    assert.ok(santi.actions.get('Kicking').isPlaying,'a later combo restarts from its first hit');
    assert.ok(santi.combatState.serial>finisher.serial);
  }
  settleCombat();
  // A buffered press on the finisher waits for its full recovery, then starts over.
  santi.requestAttack('unarmed');santi.requestAttack('unarmed');
  santi.update(santi.combatState.remainingSeconds*.8,grounded);
  santi.requestAttack('unarmed');
  santi.update(santi.combatState.remainingSeconds*.82,grounded);
  const finalHit=santi.combatState;
  santi.requestAttack('unarmed');
  santi.update(finalHit.remainingSeconds*.9,grounded);
  assert.equal(santi.combatState.serial,finalHit.serial,
    'a new combo cannot cancel the finisher recovery');
  santi.update(finalHit.remainingSeconds*.11,grounded);
  assert.notEqual(santi.combatState.serial,finalHit.serial);
  settleCombat();
  santi.requestAttack('unarmed');santi.requestAttack('unarmed');
  santi.prepareCombat('unarmed',false);
  settleCombat();
  assert.equal(santi.combatState,null,'opening a menu or losing focus clears the queued hit');
  assert.equal(santi.requestAttack('pickaxe'),false,'a selected tool cannot start a combat chain');
  assert.equal(santi.requestAttack('sword'),true);
  assert.ok(santi.actions.get('Two Hand Sword Combo').isPlaying);
  santi.requestAttack('sword');
  const swordStart=santi.combatState;
  santi.update(swordStart.remainingSeconds*.9,grounded);
  assert.ok(santi.actions.get('Great Sword High Spin Attack').isPlaying,
    'the selected sword links its combo into the spinning finisher');
  santi.requestAttack('sword');
  santi.prepareCombat('unarmed',true);
  santi.update(.2,grounded);
  assert.equal(santi.combatState,null,'unequipping the sword cancels active and queued sword attacks');
  assert.equal(santi.actions.get('Great Sword High Spin Attack').isPlaying,false);
  santi.requestAttack('unarmed');santi.requestAttack('unarmed');
  santi.update(.02,{...grounded,mode:'airborne',feetY:1,takeoffY:1});
  assert.equal(santi.combatState,null,'leaving the ground cancels the chain');
  settleCombat();
  for(const name of SANTI_COMBAT.attacks){
    assert.equal(santi.playAction(name),true);
    assert.ok(santi.actions.get(name).isPlaying,`${name} is available to gameplay`);
    assert.equal(santi.playAction(name),false,
      'a raw action cannot restart before its animation ends');
    santi.update(santi.actionDuration(name)+.02,grounded);
  }
  assert.equal(santi.playAction(SANTI_COMBAT.sweep),true);
  assert.equal(santi.playAction(SANTI_COMBAT.sweep),false,
    'sweep cannot restart before its animation ends');
  assert.equal(santi.playAction(SANTI_COMBAT.roll),false,
    'sweep cannot be interrupted by roll');
  assert.equal(santi.requestAttack('unarmed'),false,
    'a sweep cannot buffer an unrelated combat chain');
  santi.update(santi.actions.get(SANTI_COMBAT.sweep).getLength()+.02,
    {mode:'grounded',moving:false,run:false,backward:false,feetY:0,jumpStarted:false});
  assert.equal(santi.playAction(SANTI_COMBAT.roll),true);
  assert.equal(santi.playAction(SANTI_COMBAT.roll),false,
    'roll cannot restart before its animation ends');
  assert.equal(santi.playAction('Kicking'),false,
    'roll cannot be interrupted by an attack');
  assert.equal(santi.requestAttack('sword'),false,
    'a roll cannot buffer a sword combo');
  santi.update(santi.actions.get(SANTI_COMBAT.roll).getLength()+.02,
    {mode:'grounded',moving:false,run:false,backward:false,feetY:0,jumpStarted:false});
  assert.equal(santi.playAction(SANTI_COMBAT.sweep),true,
    'sweep is available again after roll finishes');
  for(const name of [...SANTI_COMBAT.kicks,SANTI_COMBAT.sweep,
    SANTI_COMBAT.roll,SANTI_COMBAT.highFallRoll]){
    const group=santi.actions.get(name);
    const track=group.targetedAnimations.find(entry=>
      entry.target.name==='mixamorig:Hips'&&entry.animation.targetProperty==='position');
    assert.ok(track);
    const first=track.animation.getKeys()[0].value;
    assert.ok(track.animation.getKeys().every(key=>
      key.value.x===first.x&&key.value.y===first.y),
    `${name} keeps the visual aligned with the player collider`);
  }
  santi.dispose();
  assert.equal(santi.isReady,false);
  assert.deepEqual(new Set(scene.morphTargetManagers),managersBeforeSanti,
    'disposing Santi releases all owned morph managers instead of retaining their buffers');
}finally{
  delete globalThis.window;
  for(const file of runtimeFiles)unlinkSync(file);
}
scene.dispose();engine.dispose();
console.log('Santi GLB: 35 NLA actions, skeleton, scale and facial shape keys: OK');
