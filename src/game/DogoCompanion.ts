import { AnimationGroup, AssetContainer, LoadAssetContainerAsync, Quaternion, Scene, TransformNode, type Observer } from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { DOGO, DOGO_LOCOMOTION, DOGO_NLA_ACTIONS, type DogoActionName } from './DogoCatalog';
import { DogoFollowController, type DogoTarget } from './DogoFollowController';
import { GroundFootPlacement } from './GroundFootPlacement';
import type { TraversalWorld } from './CharacterTraversalController';

/** One rig; weighted NLA locomotion and a small additive sniff pose. */
export class DogoCompanion {
  readonly follow=new DogoFollowController();
  readonly actions=new Map<DogoActionName,AnimationGroup>();
  readonly root:TransformNode;
  isReady=false;
  failure:string|null=null;
  private asset:AssetContainer|null=null;
  private feet:GroundFootPlacement|null=null;
  private contactRoot:TransformNode|null=null;
  private disposed=false;
  private active:DogoActionName='Idle';
  private weights=new Map<DogoActionName,number>();
  private sniffWeight=0;
  private time=0;
  private poseNodes:{node:TransformNode;base:Quaternion;applied:boolean}[]=[];
  private beforePose:Observer<Scene>|null=null;
  private afterPose:Observer<Scene>|null=null;

  constructor(private readonly scene:Scene){
    this.root=new TransformNode('dogo-companion',scene);
    this.root.setEnabled(false);
  }

