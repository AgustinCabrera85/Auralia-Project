import {Vector3, type Camera, type Scene} from '@babylonjs/core';
import type {ClimateFrame} from './ClimateModel';
import type {RainOptions} from './RainFX.js';
import {RainbowFX, type RainbowState} from './RainbowFX.js';

const smooth=(a:number,b:number,x:number)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);
};

/** A sun shower/clearing, using the same blended weather as the sky.
 * Conservatively hide under overcast skies; lightning and moonlight do not count. */
export function rainbowSunVisibility(frame:ClimateFrame):number{
  if(frame.sunHeight<=0||frame.night>=.5)return 0;
  return frame.dayLight*(1-smooth(.48,.82,frame.weatherMix.cloud))*
    (1-smooth(.28,.5,frame.weatherMix.darken));
}

/** One small atmospheric mesh. Updated alongside rain, after the active camera. */
export class ClimateRainbow {
  private readonly fx:RainbowFX;
  private readonly sunDirection=new Vector3(0,1,0);
  private readonly state:RainbowState={sunDirection:this.sunDirection};
  private readonly lastEye=new Vector3(Infinity,0,0);
  private readonly exposureEye=new Vector3(Infinity,0,0);
  private surface:RainOptions['getSurfaceAt'];
  private exposure=1;
  private exposureTimer=0;

  constructor(scene:Scene){
    this.fx=new RainbowFX(scene,{skyOpacity:.32,saturation:.82,secondary:false,
      segments:128,skyDistance:2500,fadeSeconds:1.5});
  }
  configureSurface(surface:RainOptions['getSurfaceAt']):void{this.surface=surface;this.exposureTimer=0;}
  invalidateSurface():void{this.exposureTimer=0;}
  setPaused(paused:boolean):void{this.fx.setPaused(paused);}
  reset():void{
    this.fx.reset();this.lastEye.x=Infinity;this.exposureEye.x=Infinity;this.exposureTimer=0;
  }
  update(dt:number,camera:Camera|null,frame:ClimateFrame,rainAmount:number,sheltered:boolean,paused:boolean):void{
    if(!camera)return;
    const eye=camera.globalPosition;
    if(Number.isFinite(this.lastEye.x)&&Vector3.DistanceSquared(eye,this.lastEye)>80*80)this.reset();
    this.lastEye.copyFrom(eye);this.fx.setPaused(paused);
    const sun=rainbowSunVisibility(frame);
    if(!paused)this.exposureTimer-=Math.max(0,Math.min(.1,dt));
    if(!sheltered&&sun>0&&rainAmount>.001&&
      (this.exposureTimer<=0||Vector3.DistanceSquared(eye,this.exposureEye)>36)){
      // Reuse the rain receiver (roofs/terrain/water), at most four times per
      // second when stationary. No new scene raycasts, depth maps or textures.
      const surface=this.surface?.(eye.x,eye.z),height=typeof surface==='number'?surface:surface?.height;
      this.exposure=this.surface&&(height===undefined||!Number.isFinite(height)||height>eye.y+.15)?0:1;
      this.exposureEye.copyFrom(eye);this.exposureTimer=.25;
    }
    this.sunDirection.set(...frame.sunDirection);
    this.state.isDay=frame.sunHeight>0&&frame.night<.5;
    this.state.sunVisibility=sheltered?0:sun*this.exposure;
    this.state.rainAmount=rainAmount;
    this.fx.update(dt,camera,this.state);
  }
  get stats(){return this.fx.getStats();}
  dispose():void{this.fx.dispose();}
}
