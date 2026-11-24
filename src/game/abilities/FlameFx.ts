import type {Scene} from '@babylonjs/core';
import {allowed,denied,type AbilityExecution} from '../../domain/abilities/types';
import {FLAME_WIDTH,type FlameWorld} from '../../domain/abilities/igneoFire';
import type {AbilityFxAdapter} from './AbilityPresentation';
import {FlameJetFX} from './FlameJetFX.js';

/** One reusable pool, compiled on selection. Tick after Santi's final hand pose. */
export class FlameFx implements AbilityFxAdapter {
  private fx:FlameJetFX|null=null;
  private state:'empty'|'loading'|'ready'|'failed'='empty';
  private disposed=false;
  private running=false;
  constructor(private readonly scene:Scene,private readonly world:FlameWorld){}
  prepare():void{
    if(this.disposed||this.state!=='empty')return;
    this.state='loading';
    const fx=this.fx=new FlameJetFX(this.scene,{quality:'low',createLights:false,width:FLAME_WIDTH,
      hitHz:20,resolveHit:(origin,direction,length)=>this.world.trace(origin,direction,length)});
    void fx.prepare().then(()=>{if(!this.disposed)this.state='ready';},()=>{if(!this.disposed)this.state='failed';});
  }
  ready(){return this.state==='ready'?allowed:denied(this.state==='failed'?'No se pudo preparar la llamarada.':'Preparando la llamarada…');}
  start(e:AbilityExecution):void{
    this.fx?.reset();this.fx?.setParameters({length:e.profile.radius,width:FLAME_WIDTH,intensity:e.profile.fxIntensity});
    this.fx?.setActive(true);this.running=true;
  }
  update(e:AbilityExecution):void{this.fx?.setActive(e.elapsed<e.timeline.recovery);}
  afterPose(dt:number):void{
    if(!this.running||!this.fx||this.disposed)return;
    const emitter=this.world.emitter();
    if(!emitter){this.clear();return;}
    this.fx.setEmitter(emitter.origin,emitter.direction);this.fx.update(dt,this.scene.activeCamera??undefined);
  }
  clear():void{this.running=false;this.fx?.reset();}
  get stats(){return this.fx?.getState()??null;}
  dispose():void{this.disposed=true;this.clear();this.fx?.dispose();this.fx=null;}
}
