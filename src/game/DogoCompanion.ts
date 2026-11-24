import { loadGpuAssetContainerAsync as LoadAssetContainerAsync } from '../world/GpuAssets';
import { AnimationGroup, AssetContainer, Scene, TransformNode } from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { DOGO, DOGO_CLIPS, DOGO_FOOT_CHAINS, type DogoActionName } from './DogoCatalog';
import { dogoSwimAnimations } from './DogoSwimAnimations';
import { DogoRunMotion } from './DogoRunMotion';
import { DogoPlayController } from './DogoPlayController';
import { DogoPlayMotion } from './DogoPlayMotion';
import { DogoFollowController, type DogoTarget } from './DogoFollowController';
import { GroundFootPlacement } from './GroundFootPlacement';
import type { TraversalWorld } from './CharacterTraversalController';

/** Refined rig; native gait/sniff clips, with compatible swimming cycles. */
export class DogoCompanion {
  readonly follow=new DogoFollowController();
  readonly play=new DogoPlayController();
  readonly actions=new Map<DogoActionName,AnimationGroup>();
  readonly root:TransformNode;
  isReady=false;
  failure:string|null=null;
  private asset:AssetContainer|null=null;
  private feet:GroundFootPlacement|null=null;
  private runMotion:DogoRunMotion|null=null;
  private playMotion:DogoPlayMotion|null=null;
  private contactRoot:TransformNode|null=null;
  private disposed=false;
  private active:DogoActionName='Idle';
  private weights=new Map<DogoActionName,number>();

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
      for(const group of asset.animationGroups)group.stop();
      for(const [name,clip] of Object.entries(DOGO_CLIPS)){
        // The export includes two bare action duplicates. Prefer each NLA
        // once, so duplicate tracks never fight over the same bones.
        const group=asset.animationGroups.find(g=>g.name===`[RA] A_metarig_${clip}`)??
          asset.animationGroups.find(g=>g.name===`A_metarig_${clip}`);
        if(group)this.actions.set(name as DogoActionName,group);
      }
      const missing=Object.keys(DOGO_CLIPS).filter(name=>!this.actions.has(name as DogoActionName));
      if(missing.length)throw new Error(`Dogo: faltan NLA ${missing.join(', ')}`);
      const model=asset.meshes.find(mesh=>mesh.name==='__root__');
      const body=asset.meshes.find(mesh=>mesh.skeleton&&mesh.getTotalVertices()>0);
      if(!model||!body)throw new Error('Dogo: falta la malla deformable');
      body.computeWorldMatrix(true);
      const bounds=body.getBoundingInfo().boundingBox;
      const height=bounds.maximumWorld.y-bounds.minimumWorld.y;
      // Preserve the loader's handedness conversion and all authored NLA tracks.
      model.scaling.scaleInPlace(DOGO.height/height);
      // The new metarig has 190 bones, beyond smaller uniform palettes.
      for(const skeleton of asset.skeletons)skeleton.useTextureToStoreBoneMatrices=true;
      for(const mesh of asset.meshes){mesh.isPickable=false;mesh.checkCollisions=false;}
      asset.addAllToScene();
      this.contactRoot=new TransformNode('dogo-foot-support',this.scene);
      this.contactRoot.parent=this.root;model.parent=this.contactRoot;
      const missingBones=DOGO_FOOT_CHAINS.flat().filter(name=>!asset.transformNodes.some(n=>n.name===name));
      if(missingBones.length)throw new Error(`Dogo: faltan apoyos ${missingBones.join(', ')}`);
      this.feet=new GroundFootPlacement(this.scene,this.root,this.contactRoot,asset.transformNodes,DOGO_FOOT_CHAINS,.32);
      this.runMotion=new DogoRunMotion(this.scene,asset.transformNodes,this.actions.get('Run')!);
      this.playMotion=new DogoPlayMotion(this.scene,this.root,asset.transformNodes,this.actions.get('Tail_Wag')!);
      for(const group of dogoSwimAnimations(this.scene,this.actions.get('Idle')!,this.actions.get('Dig')!)){
        this.actions.set(group.name as DogoActionName,group);asset.animationGroups.push(group);
      }
      this.isReady=true;
      this.animate(0,{Idle:1},1);
    }catch(error){this.failure=String(error);this.dispose();throw error;}
  }

  update(dt:number,target:DogoTarget,world:TraversalWorld,offset:{x:number;z:number}):void{
    if(!this.isReady)return;
    if(!this.play.update(dt,this.follow,target,world))this.follow.step(dt,target,world);
    const state=this.follow;
    this.root.setEnabled(state.visible);
    this.root.position.set(state.position.x+offset.x,state.position.y,state.position.z+offset.z);
    this.root.rotation.set(state.pitch,state.heading,state.roll);
    // Shorter stride at this scale: cadence follows actual travel, not the
    // player's input. The original NLA supplies the joint flexion and paw lift.
    const turning=Math.min(.85,state.angularSpeed/1.8);
    const wet=state.locomotion==='swim'||state.locomotion==='swimIdle';
    this.playMotion?.update(dt,this.play,target,world,offset);
    this.feet?.update(dt,state.visible&&!wet&&!this.playMotion?.rearing,world,offset);
    const desired:Partial<Record<DogoActionName,number>>={};
    if(wet)desired[state.locomotion==='swim'?'Swim_Forward':'Swim_Idle']=1;
    else if(this.playMotion?.rearing)desired.Idle=1;
    else if(this.play.mode==='chaseTail')desired.Trot=1;
    else if(this.play.mode==='retreat')desired.Walk_Back=1;
    else if(state.sniffing)desired.Sniff=1;
    else{
      const walk=Math.max(Math.min(1,state.speed/2),turning);
      const trot=Math.max(0,Math.min(1,(state.speed-3)/3));
      const run=Math.max(0,Math.min(1,(state.speed-8)/5));
      desired.Idle=1-walk;desired.Walk=walk*(1-trot);
      desired.Trot=walk*trot*(1-run);desired.Run=walk*trot*run;
    }
    // Even with no forward travel, a turn advances Walk underneath Idle so
    // planted paws take short steps instead of rotating as a rigid sculpture.
    const cadence=Math.max(state.gaitSpeed,turning*1.8)*(this.play.mode==='chaseTail'?1.6:1);
    this.animate(dt,desired,cadence);
    this.runMotion?.update(dt,state.visible&&!wet&&!state.sniffing?(this.weights.get('Run')??0):0);
  }

  private animate(dt:number,desired:Partial<Record<DogoActionName,number>>,cadence:number):void{
    const blend=dt===0?1:1-Math.exp(-dt*12);
    let largest=-1;
    for(const name of new Set([...this.weights.keys(),...Object.keys(desired) as DogoActionName[]])){
      const group=this.actions.get(name)!;
      const previous=this.weights.get(name)??0;
      const weight=previous+((desired[name]??0)-previous)*blend;
      if(weight<.004){group.stop();this.weights.delete(name);continue;}
      // A swimming dog keeps paddling briskly even while moving slowly.
      const pace=name==='Run'?cadence/7.8:name==='Trot'?cadence/5.2:name==='Walk'?cadence/1.9:name==='Walk_Back'?cadence/1.7:
        name==='Swim_Forward'?1+Math.min(.3,cadence/45):1;
      const speed=Math.max(.4,Math.min(2.6,pace));
      if(!group.isStarted)group.start(true,speed);
      group.speedRatio+=(speed-group.speedRatio)*(1-Math.exp(-dt*10));
      group.setWeightForAllAnimatables(weight);this.weights.set(name,weight);
      if(weight>largest){largest=weight;this.active=name;}
    }
  }

  get status(){return {...this.follow.status,ready:this.isReady,failure:this.failure,
    behavior:this.play.mode==='none'?this.follow.status.behavior:this.play.mode,play:this.play.status,playPose:this.playMotion?.status,
    action:this.active,footContact:this.feet?.status,animationWeights:Object.fromEntries(this.weights),sniffWeight:this.weights.get('Sniff')??0,
    registeredActions:[...this.actions.keys()],
    activeClips:[...this.actions.entries()].filter(([,a])=>a.isStarted).map(([name])=>name)};}

  dispose():void{
    this.disposed=true;this.isReady=false;
    this.feet?.dispose();this.feet=null;
    this.playMotion?.dispose();this.playMotion=null;
    this.runMotion?.dispose();this.runMotion=null;
    this.asset?.dispose();this.asset=null;this.actions.clear();
    this.root.dispose();this.weights.clear();
  }
}
