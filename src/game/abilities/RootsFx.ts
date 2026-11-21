import { ArcRotateCamera, AssetContainer, Color3, LoadAssetContainerAsync, MeshBuilder, Quaternion, Scene,
  StandardMaterial, TransformNode, Vector3, type AnimationGroup, type InstantiatedEntries } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import type { AbilityExecution, Decision } from '../../domain/abilities/types';
import { allowed, denied } from '../../domain/abilities/types';
import { MAX_ROOT_INSTANCES } from '../../domain/abilities/catalog';
import { RootsCameraShake } from './RootsCameraShake';
import { sampleRootLean } from '../../domain/abilities/rootLean';

export const ROOT_FILES=['Raiz_Astillada.glb','Raiz_Serpentina.glb','Raiz_Corona.glb'] as const;
const ROOT_UP=new Vector3(0,1,0);
type RootInstance={root:TransformNode;entries:InstantiatedEntries|null;group:AnimationGroup|null;
  normal:Vector3;axis:Vector3;tilt:Quaternion;yaw:Quaternion;lean:number};
/** Bounded scene cache, shared geometry/materials and independent morphs for each ring. */
export class RootsFx {
  private readonly containers:AssetContainer[]=[];
  private readonly pool:RootInstance[]=[];
  private readonly abort=new AbortController();
  private readonly shake=new RootsCameraShake();
  private state:'idle'|'loading'|'ready'|'failed'='idle';
  private disposed=false;
  private active=0;
  private diagnosticMaterial:StandardMaterial|null=null;
  failure='';
  constructor(private readonly scene:Scene,private readonly diagnostic=false){}
  prepare():void{
    if(this.state!=='idle'||this.disposed)return;
    this.state='loading';void this.load();
  }
  private async load():Promise<void>{
    try{
      for(const file of ROOT_FILES){
        const response=await fetch(`/assets/abilities/forest-roots/${file}`,{signal:this.abort.signal});
        if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(this.disposed)return;
        const container=await LoadAssetContainerAsync(bytes,this.scene,{pluginExtension:'.glb',name:file,
          pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}});
        if(this.disposed){container.dispose();return;}
        if(container.animationGroups.length!==1||!container.morphTargetManagers.some(m=>
          Array.from({length:m.numTargets},(_,i)=>m.getTarget(i).name).includes('Emerger'))){
          container.dispose();throw Error(`${file}: faltan clip o morph Emerger`);
        }
        container.animationGroups.forEach(g=>g.stop());this.containers.push(container);
      }
      this.state='ready';
    }catch(error){
      if(this.disposed)return;
      this.failure=String(error);this.state='failed';
      this.containers.splice(0).forEach(c=>c.dispose());
      console.warn('[Auralia raíces]',error);
    }
  }
  ready():Decision{
    if(this.disposed)return denied('Escena cerrada.');
    return this.state==='ready'||this.state==='failed'&&this.diagnostic?allowed:
      denied(this.state==='failed'?`FX de raíces no disponible: ${this.failure}`:'Cargando raíces…');
  }
  get diagnostics(){return {state:this.state,instances:this.pool.length,active:this.active,
    fallback:this.state==='failed'&&this.diagnostic,failure:this.failure};}
  start(e:AbilityExecution):void{
    this.clear();if(this.disposed||!e.plan)return;
    const count=Math.min(MAX_ROOT_INSTANCES,e.plan.placements.length);
    while(this.pool.length<count)this.pool.push(this.create(this.pool.length));
    this.active=count;
    for(let i=0;i<count;i++){
      const instance=this.pool[i],p=e.plan.placements[i];
      instance.root.position.set(p.x,p.y,p.z);
      instance.root.scaling.setAll(Math.max(.4,Math.min(1.25,p.scale??e.profile.rootScale)));
      instance.lean=NaN;
      instance.root.setEnabled(true);
      instance.group?.start(false,1);instance.group?.pause();
    }
    this.update(e);
  }
  private create(index:number):RootInstance{
    const root=new TransformNode(`ability-root-${index}`,this.scene);root.setEnabled(false);
    root.rotationQuaternion=Quaternion.Identity();
    const pose={normal:Vector3.Up(),axis:Vector3.Zero(),tilt:Quaternion.Identity(),yaw:Quaternion.Identity(),lean:NaN};
    const container=this.containers[index%3];
    if(!container){
      if(!this.diagnostic)throw Error('No hay modelo de raíces.');
      this.diagnosticMaterial??=new StandardMaterial('roots-DEVELOPMENT-ONLY',this.scene);
      this.diagnosticMaterial.diffuseColor=new Color3(1,0,1);this.diagnosticMaterial.wireframe=true;
      const cone=MeshBuilder.CreateCylinder('DIAGNÓSTICO SIN ASSET',{height:3,diameterTop:0,diameterBottom:.5,tessellation:5},this.scene);
      cone.parent=root;cone.position.y=1.5;cone.isPickable=false;cone.material=this.diagnosticMaterial;
      return {root,entries:null,group:null,...pose};
    }
    const entries=container.instantiateModelsToScene(n=>`root-${index}-${n}`,false,{doNotInstantiate:true});
    entries.rootNodes.forEach(n=>{n.parent=root;for(const m of n.getChildMeshes()){
      m.isPickable=false;m.checkCollisions=false;
      // Morph poses change every frame; authored bounds must include full emergence.
      m.alwaysSelectAsActiveMesh=true;
    }});
    return {root,entries,group:entries.animationGroups[0],...pose};
  }
  update(e:AbilityExecution):void{
    if(this.disposed)return;
    const p=e.profile;
    for(let i=0;i<this.active;i++){
      const instance=this.pool[i],{group,root}=instance;
      const placement=e.plan!.placements[i],t=e.elapsed-e.timeline.fx[0]-(placement.delay??0);
      const visible=t>=0&&t<p.emergence+p.hold+p.retraction;
      root.setEnabled(visible);if(!visible)continue;
      const lean=sampleRootLean(placement.lean??0,t,p);
      if(instance.lean!==lean){
        const {normal,axis,tilt}=instance,center=e.plan!.center;
        normal.set(placement.normal.x,placement.normal.y,placement.normal.z);
        // Tangent to the ring, projected onto its local ground plane. Only the
        // tip direction changes; the base stays at the committed ground anchor.
        axis.set(-(placement.z-center.z),0,placement.x-center.x).normalize();
        const dot=Vector3.Dot(axis,normal);
        axis.set(axis.x-normal.x*dot,axis.y-normal.y*dot,axis.z-normal.z*dot).normalize();
        const cosine=Math.cos(lean),sine=Math.sin(lean);
        normal.set(normal.x*cosine+axis.x*sine,normal.y*cosine+axis.y*sine,normal.z*cosine+axis.z*sine).normalize();
        axis.set(normal.z,0,-normal.x);
        if(axis.lengthSquared()>1e-8)
          Quaternion.RotationAxisToRef(axis.normalize(),Math.acos(Math.max(-1,Math.min(1,normal.y))),tilt);
        else tilt.set(0,0,0,1);
        Quaternion.RotationAxisToRef(ROOT_UP,i*2.399963,instance.yaw);
        tilt.multiplyToRef(instance.yaw,root.rotationQuaternion!);instance.lean=lean;
      }
      const seconds=t<p.emergence ? .85*t/p.emergence : t<p.emergence+p.hold ?
        .85+.95*(t-p.emergence)/p.hold:
        1.8+.95*Math.min(1,(t-p.emergence-p.hold)/p.retraction);
      if(group){
        group.goToFrame(group.from+(group.to-group.from)*seconds/group.getLength(),true);
        // The supplied flexion morph is decorative: its amplitude follows FX intensity only.
        for(const track of group.targetedAnimations)
          if(track.target.name==='Curvar')track.target.influence*=Math.min(1.3,e.profile.fxIntensity);
      }
      else root.scaling.y=(placement.scale??p.rootScale)*Math.max(.001,t<p.emergence?t/p.emergence:
        t<p.emergence+p.hold?1:1-(t-p.emergence-p.hold)/p.retraction);
    }
    const camera=this.scene.activeCamera;
    this.shake.apply(e,camera instanceof ArcRotateCamera?camera.targetScreenOffset:null);
  }
  clear():void{this.shake.clear();for(const p of this.pool){p.group?.stop();p.root.setEnabled(false);}this.active=0;}
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.clear();
    this.pool.splice(0).forEach(p=>{
      const managers=new Set(p.root.getChildMeshes().flatMap(mesh=>mesh.morphTargetManager?[mesh.morphTargetManager]:[]));
      p.entries?.dispose();p.root.dispose();
      // Mesh disposal does not own cloned morph managers or their GPU target textures.
      managers.forEach(manager=>manager.dispose());
    });
    this.containers.splice(0).forEach(c=>c.dispose());this.diagnosticMaterial?.dispose();
  }
}
