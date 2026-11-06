import {
  Color4, DynamicTexture, ParticleSystem, Scene, Vector3,
  type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame } from './ClimateModel';

function makeParticleTexture(scene:Scene,name:string,snow:boolean):DynamicTexture{
  const width=32,height=64;
  const texture=new DynamicTexture(name,{width,height},scene,false);
  const ctx=texture.getContext();
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#ffffff';
  if(snow){
    ctx.beginPath();ctx.arc(16,32,12,0,Math.PI*2);ctx.fill();
  }else{
    const gradient=ctx.createLinearGradient(0,4,0,60);
    gradient.addColorStop(0,'rgba(255,255,255,0)');
    gradient.addColorStop(.25,'rgba(255,255,255,.8)');
    gradient.addColorStop(.82,'rgba(255,255,255,.72)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;
    ctx.fillRect(14,4,3,56);
  }
  texture.hasAlpha=true;
  texture.update(false);
  return texture;
}

/** Camera-local precipitation only: does not simulate rainfall across the whole island. */
export class Precipitation {
  private readonly rain:ParticleSystem;
  private readonly snow:ParticleSystem;
  private readonly rainTexture:DynamicTexture;
  private readonly snowTexture:DynamicTexture;
  private readonly emitter=new Vector3(0,0,0);
  private rainActive=false;
  private snowActive=false;

  constructor(private readonly scene:Scene,private readonly camera:ArcRotateCamera){
    this.rainTexture=makeParticleTexture(scene,'auralia-rain-drop',false);
    this.snowTexture=makeParticleTexture(scene,'auralia-snow-flake',true);
    this.rain=this.makeSystem('auralia-rain',this.rainTexture,false);
    this.snow=this.makeSystem('auralia-snow',this.snowTexture,true);
  }
  private makeSystem(name:string,texture:DynamicTexture,snow:boolean):ParticleSystem{
    const p=new ParticleSystem(name,snow?350:700,this.scene);
    p.particleTexture=texture;
    p.emitter=this.emitter;
    p.minLifeTime=snow?2.2:.6;
    p.maxLifeTime=snow?3.6:.9;
    p.minSize=snow?.13:.14;
    p.maxSize=snow?.25:.22;
    p.minEmitPower=1;p.maxEmitPower=1;
    p.emitRate=0;
    p.color1=snow?new Color4(.92,.96,1,.83):new Color4(.68,.80,1,.58);
    p.color2=snow?new Color4(1,1,1,.86):new Color4(.77,.88,1,.64);
    p.colorDead=new Color4(1,1,1,0);
    p.gravity=new Vector3(0,snow?-.8:-11,0);
    p.updateSpeed=.015;
    p.createBoxEmitter(
      snow?new Vector3(-1,-2,-.7):new Vector3(-.8,-23,-.4),
      snow?new Vector3(1,-3,.7):new Vector3(.8,-18,.4),
      new Vector3(-23,snow?5:12,-23),new Vector3(23,snow?12:20,23)
    );
    return p;
  }

  update(frame:ClimateFrame):void{
    // Emitter follows camera, but already spawned droplets stay in world space.
    const pos=this.camera.globalPosition;
    this.emitter.copyFromFloats(pos.x,pos.y,pos.z);
    this.rain.emitRate=Math.round(400*frame.weatherMix.rain);
    this.snow.emitRate=Math.round(150*frame.weatherMix.snow);
    if(this.rain.emitRate>2&&!this.rainActive){this.rain.start();this.rainActive=true;}
    else if(this.rain.emitRate<=2&&this.rainActive){this.rain.stop();this.rainActive=false;}
    if(this.snow.emitRate>2&&!this.snowActive){this.snow.start();this.snowActive=true;}
    else if(this.snow.emitRate<=2&&this.snowActive){this.snow.stop();this.snowActive=false;}
  }

  dispose():void{
    this.rain.dispose();
    this.snow.dispose();
    this.rainTexture.dispose();
    this.snowTexture.dispose();
  }
}
