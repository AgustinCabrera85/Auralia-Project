import {
  Color3, Effect, Engine, Mesh, MeshBuilder, RawTexture, Scene, ShaderMaterial,
  Texture, Vector3, type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame, RGB } from './ClimateModel';

/** Shared, 256px procedural noise texture; no downloadable skyboxes or heavy images. */
function makeCloudNoise(scene:Scene):RawTexture{
  const size=256, data=new Uint8Array(size*size*4);
  const hash=(x:number,y:number):number=>{
    let n=Math.imul(x,374761393)+Math.imul(y,668265263)+0x5f3759df;
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967296;
  };
  const smooth=(t:number)=>t*t*(3-2*t);
  function noise(x:number,y:number,frequency:number):number{
    const gx=x*frequency,gy=y*frequency;
    const ix=Math.floor(gx),iy=Math.floor(gy),tx=smooth(gx-ix),ty=smooth(gy-iy);
    const wrap=(i:number)=>(i%frequency+frequency)%frequency;
    const a=hash(wrap(ix),wrap(iy)),b=hash(wrap(ix+1),wrap(iy));
    const c=hash(wrap(ix),wrap(iy+1)),d=hash(wrap(ix+1),wrap(iy+1));
    return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    let n=0,amp=0,scale=1;
    for(const frequency of [4,8,16,32,64]){
      n+=noise(u,v,frequency)*scale;
      amp+=scale;scale*=.51;
    }
    n/=amp;
    const offset=(y*size+x)*4;
    data[offset]=Math.round(n*255);
    data[offset+1]=Math.round(noise(u,v,16)*255);
    data[offset+2]=Math.round(noise(u,v,32)*255);
    data[offset+3]=255;
  }
  const texture=new RawTexture(data,size,size,Engine.TEXTUREFORMAT_RGBA,
    scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU=Texture.WRAP_ADDRESSMODE;
  texture.wrapV=Texture.WRAP_ADDRESSMODE;
  return texture;
}

const VERTEX_SHADER=`
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;
void main(void){
  vDirection=normalize(position);
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;

const FRAGMENT_SHADER=`
precision highp float;
varying vec3 vDirection;
uniform sampler2D uCloudNoise;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uCloudColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uCloud;
uniform float uNight;
uniform float uTime;
uniform float uWind;
uniform float uFlash;
float hash31(vec3 p){
 p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
void main(void){
 vec3 d=normalize(vDirection);
 float high=clamp((d.y+.12)/1.08,0.0,1.0);
 vec3 col=mix(uSkyHorizon,uSkyTop,smoothstep(0.0,1.0,high));

 // Night sky: fixed stars in direction space, rather than screen-space flicker.
 vec3 cell=floor(d*290.0);
 vec3 intra=fract(d*290.0)-.5;
 float sparkle=step(.9992,hash31(cell))*(1.0-smoothstep(.11,.48,length(intra)));
 col+=vec3(.62,.78,1.0)*sparkle*uNight*.9;

 float towardSun=dot(d,normalize(uSunDir));
 float halo=pow(max(towardSun,0.0),55.0);
 float disc=smoothstep(.99972,.99988,towardSun);
 col+=uSunColor*(halo*.28+disc*1.2)*(1.0-uNight);
 float towardMoon=dot(d,normalize(uMoonDir));
 float moon=smoothstep(.99972,.99991,towardMoon);
 float moonGlow=pow(max(0.0,towardMoon),120.0)*.12;
 col+=vec3(.68,.81,1.0)*(moon*.9+moonGlow)*uNight;

 // Animated cloud formation: two moving strata + a slowly evolving warp field.
 // Noise is generated at startup; no cloud images are downloaded.
 vec2 proj=d.xz/max(.15,d.y+.34);
 vec2 wind=vec2(.00043,.00018)*uTime*(.35+uWind);
 vec2 swirl=texture2D(uCloudNoise,proj*.21+wind*.18).gb-.5;
 vec2 warped=proj*.33+wind+swirl*.13;
 float broad=texture2D(uCloudNoise,warped).r;
 float detail=texture2D(uCloudNoise,proj*.61-wind*.54+swirl.yx*.055).g;
 float growth=texture2D(uCloudNoise,proj*.13+wind*.26).r;
 float field=broad*.69+detail*.19+growth*.12;
 float threshold=mix(.88,.35,uCloud);
 float coverage=smoothstep(threshold,threshold+.13,field);
 coverage*=smoothstep(-.24,.02,d.y);
 float scatter=pow(max(towardSun,0.0),8.0)*(.1+.2*(1.0-uNight));
 vec3 litCloud=uCloudColor+uSunColor*scatter;
 col=mix(col,litCloud,coverage*.98);
 col+=vec3(.65,.75,.95)*uFlash*.34;
 gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
}`;

const rgb=(v:RGB)=>new Color3(v[0],v[1],v[2]);

/** One dome / one tiny GPU texture; keeps its own horizon aligned with scene fog. */
export class SkyDome {
  private readonly dome:Mesh;
  private readonly material:ShaderMaterial;
  private readonly noise:RawTexture;
  private readonly sunDir=new Vector3(0,1,0);
  private readonly moonDir=new Vector3(0,-1,0);

  constructor(scene:Scene,private readonly camera:ArcRotateCamera){
    // Shader names must not collide with game / shader laboratory names.
    Effect.ShadersStore['auraliaClimateSkyVertexShader']=VERTEX_SHADER;
    Effect.ShadersStore['auraliaClimateSkyFragmentShader']=FRAGMENT_SHADER;
    this.noise=makeCloudNoise(scene);
    this.material=new ShaderMaterial('auralia-climate-sky-mat',scene,
      {vertex:'auraliaClimateSky',fragment:'auraliaClimateSky'},
      {attributes:['position'],uniforms:[
        'worldViewProjection','uSkyTop','uSkyHorizon','uCloudColor','uSunColor',
        'uSunDir','uMoonDir','uCloud','uNight','uTime','uWind','uFlash'
      ],samplers:['uCloudNoise']});
    this.material.setTexture('uCloudNoise',this.noise);
    this.material.backFaceCulling=false;
    this.material.disableDepthWrite=true;
    this.material.fogEnabled=false;
    this.dome=MeshBuilder.CreateSphere('auralia-climate-sky-dome',
      {diameter:3680,segments:24,sideOrientation:Mesh.BACKSIDE},scene);
    this.dome.material=this.material;
    this.dome.isPickable=false;
    this.dome.checkCollisions=false;
    this.dome.alwaysSelectAsActiveMesh=true;
    this.dome.applyFog=false;
  }

  update(frame:ClimateFrame,flash:number,animationSeconds:number):void{
    // Camera-relative dome is never streamed with chunks.
    this.dome.position.copyFrom(this.camera.globalPosition);
    this.sunDir.copyFromFloats(...frame.sunDirection);
    this.moonDir.copyFrom(this.sunDir).scaleInPlace(-1);
    this.material.setColor3('uSkyTop',rgb(frame.skyTop));
    this.material.setColor3('uSkyHorizon',rgb(frame.skyHorizon));
    this.material.setColor3('uCloudColor',rgb(frame.cloudColor));
    this.material.setColor3('uSunColor',rgb(frame.sunColor));
    this.material.setVector3('uSunDir',this.sunDir);
    this.material.setVector3('uMoonDir',this.moonDir);
    this.material.setFloat('uCloud',frame.weatherMix.cloud);
    this.material.setFloat('uNight',frame.night);
    this.material.setFloat('uWind',frame.weatherMix.wind);
    // Keep time precision bounded even after long saves.
    this.material.setFloat('uTime',animationSeconds%86400);
    this.material.setFloat('uFlash',flash);
  }

  dispose():void{
    this.dome.dispose(false,false);
    this.material.dispose(false,false);
    this.noise.dispose();
  }
}
