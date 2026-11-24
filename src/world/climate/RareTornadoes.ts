import type { Camera, Scene } from '@babylonjs/core';
import type { ClimateFrame } from './ClimateModel';
import type { TornadoFX } from './TornadoFX.js';
import { TORNADO_RULES, tornadoRandom, tornadoWindow, type TornadoSurface, type TornadoWindow } from './TornadoSchedule';

type Point={x:number;y:number;z:number};
type Effect=Pick<TornadoFX,'play'|'setSize'|'setPosition'|'setGroundNormal'|'setLighting'|'setLOD'|'setPaused'|'stop'|'reset'|'update'|'getStats'|'dispose'>;
type Factory=(scene:Scene)=>Promise<Effect>;
const createEffect:Factory=async scene=>{
  const {TornadoFX}=await import('./TornadoFX.js');
  const fx=new TornadoFX(scene,{atlasUrl:'/assets/weather/tornado/tornado_atlas_1k.webp',
    height:64,groundRadius:TORNADO_RULES.groundRadius,cloudRadius:42,
    fadeIn:4,fadeOut:4,nearDistance:170,farDistance:300,maxDistance:1000});
  try{return await fx.prepare();}catch(error){fx.dispose();throw error;}
};

/** A single reusable FX. Idle frames do not sample terrain or load the atlas. */
export class RareTornadoes {
  private fx:Effect|null=null;
  private loading=false;
  private disposed=false;
  private pending:TornadoWindow|null=null;
  private active:{endHour:number;direction:number;biome:TornadoSurface['biome']}|null=null;
  private position:Point={x:0,y:0,z:0};
  private lastSlot=-1;
  private nextHour=-Infinity;
  private probeTime=0;
  private error:string|null=null;
  constructor(private readonly scene:Scene,
    private readonly sample:(x:number,z:number)=>TornadoSurface|null,
    private readonly factory:Factory=createEffect){}

  update(dt:number,frame:ClimateFrame,player:Point,camera:Camera,
    enabled:boolean,paused:boolean,lowQuality=false):void {
    if(this.disposed)return;
    if(!enabled){this.reset();return;}
    dt=Math.max(0,Math.min(.25,dt));
    if(this.fx){
      this.fx.setPaused(paused);this.fx.setLOD(lowQuality?'far':'auto');
      this.fx.setLighting(.22+.78*frame.dayLight,{x:frame.sunDirection[0],y:frame.sunDirection[1],z:frame.sunDirection[2]});
    }
    if(!paused){
      if(this.active){
        this.probeTime+=dt;
        if(frame.elapsedHours>=this.active.endHour||frame.weatherMix.wind<.6||Math.hypot(player.x-this.position.x,player.z-this.position.z)>900){
          this.stop();
        }else if(this.probeTime>=.4){
          const step=this.probeTime*TORNADO_RULES.driftSpeed;this.probeTime=0;
          const x=this.position.x+Math.cos(this.active.direction)*step,z=this.position.z+Math.sin(this.active.direction)*step;
          const surface=this.footprint(x,z);
          if(surface)this.place(x,z,surface);else this.stop();
        }
      }else if(!this.fx?.getStats().active){
        const window=tornadoWindow(frame);
        if(this.pending){
          if(window?.slot!==this.pending.slot)this.pending=null;
          else if(this.fx){this.pending=null;this.start(window,player);}
        }else if(window&&window.slot!==this.lastSlot&&frame.elapsedHours>=this.nextHour){
          this.lastSlot=window.slot;
          if(this.fx)this.start(window,player);
          else {this.pending=window;this.prepare();}
        }
      }
    }
    if(this.fx?.getStats().active)this.fx.update(dt,camera);
  }

  private prepare():void {
    if(this.loading)return;
    this.loading=true;
    void this.factory(this.scene).then(fx=>{
      if(this.disposed)fx.dispose();else this.fx=fx;
    }).catch(error=>{this.error=String(error);this.pending=null;console.warn('[Tornado FX]',error);})
      .finally(()=>{this.loading=false;});
  }
  private start(window:TornadoWindow,player:Point):void {
    for(let i=0;i<12;i++){
      const angle=tornadoRandom(window.seed+10+i)*Math.PI*2;
      const distance=TORNADO_RULES.minDistance+tornadoRandom(window.seed+30+i)*(TORNADO_RULES.maxDistance-TORNADO_RULES.minDistance);
      const x=player.x+Math.cos(angle)*distance,z=player.z+Math.sin(angle)*distance;
      const ground=this.footprint(x,z);if(!ground)continue;
      this.place(x,z,ground);
      if(!this.fx!.play({position:this.position,normal:{x:-ground.slopeX,y:1,z:-ground.slopeZ},
        type:ground.biome==='desert'?'rope':'cone',duration:window.remaining}))return;
      this.fx!.setSize({groundRadius:TORNADO_RULES.groundRadius,cloudRadius:42});
      this.active={endHour:window.endHour,direction:tornadoRandom(window.seed+70)*Math.PI*2,biome:ground.biome};
      this.nextHour=window.endHour+TORNADO_RULES.cooldownHours;this.probeTime=0;return;
    }
  }
  private footprint(x:number,z:number):TornadoSurface|null {
    const center=this.sample(x,z);
    if(!center||!Number.isFinite(center.height)||Math.hypot(center.slopeX,center.slopeZ)>TORNADO_RULES.maxGroundSlope)return null;
    for(let i=0;i<8;i++){
      const dx=Math.cos(i*Math.PI/4)*TORNADO_RULES.groundRadius,dz=Math.sin(i*Math.PI/4)*TORNADO_RULES.groundRadius;
      const edge=this.sample(x+dx,z+dz);
      if(!edge||Math.hypot(edge.slopeX,edge.slopeZ)>TORNADO_RULES.maxGroundSlope||
        Math.abs(edge.height-center.height-center.slopeX*dx-center.slopeZ*dz)>.6)return null;
    }
    return center;
  }
  private place(x:number,z:number,ground:TornadoSurface):void {
    this.position={x,y:ground.height,z};
    this.fx!.setPosition(this.position);this.fx!.setGroundNormal({x:-ground.slopeX,y:1,z:-ground.slopeZ});
  }
  private stop():void{this.active=null;this.fx?.stop();}
  /** Travel/interiors cancel a pending appearance; the cooldown is retained. */
  reset():void{this.pending=null;this.active=null;this.probeTime=0;this.fx?.reset();}
  get status(){return {loading:this.loading,error:this.error,biome:this.active?.biome??null,
    position:this.active?{...this.position}:null,nextHour:Number.isFinite(this.nextHour)?this.nextHour:null,
    ...(this.fx?.getStats()??{active:false,ready:false,drawCalls:0})};}
  dispose():void{this.disposed=true;this.reset();this.fx?.dispose();this.fx=null;}
}
