import { AnimationGroup, AssetContainer, TransformNode, type AbstractMesh, type InstantiatedEntries, type Scene } from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { loadGpuAssetContainerAsync } from '../GpuAssets';
import { BIRDS, BIRD_CLIPS, type BirdClip, type BirdSpecies } from './BirdCatalog';
import { BirdSimulation, type BirdAgent, type BirdPoint } from './BirdSimulation';
import { BirdHabitatScanner, type BirdWorld } from './BirdHabitat';

type Visual={root:TransformNode;entries:InstantiatedEntries;clips:Map<BirdClip,AnimationGroup>;
  meshes:AbstractMesh[];weights:Map<BirdClip,number>;paused:boolean;age:number};
const looped=new Set<BirdClip>(['Reposo','Volar','Planear','Picotear','Saltar']);
export type BirdFrame={focus:BirdPoint;threats:readonly BirdPoint[];night:number;rain:number;active:boolean;paused:boolean};

/** Two local flocks, shared GLBs and independent rigs/morphs. No per-bird asset requests. */
export class BirdFlockSystem {
  readonly simulation=new BirdSimulation();
  readonly habitat:BirdHabitatScanner;
  readonly ready:Promise<void>;
  readonly failures:string[]=[];
  private readonly assets=new Map<BirdSpecies,AssetContainer>();
  private readonly visuals=new Map<number,Visual>();
  private readonly counts:Record<BirdSpecies,number>;
  private origin:BirdPoint|null=null;
  private disposed=false;
  private active=false;
  private frames=0;
  private updateMs=0;
  private populationRevision=-1;
  private populationAssets=0;

  constructor(private scene:Scene,private parent:TransformNode,world:BirdWorld,performanceMode=false,
    private importer=loadGpuAssetContainerAsync){
    this.habitat=new BirdHabitatScanner(scene,world);
    this.counts={canary:performanceMode?BIRDS.canary.performanceCount:BIRDS.canary.count,
      swallow:performanceMode?BIRDS.swallow.performanceCount:BIRDS.swallow.count};
    this.ready=this.load();
    scene.onDisposeObservable.addOnce(()=>this.dispose());
  }

