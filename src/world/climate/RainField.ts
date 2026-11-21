import { Effect, Mesh, Scene, ShaderMaterial, Vector2, Vector3, VertexBuffer, VertexData,
  type ArcRotateCamera } from '@babylonjs/core';
import type { ClimateFrame } from './ClimateModel';

const COUNT=1024,SHADER='auraliaRainField';
const VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 rainSeed;
uniform mat4 viewProjection;
uniform vec3 eye;
uniform vec3 cameraRight;
uniform float clock;
uniform float density;
uniform float wind;
uniform vec2 drift;
varying vec2 vUV;
varying float vAlpha;
void main(){
  float speed=19.0+floor(rainSeed.x*15.0);
  vec3 velocity=vec3(1.8*wind,-speed,0.7*wind);
  vec3 span=vec3(56.0,30.0,56.0);
  vec3 center=mod(position+vec3(drift.x,-speed*clock,drift.y)-eye+span*0.5,span)+eye-span*0.5;
  float distanceToEye=length(center-eye);
  float fade=smoothstep(0.8,2.5,distanceToEye)*(1.0-smoothstep(17.0,27.0,distanceToEye));
  float visible=step(rainSeed.w,density);
  float width=mix(0.008,0.019,rainSeed.y);
  float streak=mix(0.35,1.05,rainSeed.z)*(0.8+wind*0.35);
  vec3 p=center+cameraRight*(uv.x-0.5)*width+normalize(velocity)*(uv.y-0.5)*streak;
  vUV=uv;vAlpha=fade*visible*mix(0.23,0.52,rainSeed.y);
  gl_Position=viewProjection*vec4(p,1.0);
}`;
const FRAGMENT=`
precision highp float;
varying vec2 vUV;
varying float vAlpha;
uniform float daylight;
void main(){
  float across=1.0-abs(vUV.x*2.0-1.0);
  float along=smoothstep(0.0,0.18,vUV.y)*(1.0-smoothstep(0.65,1.0,vUV.y));
  float alpha=across*along*vAlpha;
  if(alpha<0.008)discard;
  gl_FragColor=vec4(mix(vec3(0.37,0.48,0.64),vec3(0.72,0.81,0.88),daylight),alpha);
}`;

/** A fixed rain volume: one draw, no particle simulation, textures or per-drop CPU updates. */
export class RainField {
  private readonly mesh:Mesh;
  private readonly material:ShaderMaterial;
  private readonly right=new Vector3();
  private readonly drift=new Vector2();
  private clock=0;
  private disposed=false;
  constructor(scene:Scene,private readonly camera:ArcRotateCamera){
    Effect.ShadersStore[SHADER+'VertexShader']=VERTEX;
    Effect.ShadersStore[SHADER+'FragmentShader']=FRAGMENT;
    const positions=new Float32Array(COUNT*12),uvs=new Float32Array(COUNT*8);
    const seeds=new Float32Array(COUNT*16),indices=new Uint16Array(COUNT*6);
    let state=8191;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    for(let i=0;i<COUNT;i++){
      const x=random()*56,y=random()*30,z=random()*56;
      const seed=[random(),random(),random(),random()];
      for(let v=0;v<4;v++){
        positions.set([x,y,z],i*12+v*3);uvs.set([v&1,v>>1],i*8+v*2);
        seeds.set(seed,i*16+v*4);
      }
      indices.set([i*4,i*4+1,i*4+2,i*4+2,i*4+1,i*4+3],i*6);
    }
    this.mesh=new Mesh('auralia-rain-field',scene);
    const data=new VertexData();data.positions=positions;data.uvs=uvs;data.indices=indices;data.applyToMesh(this.mesh);
    this.mesh.setVerticesBuffer(new VertexBuffer(scene.getEngine(),seeds,'rainSeed',false,false,4));
    this.material=new ShaderMaterial('auralia-rain-field-material',scene,{vertex:SHADER,fragment:SHADER},{
      attributes:['position','uv','rainSeed'],uniforms:['viewProjection','eye','cameraRight','clock','density','wind','drift','daylight'],
      needAlphaBlending:true
    });
    this.material.backFaceCulling=false;this.material.disableDepthWrite=true;
    this.mesh.material=this.material;this.mesh.isPickable=false;this.mesh.checkCollisions=false;
    this.mesh.alwaysSelectAsActiveMesh=true;this.mesh.setEnabled(false);
  }
  update(frame:ClimateFrame,sheltered:boolean,dt:number):void{
    if(this.disposed)return;
    const strength=Number.isFinite(frame.weatherMix.rain)?Math.max(0,Math.min(1,frame.weatherMix.rain)):0;
    this.mesh.setEnabled(!sheltered&&strength>.005);
    if(!this.mesh.isEnabled())return;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    // Integer speeds wrap exactly every 30 seconds; keep long-session floats small.
    this.clock=(this.clock+step)%30;
    this.drift.x=(this.drift.x+1.8*frame.weatherMix.wind*step)%56;
    this.drift.y=(this.drift.y+.7*frame.weatherMix.wind*step)%56;
    const view=this.camera.getViewMatrix().m;
    this.right.set(view[0],view[4],view[8]);
    this.material.setVector3('eye',this.camera.globalPosition);
    this.material.setVector3('cameraRight',this.right);
    this.material.setFloat('clock',this.clock);
    this.material.setFloat('density',strength);
    this.material.setFloat('wind',frame.weatherMix.wind);
    this.material.setVector2('drift',this.drift);
    this.material.setFloat('daylight',frame.dayLight);
  }
  get stats(){return {active:this.mesh.isEnabled(),streaks:COUNT,drawCalls:this.mesh.isEnabled()?1:0,particles:0,textures:0};}
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.mesh.dispose();this.material.dispose();
  }
}