  async load(url:string=DOGO.model):Promise<void>{
    const asset=await LoadAssetContainerAsync(url,this.scene,{
      pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}
    });
    if(this.disposed){asset.dispose();return;}
    this.asset=asset;
    try{
      for(const group of asset.animationGroups){group.stop();
        if(DOGO_NLA_ACTIONS.includes(group.name as DogoActionName))
          this.actions.set(group.name as DogoActionName,group);
      }
      const missing=DOGO_NLA_ACTIONS.filter(name=>!this.actions.has(name));
      if(missing.length)throw new Error(`Dogo: faltan NLA ${missing.join(', ')}`);
      const model=asset.meshes.find(mesh=>mesh.name==='__root__');
      const body=asset.meshes.find(mesh=>mesh.name==='Dogo_primitive0');
      if(!model||!body)throw new Error('Dogo: falta la malla deformable');
      body.computeWorldMatrix(true);
      const bounds=body.getBoundingInfo().boundingBox;
      const height=bounds.maximumWorld.y-bounds.minimumWorld.y;
      // Preserve the loader's handedness conversion and all authored NLA tracks.
      model.scaling.scaleInPlace(DOGO.height/height);
      for(const mesh of asset.meshes){mesh.isPickable=false;mesh.checkCollisions=false;}
      asset.addAllToScene();
      this.contactRoot=new TransformNode('dogo-foot-support',this.scene);
      this.contactRoot.parent=this.root;model.parent=this.contactRoot;
      this.feet=new GroundFootPlacement(this.scene,this.root,this.contactRoot,asset.transformNodes,
        [['front_upper.L','front_forearm.L','front_paw.L'],['front_upper.R','front_forearm.R','front_paw.R'],
         ['hind_thigh.L','hind_shin.L','hind_paw.L'],['hind_thigh.R','hind_shin.R','hind_paw.R']],.32);
      this.poseNodes=['neck','head'].map(name=>({node:asset.transformNodes.find(n=>n.name===name)!,base:Quaternion.Identity(),applied:false}));
      this.beforePose=this.scene.onBeforeAnimationsObservable.add(()=>this.restorePose());
      this.afterPose=this.scene.onAfterAnimationsObservable.add(()=>this.applySniff());
      this.isReady=true;
      this.animate(0,{Idle:1},1);
    }catch(error){this.failure=String(error);this.dispose();throw error;}
  }

  update(dt:number,target:DogoTarget,world:TraversalWorld,offset:{x:number;z:number}):void{
    if(!this.isReady)return;
    this.follow.step(dt,target,world);
    const state=this.follow;
    this.root.setEnabled(state.visible);
    this.root.position.set(state.position.x+offset.x,state.position.y,state.position.z+offset.z);
    this.root.rotation.set(state.pitch,state.heading,state.roll);
    // Shorter stride at this scale: cadence follows actual travel, not the
    // player's input. The original NLA supplies the joint flexion and paw lift.
    const turning=Math.min(.85,state.angularSpeed/1.8);
    const wet=state.locomotion==='swim'||state.locomotion==='swimIdle';
    this.feet?.update(dt,state.visible&&!wet,world,offset);
    const desired:Partial<Record<DogoActionName,number>>={};
    if(wet)desired[DOGO_LOCOMOTION[state.locomotion]]=1;
    else{
      const walk=Math.max(Math.min(1,state.speed/2),turning);
      const run=Math.max(0,Math.min(1,(state.speed-7)/6));
      desired.Idle=1-walk;desired.Walk=walk*(1-run);desired.Run=run;
    }
    // Even with no forward travel, a turn advances Walk underneath Idle so
    // planted paws take short steps instead of rotating as a rigid sculpture.
    const cadence=Math.max(state.gaitSpeed,turning*1.8);
    this.animate(dt,desired,cadence);
    this.time+=dt;
    this.sniffWeight+=((state.sniffing?1:0)-this.sniffWeight)*(1-Math.exp(-dt*6));
  }

  private animate(dt:number,desired:Partial<Record<DogoActionName,number>>,cadence:number):void{
    const blend=dt===0?1:1-Math.exp(-dt*12);
    let largest=-1;
    for(const name of new Set([...this.weights.keys(),...Object.keys(desired) as DogoActionName[]])){
      const group=this.actions.get(name)!;
      const previous=this.weights.get(name)??0;
      const weight=previous+((desired[name]??0)-previous)*blend;
      if(weight<.004){group.stop();this.weights.delete(name);continue;}
      const pace=name==='Run'?cadence/9:name==='Walk'?cadence/2.7:name==='Swim_Forward'?cadence/10:1;
      const speed=Math.max(.4,Math.min(2.6,pace));
      if(!group.isStarted)group.start(true,speed);
      group.speedRatio+=(speed-group.speedRatio)*(1-Math.exp(-dt*10));
      group.setWeightForAllAnimatables(weight);this.weights.set(name,weight);
      if(weight>largest){largest=weight;this.active=name;}
    }
  }

  private restorePose():void{
    for(const entry of this.poseNodes)if(entry.applied){
      entry.node.rotationQuaternion!.copyFrom(entry.base);entry.applied=false;
    }
  }

  private applySniff():void{
    if(this.sniffWeight<.001||!this.follow.visible)return;
    // Layer onto this frame's Idle pose; restore before the next mixer pass.
    // The head counter-rotates as the neck lowers, keeping the muzzle forward.
    for(const [i,entry] of this.poseNodes.entries()){
      const q=entry.node.rotationQuaternion;if(!q)continue;
      entry.base.copyFrom(q);entry.applied=true;
      const nod=Math.sin(this.time*7)*.035;
      q.multiplyInPlace(Quaternion.RotationYawPitchRoll(
        i===1?Math.sin(this.time*2.4)*.10*this.sniffWeight:0,
        (i===0?1.55+nod:-.35+nod)*this.sniffWeight,0));
    }
  }

  get status(){return {...this.follow.status,ready:this.isReady,failure:this.failure,
    action:this.active,footContact:this.feet?.status,animationWeights:Object.fromEntries(this.weights),sniffWeight:this.sniffWeight,
    registeredActions:[...this.actions.keys()],
    activeClips:[...this.actions.values()].filter(a=>a.isStarted).map(a=>a.name)};}

  dispose():void{
    this.disposed=true;this.isReady=false;
    this.scene.onBeforeAnimationsObservable.remove(this.beforePose);
    this.scene.onAfterAnimationsObservable.remove(this.afterPose);
    this.restorePose();this.poseNodes=[];
    this.feet?.dispose();this.feet=null;
    this.asset?.dispose();this.asset=null;this.actions.clear();
    this.root.dispose();this.weights.clear();
  }
}