  private async load():Promise<void>{
    for(const species of ['canary','swallow'] as const){
      if(this.disposed)return;
      let asset:AssetContainer|undefined;
      try{
        asset=await this.importer(BIRDS[species].url,this.scene,
          {pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}});
        if(this.disposed){asset.dispose();return;}
        const missing=BIRD_CLIPS.filter(name=>!asset!.animationGroups.some(g=>g.name===name));
        if(missing.length)throw new Error(`Faltan clips: ${missing.join(', ')}`);
        this.assets.set(species,asset);
      }catch(error){asset?.dispose();this.failures.push(`${species}: ${String(error)}`);console.warn('[Auralia birds]',species,error);}
    }
  }

  private createVisual(b:BirdAgent):Visual|null{
    const asset=this.assets.get(b.species);if(!asset)return null;
    const prefix=`bird:${b.species}:${b.id}:`;
    // Babylon clones skeletons AND morph managers and retargets every animation channel.
    const entries=asset.instantiateModelsToScene(name=>prefix+name,false,{doNotInstantiate:true});
    const root=new TransformNode(prefix+'root',this.scene);root.parent=this.parent;
    const support=new TransformNode(prefix+'feet',this.scene);support.parent=root;
    for(const node of entries.rootNodes)node.parent=support;
    const bounds=root.getHierarchyBoundingVectors(true);
    const height=bounds.max.y-bounds.min.y;
    support.position.y=-bounds.min.y;
    root.scaling.setAll(BIRDS[b.species].height/Math.max(.01,height));
    const meshes=root.getChildMeshes();
    for(const mesh of meshes){
      mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=true;
      // Wing morphs extend beyond the authored rest bounds; distance culling is explicit below.
      mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={...mesh.metadata,wildlife:true,species:b.species};
    }
    const clips=new Map<BirdClip,AnimationGroup>();
    for(const group of entries.animationGroups){group.stop();clips.set(group.name.slice(prefix.length) as BirdClip,group);}
    const visual={root,entries,clips,meshes,weights:new Map<BirdClip,number>(),paused:false,age:0};
    this.visuals.set(b.id,visual);return visual;
  }

  update(dt:number,frame:BirdFrame):void{
    if(this.disposed)return;
    this.active=frame.active;
    if(!frame.active||frame.paused){
      for(const v of this.visuals.values()){
        if(!frame.active)v.root.setEnabled(false);
        for(const g of v.clips.values())if(g.isStarted)g.pause();v.paused=true;
      }
      return;
    }
    const start=performance.now();
    if(!this.habitat.allowed(frame.focus.x,frame.focus.z)){
      if(this.populationRevision!==-2){
        this.parkVisuals();this.simulation.clear();this.origin=null;this.habitat.reset();
      }
      this.active=false;this.populationRevision=-2;return;
    }
    if(this.origin&&Math.hypot(frame.focus.x-this.origin.x,frame.focus.z-this.origin.z)>115){
      this.parkVisuals();this.simulation.clear();this.origin=null;this.habitat.reset();
    }
    this.habitat.update(dt,frame.focus);
    // A completed habitat scan or newly loaded species can add canopy occupants.
    // Empty grassland/shorelines never fabricate an airborne fallback population.
    if(this.assets.size&&(this.populationRevision!==this.habitat.revision||this.populationAssets!==this.assets.size)){
      this.simulation.populate(frame.focus,this.habitat,{
        canary:this.assets.has('canary')?this.counts.canary:0,swallow:this.assets.has('swallow')?this.counts.swallow:0});
      if(!this.origin&&this.simulation.birds.length)this.origin={...frame.focus};
      this.populationRevision=this.habitat.revision;this.populationAssets=this.assets.size;
    }
    this.simulation.step(dt,this.habitat,frame,1);
    let created=false;
    for(const b of this.simulation.birds){
      let v=this.visuals.get(b.id);
      // Populate gradually once, then reuse the same bounded rigs when travelling.
      // Cloning all eleven animated models together previously stalled a frame.
      if(!v&&!created){v=this.createVisual(b)??undefined;created=!!v;}
      if(!v)continue;
      v.root.position.set(b.position.x,b.position.y,b.position.z);
      // BirdPoint is a plain DTO. Babylon's Distance reads Vector3's private
      // fields, so casting focus to Vector3 produces NaN and hides every bird.
      const d=Math.hypot(b.position.x-frame.focus.x,b.position.y-frame.focus.y,b.position.z-frame.focus.z);
      const visible=d<115&&(v.age>0||!!b.flight||b.landed);
      v.root.setEnabled(visible);
      v.root.rotation.set(b.landed?0:-Math.atan2(b.velocity.y,Math.max(1,Math.hypot(b.velocity.x,b.velocity.z)))*.25,b.heading,b.bank);
      if(!visible){for(const g of v.clips.values())if(g.isStarted)g.pause();v.paused=true;continue;}
      if(v.paused){for(const [clip] of v.weights)v.clips.get(clip)?.play(looped.has(clip));v.paused=false;}
      v.age+=dt;
      for(const mesh of v.meshes)mesh.visibility=Math.min(1,v.age*2,(115-d)/12);
      this.animate(v,b,dt);
    }
    this.frames++;this.updateMs+=(performance.now()-start-this.updateMs)*.05;
  }

  private animate(v:Visual,b:BirdAgent,dt:number):void{
    const names=new Set([...v.weights.keys(),b.clip]);
    for(const name of names){
      const group=v.clips.get(name);if(!group)continue;
      const previous=v.weights.get(name)??0;
      const weight=previous+((name===b.clip?1:0)-previous)*(1-Math.exp(-dt*16));
      if(weight<.005){group.stop();v.weights.delete(name);continue;}
      if(!v.weights.has(name)){
        group.start(looped.has(name),name==='Volar'?(b.species==='canary'?1.25:1.05):1);
        if(looped.has(name)&&name!=='Saltar')group.goToFrame(group.from+(group.to-group.from)*(b.phase/(Math.PI*2)));
      }
      group.setWeightForAllAnimatables(weight);v.weights.set(name,weight);
    }
  }

  get status(){return {ready:[...this.assets.keys()],failures:[...this.failures],active:this.active,
    count:this.simulation.birds.length,visible:[...this.visuals.values()].filter(v=>v.root.isEnabled()).length,
    habitats:this.habitat.sites.reduce<Record<string,number>>((n,s)=>{n[s.kind]=(n[s.kind]??0)+1;return n;},{}),
    obstacles:this.habitat.obstacles.length,updateMs:this.updateMs,frames:this.frames,
    birds:this.simulation.birds.map(b=>({id:b.id,species:b.species,state:b.state,clip:b.clip,intent:b.intent,
      position:{...b.position},target:b.target?{...b.target}:null,hunger:b.hunger,thirst:b.thirst,
      roosting:b.roosting,clips:[...(this.visuals.get(b.id)?.clips.keys()??[])]}))};}

  private parkVisuals():void{
    for(const v of this.visuals.values()){
      for(const g of v.clips.values())g.stop();
      v.weights.clear();v.age=0;v.paused=false;v.root.setEnabled(false);
    }
  }

  private clearVisuals():void{
    for(const v of this.visuals.values()){
      // InstantiatedEntries.dispose releases meshes, skeletons and groups, but
      // Babylon 9 does not dispose the independently cloned morph managers.
      const managers=new Set(v.meshes.flatMap(m=>m.morphTargetManager?[m.morphTargetManager]:[]));
      v.entries.dispose();v.root.dispose(false,false);
      for(const manager of managers)manager.dispose();
    }
    this.visuals.clear();
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.clearVisuals();
    for(const a of this.assets.values())a.dispose();this.assets.clear();
    this.simulation.birds.length=0;this.habitat.reset();
  }
}
