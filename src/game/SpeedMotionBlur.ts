import { Camera, Effect, Engine, PostProcess, Texture } from '@babylonjs/core';

const SHADER_NAME='auraliaSpeedMotionBlur';
const DOUBLE_JUMP_SECONDS=.24;
const DOUBLE_JUMP_STRENGTH=.07;
const SPRINT_STRENGTH=.009;

// A short zoom streak makes the second jump read as an impulse even when the
// camera is stationary. The smaller sprint value stays below the jump burst.
const FRAGMENT_SHADER=`
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float blurAmount;
void main(void) {
  if (blurAmount < 0.0005) {
    gl_FragColor = texture2D(textureSampler, vUV);
    return;
  }
  vec2 streak = (vUV - vec2(0.5)) * blurAmount;
  vec4 original = texture2D(textureSampler, vUV);
  vec4 color = original * 0.20;
  color += texture2D(textureSampler, clamp(vUV - streak * 0.18, vec2(0.001), vec2(0.999))) * 0.17;
  color += texture2D(textureSampler, clamp(vUV - streak * 0.36, vec2(0.001), vec2(0.999))) * 0.16;
  color += texture2D(textureSampler, clamp(vUV - streak * 0.54, vec2(0.001), vec2(0.999))) * 0.16;
  color += texture2D(textureSampler, clamp(vUV - streak * 0.72, vec2(0.001), vec2(0.999))) * 0.16;
  color += texture2D(textureSampler, clamp(vUV - streak, vec2(0.001), vec2(0.999))) * 0.15;
  // The solar disc is a bright detail drawn in the sky texture. Keep its
  // original core rather than averaging it away across the blur taps.
  float brightness = max(original.r, max(original.g, original.b));
  float highlight = smoothstep(0.72, 0.98, brightness);
  gl_FragColor = vec4(mix(original.rgb, color.rgb, 0.75 * (1.0 - highlight)), original.a);
}`;

export class SpeedBlurEnvelope {
  private jumpTime=0;
  private sprintBlend=0;

  triggerDoubleJump():void{this.jumpTime=DOUBLE_JUMP_SECONDS;}

  update(dt:number,sprinting:boolean):number{
    const frame=Math.max(0,Math.min(dt,.1));
    this.jumpTime=Math.max(0,this.jumpTime-frame);
    const target=sprinting?1:0;
    const response=1-Math.exp(-frame/(sprinting?.12:.16));
    this.sprintBlend+=(target-this.sprintBlend)*response;
    const jump=this.jumpTime/DOUBLE_JUMP_SECONDS;
    return Math.min(.08,DOUBLE_JUMP_STRENGTH*jump*jump+
      SPRINT_STRENGTH*this.sprintBlend);
  }
}

export class SpeedMotionBlur {
  private readonly envelope=new SpeedBlurEnvelope();
  private readonly postProcess:PostProcess;
  private attached=false;
  private amount=0;

  constructor(private readonly camera:Camera,engine:Engine){
    Effect.ShadersStore[`${SHADER_NAME}FragmentShader`]=FRAGMENT_SHADER;
    this.postProcess=new PostProcess('desenfoque-de-impulso',SHADER_NAME,
      ['blurAmount'],null,1,null,Texture.BILINEAR_SAMPLINGMODE,engine);
    this.postProcess.onApply=effect=>effect.setFloat('blurAmount',this.amount);
  }

  triggerDoubleJump():void{this.envelope.triggerDoubleJump();}
  get active():boolean{return this.attached;}

  update(dt:number,sprinting:boolean):void{
    this.amount=this.envelope.update(dt,sprinting);
    if(this.amount>=.0005&&!this.attached){
      this.camera.attachPostProcess(this.postProcess);
      this.attached=true;
    }else if(this.amount<.0005&&this.attached){
      this.camera.detachPostProcess(this.postProcess);
      this.attached=false;
    }
  }

  dispose():void{
    if(this.attached)this.camera.detachPostProcess(this.postProcess);
    this.postProcess.dispose();
    this.attached=false;
  }
}
