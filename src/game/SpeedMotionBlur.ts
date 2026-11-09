import { Camera, Effect, Engine, PostProcess, Texture } from '@babylonjs/core';
import { WaterOptics, WATER_OPTICS_GLSL } from '../world/water/WaterOptics';

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
uniform float immersion;
uniform float waterDepth;
uniform float waterTime;
${WATER_OPTICS_GLSL}
vec4 underwaterGrade(vec4 c,vec2 uv){
  if(waterOpticsWeight>0.0){
    c.rgb=throughWater(c.rgb,uv);
    return c;
  }
  float edge=smoothstep(.12,.72,length(vUV-vec2(.5)));
  // Absorb warm wavelengths across the whole view, including the swimmer in
  // the centre. Only distortion/vignetting is peripheral, not water colour.
  // Bounded optical depth keeps faces readable in the deepest cave pools.
  float opticalDepth=3.0+min(waterDepth,18.0)*.65;
  vec3 transmission=exp(-vec3(.075,.018,.005)*opticalDepth);
  vec3 filtered=mix(c.rgb*transmission,vec3(.035,.24,.28),
    .09+min(waterDepth,12.0)*.008);
  c.rgb=mix(c.rgb,filtered,immersion);
  c.rgb*=1.0-immersion*edge*.12;
  return c;
}
void main(void) {
  float edge=smoothstep(.12,.7,length(vUV-vec2(.5)));
  vec2 waterUV=clamp(waterRefractedUV(vUV)+vec2(sin(vUV.y*18.0+waterTime*.8),cos(vUV.x*16.0-waterTime*.65))*
    .0013*immersion*edge,vec2(.001),vec2(.999));
  if (blurAmount < 0.0005) {
    gl_FragColor = underwaterGrade(texture2D(textureSampler, waterUV),waterUV);
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
  gl_FragColor = underwaterGrade(vec4(mix(original.rgb, color.rgb, 0.75 * (1.0 - highlight)), original.a),vUV);
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
  private immersion=0;
  private waterDepth=0;
  private waterTime=0;
  private readonly optics:WaterOptics;

  constructor(private readonly camera:Camera,engine:Engine){
    this.optics=new WaterOptics(camera);
    Effect.ShadersStore[`${SHADER_NAME}FragmentShader`]=FRAGMENT_SHADER;
    this.postProcess=new PostProcess('desenfoque-de-impulso',SHADER_NAME,
      ['blurAmount','immersion','waterDepth','waterTime','waterOpticsWeight','waterLevel',
        'waterEye','waterInverseViewProjection','waterFlow','waterSlope'],['waterSceneDepth'],1,null,Texture.BILINEAR_SAMPLINGMODE,engine);
    this.postProcess.onApply=effect=>{
      effect.setFloat('blurAmount',this.amount);effect.setFloat('immersion',this.immersion);
      effect.setFloat('waterDepth',this.waterDepth);
      effect.setFloat('waterTime',this.waterTime);
      this.optics.bind(effect);
    };
  }

  triggerDoubleJump():void{this.envelope.triggerDoubleJump();}
  get active():boolean{return this.attached;}

  update(dt:number,sprinting:boolean,underwaterDepth?:number):void{
    this.amount=this.envelope.update(dt,sprinting);
    this.waterTime+=Math.min(dt,.1);
    if(underwaterDepth!==undefined)this.updateUnderwater(dt,underwaterDepth);
    else this.syncAttachment();
  }

  /** Called after camera collision/orbit resolution, together with water fog. */
  updateWaterSurface(dt:number,level:number|null,flowX=0,flowZ=0,slopeX=0,slopeZ=0):void{
    this.optics.update(level,flowX,flowZ,slopeX,slopeZ);
    this.updateUnderwater(dt,level===null?0:Math.max(0,level-this.camera.globalPosition.y));
  }

  updateUnderwater(dt:number,underwaterDepth:number):void{
    const target=Math.min(1,Math.max(0,(underwaterDepth-.05)/.8));
    const response=1-Math.exp(-Math.max(0,Math.min(dt,.1))*10);
    this.immersion+=(target-this.immersion)*response;
    this.waterDepth+=(Math.max(0,Math.min(underwaterDepth,24))-this.waterDepth)*response;
    this.syncAttachment();
  }

  private syncAttachment():void{
    if((this.amount>=.0005||this.immersion>.001||this.optics.active)&&!this.attached){
      this.camera.attachPostProcess(this.postProcess);
      this.attached=true;
    }else if(this.amount<.0005&&this.immersion<=.001&&!this.optics.active&&this.attached){
      this.camera.detachPostProcess(this.postProcess);
      this.attached=false;
    }
  }

  dispose():void{
    this.optics.dispose();
    if(this.attached)this.camera.detachPostProcess(this.postProcess);
    this.postProcess.dispose();
    this.attached=false;
  }
}
