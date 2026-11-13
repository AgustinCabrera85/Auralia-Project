import {
  AnimationGroup, ImportMeshAsync, Mesh, MorphTarget, Quaternion, Scene, TransformNode, Vector3,
  type MorphTargetManager, type Observer
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import { TRAVERSAL, type LocomotionMode } from './traversalRules';
import { GroundFootPlacement } from './GroundFootPlacement';
import type { TraversalWorld } from './CharacterTraversalController';
import type { EquipmentId } from '../domain/types';
import {
  SANTI_COMBAT, SANTI_EXPRESSIONS, SANTI_LOCOMOTION, SANTI_NLA_ACTIONS,
  combatCombo, type SantiActionName, type SantiExpressionName
} from './SantiCatalog';

const MODEL_PATH='/assets/characters/santi/Santi_NLA_SK_Opt.glb';
const BLEND_SECONDS=.18;
const COMBAT_BLEND_SECONDS=.09;
const LEVEL_DROP_FOR_FALL=1.5;
const LEVEL_JUMP_APEX_SECONDS=TRAVERSAL.initialJumpSpeed/TRAVERSAL.gravity;
const LANDING_RECOVERY_SECONDS=.7;
const LANDING_APPROACH_METERS=1.3;
const HARD_LANDING_APPROACH=37/152;
const HARD_LANDING_CONTACT=45/152;
const FALL_ROLL_APPROACH=3/55;
const BLINK_KEYS=['SF_AU45_Blink_L','SF_AU45_Blink_R'] as const;
// Keep the eyelid targets in the shader from the first frame. A zero influence
// removes them from Babylon's active set and recompiles the whole body material.
const BLINK_IDLE_INFLUENCE=1e-6;
// The source Jumping clip crouches for frames 1-12; frame 25 is airborne.
const STANDING_JUMP_TAKEOFF=13/54;
const STANDING_JUMP_HOVER=25/54;
// Only the airborne kick: omit its ground wind-up and its ground recovery.
const SPIN_JUMP_FROM=.4;
const SPIN_JUMP_TO=.65;
const SPIN_JUMP_IMPACT=.54;
// At the raised kick's impact the source foot points 66 degrees left. Continue
// the source's negative yaw by 294 degrees, then complete that same full turn.
const SPIN_IMPACT_TURN=(66-360)*Math.PI/180;
const SPIN_FULL_TURN=-Math.PI*2;
const HIGH_FALL_ROLL_DROP=8;
const FALL_ROLL_CONTACT=9/55;
const IN_PLACE_ACTIONS=new Set<SantiActionName>([
  SANTI_LOCOMOTION.jump,SANTI_LOCOMOTION.runningJump,SANTI_LOCOMOTION.landing,
  ...SANTI_COMBAT.attacks,SANTI_COMBAT.sweep,SANTI_COMBAT.roll,
  SANTI_COMBAT.highFallRoll
]);
const LOCKED_ACTIONS=new Set<SantiActionName>([
  ...SANTI_COMBAT.attacks,SANTI_COMBAT.sweep,SANTI_COMBAT.roll,SANTI_COMBAT.highFallRoll
]);
const TRAVERSAL_LOOPS=new Set<SantiActionName>([
  SANTI_LOCOMOTION.swim,
  SANTI_LOCOMOTION.uphillWalk,SANTI_LOCOMOTION.uphillRun,SANTI_LOCOMOTION.climb,
  SANTI_LOCOMOTION.hanging,SANTI_LOCOMOTION.shimmyLeft,SANTI_LOCOMOTION.shimmyRight,
  SANTI_LOCOMOTION.mantle,'Climbing','Climbing To Top'
]);
const WALL_ACTIONS=new Set<SantiActionName>([
  SANTI_LOCOMOTION.climb,SANTI_LOCOMOTION.hanging,SANTI_LOCOMOTION.shimmyLeft,
  SANTI_LOCOMOTION.shimmyRight,SANTI_LOCOMOTION.mantle,'Climbing','Climbing To Top'
]);
type ClimbContact={pointX:number;pointY:number;pointZ:number;
  normalX:number;normalY:number;normalZ:number};

export type SantiMotion={
  mode:LocomotionMode;
  moving:boolean;
  movementIntent?:boolean;
  run:boolean;
  sprint:boolean;
  backward:boolean;
  groundGrade?:number;
  onStairs?:boolean;
  descending?:boolean;
  groundDistance?:number|null;
  climbVertical?:number;
  climbSide?:number;
  mantleProgress?:number;
  climbContact?:ClimbContact|null;
  feetY:number;
  takeoffY?:number;
  jumpStarted:boolean;
  doubleJumpStarted:boolean;
  airKickStarted?:boolean;
};
export type SantiLanding={kind:'standing'|'highFallRoll';duration:number};

/** Visual character only. WorldView keeps ownership of movement and collisions. */
export class SantiCharacter {
  readonly actions=new Map<SantiActionName,AnimationGroup>();
  readonly shapeKeys=new Map<string,MorphTarget[]>();
  private readonly morphBudgets=new Map<MorphTargetManager,number>();
  private loaded:Awaited<ReturnType<typeof ImportMeshAsync>>|null=null;
  private active:AnimationGroup|null=null;
  private fading:AnimationGroup|null=null;
  private blend=1;
  private blendSeconds=BLEND_SECONDS;
  private combat:{equipment:EquipmentId;step:number;elapsed:number;
    duration:number;queued:boolean;serial:number}|null=null;
  private combatSerial=0;
  private airborneStartY=0;
  private airbornePeakY=0;
  private jumpInProgress=false;
  private jumpWasRunning=false;
  private jumpWasSprinting=false;
  private jumpElapsed=0;
  private airKickInProgress=false;
  private airKickAnimation:AnimationGroup|null=null;
  private visualOrientation:TransformNode|null=null;
  private slopeOrientation:TransformNode|null=null;
  private groundIncline=0;
  private feet:GroundFootPlacement|null=null;
  private contactRoot:TransformNode|null=null;
  private landingApproach:'normal'|'highFall'|null=null;
  private climbContact:ClimbContact|null=null;
  private contactObserver:Observer<Scene>|null=null;
  private contactHands:TransformNode[]=[];
  private samplingSpin=false;
  private previousMode:LocomotionMode='grounded';
  private landingRecoverySeconds=0;
  private overrideSeconds=0;
  private actionLockSeconds=0;
  private debugPanel:HTMLDivElement|null=null;
  private disposed=false;
  private blinkTime=-(2.6+Math.random()*3.6);
  private blinkWeight=0;
  private repeatBlink=false;
  private readonly eyelidBase=new Map<string,number>();
  isReady=false;

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly modelPath=MODEL_PATH){}

  async load():Promise<boolean>{
    const result=await ImportMeshAsync(this.modelPath,this.scene,{
      pluginOptions:{gltf:{
        // Keep every facial target available, but only process nonzero weights.
        // The loader default pins all 52 targets into every character shader.
        useMaxMorphTargetInfluencers:false,
        animationStartMode:GLTFLoaderAnimationStartMode.NONE,
        onMeshLoaded:mesh=>{
          // Configure before the loader fills/unfreezes the targets, avoiding
          // a full atlas allocation even temporarily during initial loading.
          if(mesh.morphTargetManager)mesh.morphTargetManager.useTextureToStoreTargets=false;
        }
      }}
    });
    if(this.disposed){this.disposeResult(result);return false;}
    const root=result.meshes.find(mesh=>mesh.name==='__root__');
    const body=result.meshes.find(mesh=>mesh.name==='Santi_Mesh_primitive0');
    if(!root||!body){this.disposeResult(result);throw new Error('Santi GLB: root or body mesh missing');}
    body.computeWorldMatrix(true);
    const bounds=body.getBoundingInfo().boundingBox;
    const height=bounds.maximumWorld.y-bounds.minimumWorld.y;
    if(!Number.isFinite(height)||height<=0){
      this.disposeResult(result);throw new Error('Santi GLB: invalid visual height');
    }
    root.parent=this.parent;
    // Keep Babylon's handedness conversion (negative Z on __root__).
    root.scaling.scaleInPlace(TRAVERSAL.playerHeight/height);
    for(const mesh of result.meshes){
      mesh.isPickable=false;
      mesh.checkCollisions=false;
      const manager=mesh.morphTargetManager;
      if(!manager||!(mesh instanceof Mesh))continue;
      const channels=Number(manager.hasPositions)+Number(manager.hasNormals)+
        Number(manager.hasTangents)+Number(manager.hasUVs)+Number(manager.hasUV2s)+Number(manager.hasColors);
      const available=this.scene.getEngine().getCaps().maxVertexAttribs-mesh.getVerticesDataKinds().length;
      const budget=Math.max(0,Math.min(4,Math.floor(available/Math.max(1,channels))));
      this.morphBudgets.set(manager,Math.min(this.morphBudgets.get(manager)??budget,budget));
      for(let i=0;i<manager.numTargets;i++){
        const target=manager.getTarget(i);
        const list=this.shapeKeys.get(target.name)??[];
        list.push(target);this.shapeKeys.set(target.name,list);
      }
    }
    for(const name of BLINK_KEYS)for(const target of this.shapeKeys.get(name)??[])
      target.influence=BLINK_IDLE_INFLUENCE;
    this.syncMorphStorage();
    const groups=new Map(result.animationGroups.map(group=>[group.name,group]));
    const restHips=groups.get(SANTI_LOCOMOTION.idle)?.targetedAnimations.find(track=>
      track.target.name==='mixamorig:Hips'&&track.animation.targetProperty==='position')
      ?.animation.getKeys()[0]?.value as Vector3|undefined;
    // The glTF loader may auto-start its first group before returning it.
    for(const group of result.animationGroups)group.stop();
    for(const name of SANTI_NLA_ACTIONS){
      const group=groups.get(name);
      if(!group){this.disposeResult(result);throw new Error(`Santi GLB: missing NLA action ${name}`);}
      // Keep facial expressions independent of skeletal actions if a future
      // export includes morph-weight tracks.
      for(const track of [...group.targetedAnimations])
        if(track.target instanceof MorphTarget)
          group.removeTargetedAnimation(track.animation);
      if(IN_PLACE_ACTIONS.has(name)){
        // Physics owns jump displacement. Attacks and rolls keep their vertical
        // crouch, but cannot move the mesh away from the player collider.
        const isJump=name===SANTI_LOCOMOTION.jump||
          name===SANTI_LOCOMOTION.runningJump;
        for(const track of group.targetedAnimations){
          if(track.target.name!=='mixamorig:Hips'||
            track.animation.targetProperty!=='position')continue;
          const keys=track.animation.getKeys();
          if(!keys.length)continue;
          const origin=keys[0].value as Vector3;
          const anchor=name===SANTI_LOCOMOTION.landing?restHips??origin:origin;
          track.animation.setKeys(keys.map(key=>{
            const value=key.value as Vector3;
            return {...key,value:isJump?origin.clone():
              new Vector3(anchor.x,anchor.y,value.z)};
          }));
        }
      }
      if(TRAVERSAL_LOOPS.has(name)){
        for(const track of group.targetedAnimations){
          if(track.target.name!=='mixamorig:Hips'||track.animation.targetProperty!=='position')continue;
          const keys=track.animation.getKeys();
          if(keys.length<2)continue;
          const first=keys[0],last=keys[keys.length-1];
          const start=first.value as Vector3,end=last.value as Vector3;
          // Remove authored travel, retaining cyclic weight shifts. Physics
          // supplies ascent and shimmy, so NLA loops cannot drift or climb twice.
          track.animation.setKeys(keys.map(key=>{
            // These clips have non-linear root travel as well as net travel.
            // Lock the pelvis to one shared anchor: physics supplies the ascent,
            // while the skeletal poses supply all hand/leg movement.
            if(WALL_ACTIONS.has(name))return {...key,value:(restHips??start).clone()};
            const t=(key.frame-first.frame)/Math.max(.001,last.frame-first.frame);
            const value=(key.value as Vector3).subtract(end.subtract(start).scale(t));
            return {...key,value};
          }));
        }
      }
      if(name===SANTI_LOCOMOTION.climb){
        // This NLA was authored facing the opposite way. Correct its pelvis
        // yaw in source Z-up space so blends to hanging/shimmy face the wall.
        const turn=Quaternion.RotationAxis(new Vector3(0,0,1),Math.PI);
        for(const track of group.targetedAnimations){
          if(track.target.name==='mixamorig:Hips'&&track.animation.targetProperty==='rotationQuaternion')
            track.animation.setKeys(track.animation.getKeys().map(key=>
              ({...key,value:turn.multiply(key.value as Quaternion)})));
        }
      }
      this.actions.set(name,group);
    }
    // A separate clip keeps the ground attack's vertical crouch intact while
    // the airborne version leaves all displacement to the traversal physics.
    this.airKickAnimation=this.actions.get(SANTI_COMBAT.airKick)!
      .clone('Santi Air Kick',undefined,true,true);
    for(const track of this.airKickAnimation.targetedAnimations){
      if(track.target.name!=='mixamorig:Hips'||
        track.animation.targetProperty!=='position')continue;
      const keys=track.animation.getKeys();
      if(keys.length){
        const origin=keys[0].value as Vector3;
        track.animation.setKeys(keys.map(key=>({...key,value:origin.clone()})));
      }
    }
    this.visualOrientation=new TransformNode('santi-spin-orientation',this.scene);
    this.slopeOrientation=new TransformNode('santi-slope-orientation',this.scene);
    this.slopeOrientation.parent=this.parent;
    this.visualOrientation.parent=this.slopeOrientation;
    this.contactRoot=new TransformNode('santi-foot-support',this.scene);
    this.contactRoot.parent=this.visualOrientation;root.parent=this.contactRoot;
    this.feet=new GroundFootPlacement(this.scene,this.parent,this.contactRoot,result.transformNodes,
      [['mixamorig:LeftUpLeg','mixamorig:LeftLeg','mixamorig:LeftFoot',-1],
       ['mixamorig:RightUpLeg','mixamorig:RightLeg','mixamorig:RightFoot',1]],.55);
    this.contactHands=result.transformNodes.filter(node=>
      node.name==='mixamorig:LeftHand'||node.name==='mixamorig:RightHand');
    this.contactObserver=this.scene.onAfterAnimationsObservable.add(()=>this.alignClimbContact());
    this.loaded=result;
    this.isReady=true;
    this.setExpression('SF_01_FELIZ_SonrisaNatural',.22);
    this.transition(SANTI_LOCOMOTION.idle,true);
    if(new URLSearchParams(window.location.search).has('santiDebug'))this.createDebugPanel();
    return true;
  }

  updateGroundContact(dt:number,grounded:boolean,world:TraversalWorld,offset:{x:number;z:number}):void{
    this.feet?.update(dt,grounded&&!this.combat&&this.overrideSeconds<=0&&
      (this.actionLockSeconds<=0||this.landingRecoverySeconds>0),world,offset);
  }
  get footContact(){return this.feet?.status;}

  get actionNames():readonly SantiActionName[]{return SANTI_NLA_ACTIONS;}
  get expressionNames():readonly SantiExpressionName[]{return SANTI_EXPRESSIONS;}

  /** Align the supporting hand after animation sampling, without moving the
   * collider or allocating another skeleton/IK solver. The inward hand stays
   * just outside the wall while the other hand is free to reach. */
  private alignClimbContact():void{
    const node=this.slopeOrientation,wall=this.climbContact;
    if(!node||!wall||this.contactHands.length!==2)return;
    let distance=Infinity;
    for(const hand of this.contactHands){
      hand.computeWorldMatrix(true);
      const p=hand.getAbsolutePosition();
      distance=Math.min(distance,(p.x-wall.pointX)*wall.normalX+
        (p.y-wall.pointY)*wall.normalY+(p.z-wall.pointZ)*wall.normalZ);
    }
    const horizontal=Math.hypot(wall.normalX,wall.normalZ);
    if(horizontal>.5&&Number.isFinite(distance))
      node.position.z=Math.max(-1.3,Math.min(1.3,node.position.z+(distance-.12)/horizontal));
  }

  setShapeKey(name:string,influence:number):boolean{
    const targets=this.shapeKeys.get(name);
    if(!targets)return false;
    let value=Math.max(0,Math.min(1,influence));
    if(BLINK_KEYS.includes(name as typeof BLINK_KEYS[number])){
      this.eyelidBase.set(name,value);
      value=Math.max(value,this.blinkWeight,BLINK_IDLE_INFLUENCE);
    }
    for(const target of targets)target.influence=value;
    this.syncMorphStorage();
    return true;
  }

  /** Facial overlay: NLA groups keep sole ownership of skeletal movement. */
  private updateBlink(dt:number):void{
    // A suspended tab must not replay a queue of missed blinks on return.
    this.blinkTime+=Math.max(0,Math.min(dt,.1));
    if(this.blinkTime>=.24){
      const repeat=!this.repeatBlink&&Math.random()<.12;
      this.repeatBlink=repeat;
      this.blinkTime=repeat?-.16:-(2.6+Math.random()*3.6);
    }
    const t=this.blinkTime;
    const ramp=t<0?0:t<.075?t/.075:t<.105?1:1-(t-.105)/.135;
    const v=Math.max(0,Math.min(1,ramp)),weight=v*v*(3-2*v);
    if(weight===this.blinkWeight)return;
    this.blinkWeight=weight;
    for(const name of BLINK_KEYS)for(const target of this.shapeKeys.get(name)??[])
      target.influence=Math.max(this.eyelidBase.get(name)??0,weight,BLINK_IDLE_INFLUENCE);
    this.syncMorphStorage();
  }

  private syncMorphStorage():void{
    for(const [manager,budget] of this.morphBudgets){
      let active=0;
      for(let i=0;i<manager.numTargets;i++)
        if(manager.getTarget(i).influence!==0)active++;
      // The eyelids stay active so blinking never changes the storage mode.
      // Allocate the full floating-point target atlas only for complex blends
      // that exceed the available attributes; all authored shapes stay usable.
      manager.useTextureToStoreTargets=active>budget;
    }
  }

  setExpression(name:SantiExpressionName|null,influence=1):boolean{
    if(name&&!this.shapeKeys.has(name))return false;
    for(const expression of SANTI_EXPRESSIONS)this.setShapeKey(expression,0);
    if(name)this.setShapeKey(name,influence);
    return true;
  }

  /** Play any registered NLA action once; locomotion resumes when it ends. */
  playAction(name:SantiActionName,startFraction=0,force=false):boolean{
    if(this.actionLockSeconds>0&&!force)return false;
    if(!this.actions.has(name))return false;
    this.combat=null;
    return this.startAction(name,startFraction);
  }

  private startAction(name:SantiActionName,startFraction=0,endFraction=1,
    speed=1,blendSeconds=BLEND_SECONDS):boolean{
    const group=this.actions.get(name);
    if(!group)return false;
    const from=group.from+(group.to-group.from)*Math.max(0,Math.min(1,startFraction));
    const to=group.from+(group.to-group.from)*endFraction;
    this.overrideSeconds=group.getLength(from,to)/speed;
    this.actionLockSeconds=LOCKED_ACTIONS.has(name)?this.overrideSeconds:0;
    this.landingRecoverySeconds=0;
    if(this.active===group){group.stop();this.active=null;}
    this.transition(name,false,speed,from,to,blendSeconds);
    return true;
  }

  /** One deliberate press queues at most one following strike, never a whole chain. */
  requestAttack(equipment:EquipmentId):boolean{
    this.prepareCombat(equipment,true);
    if(this.combat){
      if(this.combat.queued)return false;
      this.combat.queued=true;
      return true;
    }
    if(this.actionLockSeconds>0||this.overrideSeconds>0||!this.isReady)return false;
    return this.startComboStep(equipment,0);
  }

  get combatState():{serial:number;remainingSeconds:number}|null{
    return this.combat?{serial:this.combat.serial,
      remainingSeconds:Math.max(0,this.combat.duration-this.combat.elapsed)}:null;
  }

  /** Equipment changes invalidate both the current weapon action and its queued hit. */
  prepareCombat(equipment:EquipmentId,enabled:boolean):void{
    if(this.combat&&this.combat.equipment!==equipment)this.cancelCombat();
    if(this.combat&&!enabled)this.combat.queued=false;
  }

  private cancelCombat():void{
    if(!this.combat)return;
    this.combat=null;
    this.overrideSeconds=0;
    this.actionLockSeconds=0;
  }

  private startComboStep(equipment:EquipmentId,step:number):boolean{
    const profile=combatCombo(equipment)[step];
    if(!profile||!this.startAction(profile.action,profile.from,profile.to,
      profile.speed,COMBAT_BLEND_SECONDS))return false;
    this.combat={equipment,step,elapsed:0,duration:this.overrideSeconds,
      queued:false,serial:++this.combatSerial};
    return true;
  }

  private advanceCombat(dt:number):void{
    const combat=this.combat;
    if(!combat)return;
    combat.elapsed+=dt;
    const steps=combatCombo(combat.equipment);
    const profile=steps[combat.step];
    if(combat.queued&&combat.elapsed>=combat.duration*profile.linkAt){
      // The last hit keeps its full recovery before a new combo can begin.
      this.startComboStep(combat.equipment,(combat.step+1)%steps.length);
    }else if(combat.elapsed>=combat.duration)this.cancelCombat();
  }

  actionDuration(name:SantiActionName,startFraction=0):number{
    const group=this.actions.get(name);
    if(!group)return 0;
    const from=group.from+(group.to-group.from)*Math.max(0,Math.min(1,startFraction));
    return group.getLength(from,group.to);
  }

  update(dt:number,motion:SantiMotion):SantiLanding|null{
    if(!this.isReady)return null;
    this.updateBlink(dt);
    this.samplingSpin=false;
    const grade=motion.mode==='grounded'&&motion.moving?Math.max(0,motion.groundGrade??0):0;
    this.groundIncline+=(Math.atan(grade)-this.groundIncline)*(1-Math.exp(-dt*12));
    this.climbContact=motion.mode==='climbing'?motion.climbContact??null:null;
    const lean=this.climbContact?Math.asin(Math.max(-.3,Math.min(.6,this.climbContact.normalY)))+.15:
      motion.mode==='grounded'&&motion.moving&&motion.sprint&&
      this.overrideSeconds===0?Math.min(.36,.07+this.groundIncline*.28):0;
    if(this.slopeOrientation)this.slopeOrientation.rotation.x+=
      (lean-this.slopeOrientation.rotation.x)*(1-Math.exp(-dt*14));
    if(this.slopeOrientation&&!this.climbContact)
      this.slopeOrientation.position.z*=Math.exp(-dt*18);
    if(motion.mode!=='grounded')this.cancelCombat();
    if(motion.mode==='swimming'){
      this.overrideSeconds=0;this.actionLockSeconds=0;this.landingRecoverySeconds=0;
    }
    let landing:SantiLanding|null=null;
    const landed=this.previousMode==='airborne'&&motion.mode==='grounded';
    const highFallLanding=landed&&
      this.airbornePeakY-motion.feetY>=HIGH_FALL_ROLL_DROP;
    const landedJump=landed&&this.jumpInProgress;
    if(motion.mode==='airborne'){
      if(this.previousMode!=='airborne'){
        this.airborneStartY=motion.takeoffY??motion.feetY;
        this.airbornePeakY=Math.max(this.airborneStartY,motion.feetY);
        this.jumpInProgress=motion.jumpStarted;
        this.jumpWasRunning=motion.run;
        this.jumpWasSprinting=motion.sprint;
        this.jumpElapsed=0;
        this.airKickInProgress=false;
        this.landingRecoverySeconds=0;
        this.landingApproach=null;
      }
      if(motion.doubleJumpStarted){
        this.jumpInProgress=true;
        this.jumpWasRunning=false;
        this.jumpElapsed=0;
        // Only airborne Q selects the kick. A second Space uses Jumping even
        // without directional input; physics independently controls its impulse.
        this.airKickInProgress=motion.airKickStarted===true;
        this.landingApproach=null;
        this.airborneStartY=Math.min(this.airborneStartY,motion.feetY);
      }
      this.airbornePeakY=Math.max(this.airbornePeakY,motion.feetY);
      if(this.jumpInProgress&&!this.jumpWasRunning)this.jumpElapsed+=dt;
      this.seekLandingApproach(motion);
    }else{
      this.jumpInProgress=false;
      this.airKickInProgress=false;
      this.landingApproach=null;
      if(motion.mode!=='grounded')this.landingRecoverySeconds=0;
    }
    this.previousMode=motion.mode;
    if(highFallLanding){
      if(this.playAction(SANTI_COMBAT.highFallRoll,FALL_ROLL_CONTACT,true))
        landing={kind:'highFallRoll',duration:this.actionDuration(SANTI_COMBAT.highFallRoll,FALL_ROLL_CONTACT)};
    }else if(landedJump){
      if(!motion.movementIntent){
        this.startStandingLanding();
        landing={kind:'standing',duration:LANDING_RECOVERY_SECONDS};
      }
    }
    this.landingRecoverySeconds=Math.max(0,this.landingRecoverySeconds-dt);
    this.overrideSeconds=Math.max(0,this.overrideSeconds-dt);
    this.actionLockSeconds=Math.max(0,this.actionLockSeconds-dt);
    this.advanceCombat(dt);
    if(this.overrideSeconds===0&&this.landingRecoverySeconds===0&&
      !(motion.mode==='airborne'&&this.landingApproach)){
      if(motion.mode==='mantling'){
        const group=this.actions.get(SANTI_LOCOMOTION.mantle)!;
        if(this.active!==group)this.transition(SANTI_LOCOMOTION.mantle,false);
        group.goToFrame(group.from+(group.to-group.from)*Math.max(0,Math.min(1,motion.mantleProgress??0)),true);
        group.pause();
      }else if(motion.mode==='airborne'&&this.jumpInProgress&&!this.jumpWasRunning&&
        motion.feetY>=this.airborneStartY-LEVEL_DROP_FOR_FALL){
        if(!this.airKickInProgress||!this.seekAirKick())this.seekStandingJump();
      }else{
        let name:SantiActionName;
        let loop=true;
        let speed=1;
        if(motion.mode==='swimming'){
          name=SANTI_LOCOMOTION.swim;speed=motion.movementIntent?(motion.run?1.25:1):.45;
        }else if(motion.mode==='climbing'){
          const up=motion.climbVertical??(motion.moving?1:0),side=motion.climbSide??0;
          name=Math.abs(up)>.08?SANTI_LOCOMOTION.climb:
            side<-.08?SANTI_LOCOMOTION.shimmyLeft:
            side>.08?SANTI_LOCOMOTION.shimmyRight:SANTI_LOCOMOTION.hanging;
          if(name===SANTI_LOCOMOTION.climb)speed=up<0?-1:1;
        }else if(motion.mode==='airborne'){
          if(motion.feetY<this.airborneStartY-LEVEL_DROP_FOR_FALL){
            name=SANTI_LOCOMOTION.fall;
          }else if(this.jumpInProgress){
            name=SANTI_LOCOMOTION.runningJump;loop=false;
            const launchSpeed=this.jumpWasSprinting?TRAVERSAL.sprintJumpSpeed:
              this.jumpWasRunning?TRAVERSAL.runningJumpSpeed:TRAVERSAL.initialJumpSpeed;
            speed=this.actions.get(name)!.getLength()/
              (2*launchSpeed/TRAVERSAL.gravity);
          }else{
            // A shallow step off an edge should retain locomotion until landing.
            name=this.active?this.active.name as SantiActionName:SANTI_LOCOMOTION.idle;
          }
        }else if(motion.moving||landedJump&&motion.movementIntent){
          name=motion.onStairs?(motion.run?SANTI_LOCOMOTION.uphillRun:SANTI_LOCOMOTION.uphillWalk):
            motion.backward?SANTI_LOCOMOTION.backward:
              motion.run?SANTI_LOCOMOTION.run:SANTI_LOCOMOTION.walk;
          if(motion.run&&motion.sprint)speed=2;
        }else name=SANTI_LOCOMOTION.idle;
        this.transition(name,loop,speed);
      }
    }
    if(this.fading&&this.active){
      this.blend=Math.min(1,this.blend+dt/this.blendSeconds);
      this.active.setWeightForAllAnimatables(this.blend);
      this.fading.setWeightForAllAnimatables(1-this.blend);
      if(this.blend===1){this.fading.stop();this.fading=null;}
    }
    if(!this.samplingSpin&&this.visualOrientation){
      // An early touchdown also finishes in the authored turn direction. Zero
      // and -2π are the same orientation; never interpolate backward to zero.
      const yaw=this.visualOrientation.rotation.y;
      if(yaw!==0){
        const next=Math.max(SPIN_FULL_TURN,yaw-dt*Math.PI*2/.12);
        this.visualOrientation.rotation.y=next<=SPIN_FULL_TURN?0:next;
      }
    }
    return landing;
  }

  private seekLandingApproach(motion:SantiMotion):void{
    const distance=motion.groundDistance;
    if(!motion.descending||distance==null||!Number.isFinite(distance)||
      distance>LANDING_APPROACH_METERS||distance<0){
      this.landingApproach=null;
      return;
    }
    const drop=this.airbornePeakY-(motion.feetY-distance);
    if(!this.jumpInProgress&&drop<LEVEL_DROP_FOR_FALL)return;
    const kind=drop>=HIGH_FALL_ROLL_DROP?'highFall':'normal';
    const group=this.actions.get(kind==='highFall'?SANTI_COMBAT.highFallRoll:SANTI_LOCOMOTION.landing)!;
    const from=group.from+(group.to-group.from)*
      (kind==='highFall'?FALL_ROLL_APPROACH:HARD_LANDING_APPROACH);
    const contact=group.from+(group.to-group.from)*
      (kind==='highFall'?FALL_ROLL_CONTACT:HARD_LANDING_CONTACT);
    if(this.landingApproach!==kind)
      this.transitionGroup(group,false,1,from,contact,.12);
    this.landingApproach=kind;
    const progress=1-distance/LANDING_APPROACH_METERS;
    group.goToFrame(from+(contact-from)*progress,true);
    group.pause();
  }

  private seekStandingJump():void{
    const group=this.actions.get(SANTI_LOCOMOTION.jump)!;
    const from=group.from+(group.to-group.from)*STANDING_JUMP_TAKEOFF;
    const hover=group.from+(group.to-group.from)*STANDING_JUMP_HOVER;
    if(this.active!==group)this.transition(SANTI_LOCOMOTION.jump,false,1,from,hover);
    else if(!group.isStarted)group.start(false,1,from,hover);
    const progress=Math.min(1,this.jumpElapsed/LEVEL_JUMP_APEX_SECONDS);
    group.goToFrame(from+(hover-from)*progress,true);
    group.pause();
  }

  private seekAirKick():boolean{
    const group=this.airKickAnimation!;
    const from=group.from+(group.to-group.from)*SPIN_JUMP_FROM;
    const to=group.from+(group.to-group.from)*SPIN_JUMP_TO;
    const duration=TRAVERSAL.airKickSeconds;
    if(this.jumpElapsed>=duration)return false;
    this.samplingSpin=true;
    const progress=this.jumpElapsed/duration;
    const impact=(SPIN_JUMP_IMPACT-SPIN_JUMP_FROM)/(SPIN_JUMP_TO-SPIN_JUMP_FROM);
    const beforeImpact=progress<=impact;
    const t=beforeImpact?progress/impact:(progress-impact)/(1-impact);
    const eased=t*t*(3-2*t);
    this.visualOrientation!.rotation.y=beforeImpact?SPIN_IMPACT_TURN*eased:
      SPIN_IMPACT_TURN+(SPIN_FULL_TURN-SPIN_IMPACT_TURN)*eased;
    if(this.active!==group)this.transitionGroup(group,false,1,from,to,COMBAT_BLEND_SECONDS);
    else if(!group.isStarted)group.start(false,1,from,to);
    group.goToFrame(from+(to-from)*this.jumpElapsed/duration,true);
    group.pause();
    return true;
  }

  private startStandingLanding():void{
    const group=this.actions.get(SANTI_LOCOMOTION.landing)!;
    const from=group.from+(group.to-group.from)*HARD_LANDING_CONTACT;
    this.fading?.stop();this.fading=null;
    this.active?.stop();this.active=null;
    this.transition(SANTI_LOCOMOTION.landing,false,
      group.getLength(from,group.to)/LANDING_RECOVERY_SECONDS,from,group.to);
    group.goToFrame(from,true);
    this.landingRecoverySeconds=LANDING_RECOVERY_SECONDS;
    this.actionLockSeconds=LANDING_RECOVERY_SECONDS;
  }

  private transition(name:SantiActionName,loop:boolean,speed=1,
    from?:number,to?:number,blendSeconds=BLEND_SECONDS):void{
    const next=this.actions.get(name);
    if(!next)return;
    this.transitionGroup(next,loop,speed,from,to,blendSeconds);
  }

  private transitionGroup(next:AnimationGroup,loop:boolean,speed=1,
    from?:number,to?:number,blendSeconds=BLEND_SECONDS):void{
    if(this.active===next){
      next.speedRatio=speed;
      if(loop&&!next.isPlaying)next.start(true,speed);
      return;
    }
    this.fading?.stop();
    this.fading=this.active;
    this.active=next;
    this.blendSeconds=blendSeconds;
    next.start(loop,speed,from,to);
    if(this.fading){
      this.blend=0;
      next.setWeightForAllAnimatables(0);
      this.fading.setWeightForAllAnimatables(1);
    }else{
      this.blend=1;
      next.setWeightForAllAnimatables(1);
    }
  }

  private createDebugPanel():void{
    const panel=document.createElement('div');
    panel.style.cssText='position:fixed;right:12px;bottom:70px;z-index:1200;'+
      'background:#102334ed;color:#eef4ff;padding:10px;border-radius:8px;'+
      'font:12px system-ui;max-width:260px';
    const title=document.createElement('strong');
    title.textContent=`Santi · ${this.actions.size} NLA · ${this.shapeKeys.size} shape keys`;
    panel.append(title);
    const action=document.createElement('select');
    for(const name of SANTI_NLA_ACTIONS)action.add(new Option(name,name));
    action.style.cssText='display:block;width:100%;margin:8px 0 4px';
    panel.append(action);
    const play=document.createElement('button');
    play.textContent='Reproducir acción';
    play.onclick=()=>this.playAction(action.value as SantiActionName);
    panel.append(play);
    const expression=document.createElement('select');
    expression.add(new Option('Neutral',''));
    for(const name of SANTI_EXPRESSIONS)expression.add(new Option(name,name));
    expression.style.cssText='display:block;width:100%;margin:8px 0 4px';
    expression.value='SF_01_FELIZ_SonrisaNatural';
    expression.onchange=()=>this.setExpression(
      expression.value?expression.value as SantiExpressionName:null);
    panel.append(expression);
    document.body.append(panel);
    this.debugPanel=panel;
  }

  private disposeResult(result:Awaited<ReturnType<typeof ImportMeshAsync>>):void{
    const morphManagers=new Set(result.meshes.flatMap(mesh=>
      mesh.morphTargetManager?[mesh.morphTargetManager]:[]));
    for(const group of result.animationGroups)group.dispose();
    for(const skeleton of result.skeletons)skeleton.dispose();
    result.meshes.find(mesh=>mesh.name==='__root__')?.dispose(false,true);
    // Mesh disposal does not own these managers or their floating-point textures.
    for(const manager of morphManagers)manager.dispose();
  }

  dispose():void{
    this.disposed=true;
    this.combat=null;
    this.debugPanel?.remove();
    this.airKickAnimation?.dispose();this.airKickAnimation=null;
    this.scene.onAfterAnimationsObservable.remove(this.contactObserver);
    this.contactObserver=null;this.contactHands=[];this.climbContact=null;
    this.feet?.dispose();this.feet=null;
    if(this.loaded)this.disposeResult(this.loaded);
    this.visualOrientation?.dispose();this.visualOrientation=null;
    this.slopeOrientation?.dispose();this.slopeOrientation=null;
    this.loaded=null;
    this.actions.clear();this.shapeKeys.clear();
    this.morphBudgets.clear();
    this.isReady=false;
  }
}
