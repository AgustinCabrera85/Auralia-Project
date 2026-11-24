import { Color3, MeshBuilder, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { AbilityManager } from '../../domain/abilities/AbilityManager';
import { ABILITIES } from '../../domain/abilities/catalog';
import { AbilityTargets, ForestRootsBehavior, type RootsWorld } from '../../domain/abilities/forestRoots';
import { isAbilityId } from '../../domain/abilities/progress';
import type { AbilityContext, AbilityId, AbilityStatus, Point } from '../../domain/abilities/types';
import type { GameStore } from '../../domain/GameStore';
import type { SwordLevel } from '../../domain/brisaliaSword';
import type { SantiCharacter } from '../SantiCharacter';
import { AbilityPresentation } from './AbilityPresentation';
import { IgneoFireBehavior, type FlameWorld } from '../../domain/abilities/igneoFire';
import { FlameFx } from './FlameFx';

export type AbilityView={selected:AbilityId|null;statuses:AbilityStatus[];sandbox:boolean;fxDiagnostic:boolean};
export type AbilityWorldState=Omit<AbilityContext,'unlocked'|'levels'|'swordLevel'|'equipment'|'actionBusy'|'facts'>;
export class AbilitySystem {
  readonly manager:AbilityManager;
  readonly targets=new AbilityTargets();
  readonly presentation:AbilityPresentation;
  readonly flame:FlameFx;
  private poseDt=0;
  private readonly listeners=new Set<(view:AbilityView)=>void>();
  private readonly unsubscribe:()=>void;
  private hudElapsed=0;
  private dev:{unlocked:Set<AbilityId>;level:number;selected:AbilityId|null;facts:Record<string,boolean>}|null=null;
  private readonly dummyCleanup:(()=>void)[]=[];
  readonly testHits:{id:string;executionId:string;damage:number}[]=[];
  constructor(private readonly scene:Scene,private readonly store:GameStore,
    private readonly santi:()=>SantiCharacter|null,private readonly world:()=>AbilityWorldState,
    private readonly surfaces:RootsWorld,private readonly notify:(s:string)=>void,
    traceFlame:FlameWorld['trace']){
    this.presentation=new AbilityPresentation(scene,santi,import.meta.env.DEV&&new URLSearchParams(location.search).has('abilityDiagnostic'));
    this.manager=new AbilityManager(ABILITIES,()=>this.context(),this.presentation,undefined,notify);
    this.manager.register('forest_roots',new ForestRootsBehavior(surfaces,this.targets));
    const origin=new Vector3(),direction=new Vector3(),emitter={origin,direction};
    const fireWorld:FlameWorld={emitter:()=>this.santi()?.sampleFlameEmitter(origin,direction)?emitter:null,trace:traceFlame};
    this.flame=new FlameFx(scene,fireWorld);this.presentation.registerFx('igneo_fire',this.flame);
    this.manager.register('igneo_fire',new IgneoFireBehavior(fireWorld,this.targets));
    this.unsubscribe=store.subscribe(()=>{
      if(this.selected)this.manager.prepare(this.selected);
      this.emit();
    });
  }
  private context():AbilityContext{
    const state=this.store.state;
    return {...this.world(),unlocked:this.dev?[...this.dev.unlocked]:state.abilities?.unlocked??[],
      levels:state.abilities?.levels??{},swordLevel:this.dev?.level??this.store.swordLevel,
      // Sandbox overrides knowledge/levels, never the player's equipment choice.
      equipment:state.equippedItem??'unarmed',
      actionBusy:!this.manager?.execution&&!!this.santi()?.actionBusy,
      facts:{...Object.fromEntries((state.discoveredPlaces??[]).map(id=>[id,true])),...this.dev?.facts}};
  }
  get selected():AbilityId|null{return this.dev?this.dev.selected:this.store.state.abilities?.selected??null;}
  get visualSwordLevel(){return this.dev?.level??this.store.swordLevel;}
  get equippedSwordLevel():SwordLevel{return this.store.state.equippedItem==='sword'?this.visualSwordLevel as SwordLevel:0;}
  get sandbox():boolean{return !!this.dev;}
  view():AbilityView{return {selected:this.selected,statuses:ABILITIES.map(a=>this.manager.status(a.id)),
    sandbox:this.sandbox,fxDiagnostic:this.presentation.roots.diagnostics.fallback};}
  subscribe(listener:(view:AbilityView)=>void):()=>void{this.listeners.add(listener);listener(this.view());return ()=>this.listeners.delete(listener);}
  private emit():void{const view=this.view();for(const listener of this.listeners)listener(view);}
  select(id:AbilityId):boolean{
    const d=ABILITIES.find(a=>a.id===id);
    if(!d||d.slot!=='special'||d.implementation!=='available')return false;
    if(this.dev){if(!this.dev.unlocked.has(id))return false;this.dev.selected=id;}
    else if(!this.store.selectAbility(id))return false;
    this.manager.prepare(id);this.emit();return true;
  }
  request(ultimate=false):void{
    const id=ultimate?'forest_ultimate':this.selected;
    if(!id){this.notify('Aprendé y seleccioná una habilidad en Poderes (H).');return;}
    const result=this.manager.request(id);if(!result.ok)this.notify(result.reason);this.emit();
  }
  update(dt:number,paused:boolean):void{
    this.poseDt=paused?0:dt;
    const c=this.world();
    if(c.blocked||c.playerState!=='grounded'&&['forest_roots','igneo_fire'].includes(this.manager.execution?.definition.id??''))this.manager.cancel(true);
    if(this.selected)this.manager.prepare(this.selected);
    this.manager.update(dt,paused);
    this.hudElapsed+=dt;if(this.hudElapsed>=.1){this.hudElapsed=0;this.emit();}
  }
  afterPose():void{this.flame.afterPose(this.poseDt);}
  interrupt():void{this.manager.cancel(true);this.emit();}
  resetScene():void{this.interrupt();this.clearDummies();}
  reloadSave():void{this.resetScene();this.dev=null;this.manager.resetCooldowns();this.emit();}
  /** Explicit temporary sandbox: no write to GameStore or localStorage. */
  development(command:'sandbox'|'exit'|'unlock'|'level'|'cooldown'|'fact'|'targets'|'fire',value?:string):void{
    if(!import.meta.env.DEV)return;
    if(command==='exit'){this.resetScene();this.dev=null;this.manager.resetCooldowns();this.emit();return;}
    if(command==='sandbox'){
      this.interrupt();this.dev={unlocked:new Set(this.store.state.abilities?.unlocked??[]),
        level:Math.max(1,this.store.swordLevel),selected:this.selected,facts:{}};
    }
    if(command==='fire'){
      this.interrupt();
      if(!this.dev)this.dev={unlocked:new Set(this.store.state.abilities?.unlocked??[]),
        level:Math.max(1,this.store.swordLevel),selected:this.selected,facts:{}};
      this.dev.unlocked.add('igneo_fire');this.dev.selected='igneo_fire';
      this.manager.resetCooldowns();this.manager.prepare('igneo_fire');
      this.notify('Llamarada en prueba temporal. En suelo firme, pulsá X para lanzarla.');
    }
    if(!this.dev)return;
    if(command==='unlock'&&isAbilityId(value))this.dev.unlocked.add(value);
    if(command==='level'&&[1,2,3,4].includes(Number(value)))this.dev.level=Number(value);
    if(command==='cooldown')this.manager.resetCooldowns();
    if(command==='fact'&&value){const [key,flag]=value.split('=');if(/^[a-zA-Z0-9_-]{1,64}$/.test(key))this.dev.facts[key]=flag!=='false';}
    if(command==='targets')this.createDummies();
    if(!this.dev.selected&&this.dev.unlocked.has('forest_roots'))this.select('forest_roots');
    this.emit();
  }
  private clearDummies():void{this.dummyCleanup.splice(0).forEach(f=>f());this.testHits.length=0;}
  private createDummies():void{
    this.clearDummies();const center=this.world().position;
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,p=this.surfaces.surface(center.x+Math.cos(a)*2,center.z+Math.sin(a)*2,center.y);
      if(!p)continue;
      const id=`dev-target-${i}`,mesh=MeshBuilder.CreateBox(id,{height:1.5,width:.5,depth:.5},this.scene);
      mesh.position.set(p.x,p.y+.75,p.z);mesh.isPickable=false;
      const material=new StandardMaterial(id,this.scene);material.diffuseColor=new Color3(.7,.3,.8);mesh.material=material;
      const unregister=this.targets.register({id,position:mesh.position as Point,radius:.25,valid:()=>!mesh.isDisposed(),receive:hit=>{
        if(this.testHits.length>=100)this.testHits.shift();
        this.testHits.push({id,executionId:hit.executionId,damage:hit.damage});
        material.emissiveColor=new Color3(.2,.8,.2);
        this.notify(`Blanco de desarrollo: ${hit.damage.toFixed(1)} de daño · ${hit.executionId}`);
      }});
      this.dummyCleanup.push(()=>{unregister();mesh.dispose();material.dispose();});
    }
  }
  dispose():void{this.unsubscribe();this.clearDummies();this.manager.dispose();this.targets.clear();this.listeners.clear();}
}
