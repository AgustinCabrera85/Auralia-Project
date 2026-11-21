import { AbilityConditions } from './conditions';
import { allowed, denied, type AbilityBehavior, type AbilityContext, type AbilityDefinition,
  type AbilityExecution, type AbilityId, type AbilityPresentation, type AbilityProfile, type AbilityStatus, type Decision } from './types';

function snapshotProfile(profile:AbilityProfile):Readonly<AbilityProfile>{
  return Object.freeze({...profile,rings:profile.rings&&Object.freeze(profile.rings.map(r=>Object.freeze({...r}))),
    cameraShake:profile.cameraShake&&Object.freeze({...profile.cameraShake}),
    timeline:profile.timeline&&Object.freeze({...profile.timeline,
      impacts:profile.timeline.impacts&&Object.freeze([...profile.timeline.impacts])})});
}
function executionTimeline(definition:AbilityDefinition,profile:Readonly<AbilityProfile>){
  const t=definition.timeline,overrides=profile.timeline;
  return Object.freeze({...t,recovery:overrides?.recovery??t.recovery,release:overrides?.release??t.release,
    fx:Object.freeze([...t.fx]),impacts:Object.freeze([...(overrides?.impacts??t.impacts)])});
}

export interface AbilityWallet {
  has(resource:string,amount:number):boolean;
  /** Atomic; false means nothing was spent. Called exactly once, at commitment. */
  spend(resource:string,amount:number,executionId:string):boolean;
}
let nextManager=0;
/** Simulation only: never depends on a mesh, animation completion callback or wall clock. */
export class AbilityManager {
  readonly conditions=new AbilityConditions();
  private readonly behaviors=new Map<string,AbilityBehavior>();
  private readonly cooldowns=new Map<AbilityId,number>();
  private current:AbilityExecution|null=null;
  private serial=0;
  private readonly prefix=++nextManager;
  private disposed=false;
  constructor(readonly definitions:readonly AbilityDefinition[],
    private readonly context:()=>AbilityContext,
    private readonly presentation:AbilityPresentation,
    private readonly wallet?:AbilityWallet,
    private readonly report:(message:string)=>void=()=>{}){}
  register(id:string,behavior:AbilityBehavior):void{this.behaviors.set(id,behavior);}
  get execution():Readonly<AbilityExecution>|null{return this.current;}
  get controlLocked():boolean{return !!this.current&&this.current.phase!=='active';}
  get holdSeconds():number{return this.controlLocked?Math.max(.01,this.current!.timeline.release-this.current!.elapsed):0;}
  prepare(id:AbilityId):void{const d=this.definitions.find(d=>d.id===id);if(!this.disposed&&d)this.presentation.prepare(d);}
  status(id:AbilityId,atCommit=false):AbilityStatus{
    const d=this.definitions.find(d=>d.id===id)!;
    const c=this.context(),level=d.levelSource==='sword'?c.swordLevel:c.levels[id]??1;
    const profile=d.profiles[Math.max(0,Math.min(d.profiles.length-1,level-1))];
    const unlocked=c.unlocked.includes(id),cooldown=this.cooldowns.get(id)??0;
    const resources=this.presentation.ready(d);
    const available=d.implementation==='available'&&!!d.behavior&&this.behaviors.has(d.behavior)&&resources.ok;
    let reason:string|null=this.disposed?'Escena cerrada.':
      !unlocked?d.unlockDescription:!available?d.pendingReason??(resources.ok===false?resources.reason:'Comportamiento pendiente.'):
      c.blocked??(c.actionBusy?'Terminá la acción actual.':null);
    if(!reason&&!atCommit&&this.current)reason='Ya hay una habilidad en ejecución.';
    if(!reason&&cooldown>0)reason=`Enfriamiento: ${cooldown.toFixed(1)} s.`;
    if(!reason){const r=this.conditions.evaluate(d.conditions,c);if(r.ok===false)reason=r.reason;}
    if(!reason&&d.cost&&(!this.wallet||!this.wallet.has(d.cost.resource,d.cost.amount)))reason=`Falta ${d.cost.resource}: ${d.cost.amount}.`;
    return {id,design:d.design,implementation:d.implementation,unlocked,available,activable:!reason,reason,
      cooldown,phase:this.current?.definition.id===id?this.current.phase:'idle',level,profile};
  }
  request(id:AbilityId):Decision{
    if(this.disposed)return denied('Escena cerrada.');
    if(this.current?.definition.id===id&&this.current.phase==='active'&&this.current.definition.activation==='toggle'){
      this.finish();return allowed;
    }
    if(!this.definitions.some(d=>d.id===id))return denied('Habilidad desconocida.');
    this.prepare(id);
    const status=this.status(id);if(!status.activable)return denied(status.reason!);
    const d=this.definitions.find(d=>d.id===id)!;
    const profile=snapshotProfile(status.profile);
    this.current={id:`ability-${this.prefix}-${++this.serial}`,definition:d,scope:this.context().scope,
      profile,timeline:executionTimeline(d,profile),plan:null,elapsed:0,committed:false,hits:new Set(),markers:new Set(),phase:'preparing'};
    try{
      if(!this.presentation.start(this.current)){this.finish();return denied('La animación no está disponible.');}
    }catch{this.finish();return denied('No se pudo iniciar la presentación.');}
    this.advance(0); // Also supports instantaneous commitment and impact at t=0.
    return allowed;
  }
  update(dt:number,paused=false):void{
    if(this.disposed||paused||!Number.isFinite(dt)||dt<0)return;
    for(const [id,time] of this.cooldowns)this.cooldowns.set(id,Math.max(0,time-dt));
    this.advance(dt);
  }
  private advance(dt:number):void{
    const e=this.current;if(!e)return;
    if(this.context().scope!==e.scope){this.cancel(true);return;}
    const before=e.elapsed;e.elapsed+=dt;
    const d=e.definition,behavior=this.behaviors.get(d.behavior!)!;
    let t=e.timeline;
    try{
      if(!e.committed&&e.elapsed>=t.commit){
        // Re-evaluate equipment, unlock, current level, state, resources and visual readiness.
        const status=this.status(d.id,true);
        if(!status.activable){this.report(status.reason!);this.finish();return;}
        e.profile=snapshotProfile(status.profile);e.timeline=t=executionTimeline(d,e.profile);
        e.plan=behavior.plan(this.context(),e.profile);
        if(!e.plan){this.report('No hay superficies válidas para esta habilidad.');this.finish();return;}
        if(d.cost&&!this.wallet?.spend(d.cost.resource,d.cost.amount,e.id)){
          this.report('El recurso requerido ya no está disponible.');this.finish();return;
        }
        e.committed=true;
        if(d.cooldownStarts==='commit')this.cooldowns.set(d.id,Math.max(0,d.cooldown-(e.elapsed-t.commit)));
        behavior.commit?.(e);
      }
      if(e.committed){
        // Timeline markers fire once even when a long simulation step crosses several phases.
        const crossed=(time:number)=>time>=t.commit&&((before<time&&e.elapsed>=time)||(before===0&&time===0));
        t.fx.forEach((time,i)=>{const key=`fx:${i}`;if(crossed(time)&&!e.markers.has(key)){
          e.markers.add(key);this.visual(()=>this.presentation.fx(e,i));}});
        t.impacts.forEach((time,i)=>{const key=`impact:${i}`;if(crossed(time)&&!e.markers.has(key)){
          e.markers.add(key);behavior.impact(e,i);}});
        behavior.update?.(e,dt);
        e.phase=d.activation==='toggle'&&e.elapsed>=t.release?'active':
          e.elapsed>=t.recovery?'recovering':'executing';
      }
      this.visual(()=>this.presentation.update(e,dt));
      if(e.committed&&d.activation!=='toggle'&&e.elapsed>=t.release)this.finish();
    }catch(error){this.report(`Habilidad interrumpida: ${String(error)}`);this.finish();}
  }
  private visual(run:()=>void):void{
    try{run();}catch(error){this.report(`Presentación no disponible: ${String(error)}`);}
  }
  /** Before commitment: no cost/cooldown. After: stop future impacts; keep spent cost/cooldown. */
  cancel(force=false):boolean{
    const e=this.current;if(!e)return false;
    if(!force&&!(e.committed?e.definition.cancel.afterCommit:e.definition.cancel.beforeCommit))return false;
    this.finish();return true;
  }
  private finish():void{
    const e=this.current;if(!e)return;
    this.current=null; // Release ownership before callbacks, including callbacks that throw.
    if(e.committed&&e.definition.cooldownStarts==='end')this.cooldowns.set(e.definition.id,e.definition.cooldown);
    try{this.behaviors.get(e.definition.behavior!)?.end?.(e);}
    catch(error){this.report(`No se pudo cerrar el comportamiento: ${String(error)}`);}
    finally{this.visual(()=>this.presentation.end(e));}
  }
  resetCooldowns():void{this.cooldowns.clear();}
  dispose():void{if(this.disposed)return;this.disposed=true;this.cancel(true);this.cooldowns.clear();this.presentation.dispose();this.behaviors.clear();}
}
