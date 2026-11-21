import {
  Color4, DynamicTexture, ParticleSystem, Scene, Vector3,
  type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame } from './ClimateModel';
import { RainField } from './RainField';

function makeSnowTexture(scene:Scene):DynamicTexture{
  const width=32,height=64;
  const texture=new DynamicTexture('auralia-snow-flake',{width,height},scene,false);
  const ctx=texture.getContext();
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.arc(16,32,12,0,Math.PI*2);ctx.fill();
  texture.hasAlpha=true;
  texture.update(false);
  return texture;
}

/** Rain is a shader field; the separate, bounded snow system is unchanged. */
export class Precipitation {
  private readonly rain:RainField;
  private readonly snow:ParticleSystem;
  private readonly snowTexture:DynamicTexture;
  private readonly emitter=new Vector3(0,0,0);
  private snowActive=false;

  constructor(private readonly scene:Scene,private readonly camera:ArcRotateCamera){
    this.rain=new RainField(scene,camera);
    this.snowTexture=makeSnowTexture(scene);
    this.snow=this.makeSnowSystem();
  }
  private makeSnowSystem():ParticleSystem{
    const p=new ParticleSystem('auralia-snow',350,this.scene);
    p.particleTexture=this.snowTexture;
    p.emitter=this.emitter;
    p.minLifeTime=2.2;p.maxLifeTime=3.6;
    p.minSize=.13;p.maxSize=.25;
    p.minEmitPower=1;p.maxEmitPower=1;
    p.emitRate=0;
    p.color1=new Color4(.92,.96,1,.83);
    p.color2=new Color4(1,1,1,.86);
    p.colorDead=new Color4(1,1,1,0);
    p.gravity=new Vector3(0,-.8,0);
    p.updateSpeed=.015;
    p.createBoxEmitter(
      new Vector3(-1,-2,-.7),new Vector3(1,-3,.7),
      new Vector3(-23,5,-23),new Vector3(23,12,23)
    );
    return p;
  }

  update(frame:ClimateFrame,sheltered=false,dt=1/60):void{
    this.rain.update(frame,sheltered,dt);
    if(sheltered){
      if(this.snowActive){this.snow.stop();this.snow.reset();this.snowActive=false;}
      return;
    }
    // Emitter follows camera, but already spawned droplets stay in world space.
    const pos=this.camera.globalPosition;
    this.emitter.copyFromFloats(pos.x,pos.y,pos.z);
    this.snow.emitRate=Math.round(150*frame.weatherMix.snow);
    if(this.snow.emitRate>2&&!this.snowActive){this.snow.start();this.snowActive=true;}
    else if(this.snow.emitRate<=2&&this.snowActive){this.snow.stop();this.snowActive=false;}
  }

  dispose():void{
    this.rain.dispose();
    this.snow.dispose();
    this.snowTexture.dispose();
  }
}
