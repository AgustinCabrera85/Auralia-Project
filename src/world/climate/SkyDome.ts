import {
  Color3, Effect, Engine, Mesh, MeshBuilder, RawTexture, Scene, ShaderMaterial,
  Texture, Vector3, type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame, RGB } from './ClimateModel';

/**
 * The illustrated cloud atlas is DRAWN in memory once, not loaded from an image.
 * R = rounded cloud silhouettes assembled from overlapping puffs.
 * G = soft, low-frequency atmospheric variation. B = fine edge erosion.
 * 256x256 RGBA, 256 KiB uncompressed on the GPU; shared by both cloud layers.
 */
function makeCloudNoise(scene:Scene):RawTexture{
  const size=256;
  const data=new Uint8Array(size*size*4);
  const silhouettes=new Float32Array(size*size);
  let seed=0x2f674f9d;
  const random=():number=>{
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;
  };
  const clamp=(v:number)=>Math.max(0,Math.min(1,v));
  const smooth=(v:number)=>v*v*(3-2*v);
  const hash=(x:number,y:number):number=>{
    let n=Math.imul(x,374761393)+Math.imul(y,668265263)+0x5f3759df;
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967296;
  };
  function noise(x:number,y:number,frequency:number):number{
    const gx=x*frequency,gy=y*frequency;
    const ix=Math.floor(gx),iy=Math.floor(gy),tx=smooth(gx-ix),ty=smooth(gy-iy);
    const wrap=(i:number)=>(i%frequency+frequency)%frequency;
    const a=hash(wrap(ix),wrap(iy)),b=hash(wrap(ix+1),wrap(iy));
    const c=hash(wrap(ix),wrap(iy+1)),d=hash(wrap(ix+1),wrap(iy+1));
    return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
  }

  // Rasterize a softly beveled ellipse, wrapping at tile edges. The union of
  // these puffs creates recognizable, scalloped cloud masses rather than FBM smears.
  const puff=(cx:number,cy:number,rx:number,ry:number,strength:number):void=>{
    const x0=Math.floor((cx-rx*1.19)*size)-1;
    const x1=Math.ceil((cx+rx*1.19)*size)+1;
    const y0=Math.floor((cy-ry*1.19)*size)-1;
    const y1=Math.ceil((cy+ry*1.19)*size)+1;
    for(let y=y0;y<=y1;y++){
      const ny=((y+.5)/size-cy)/ry;
      if(Math.abs(ny)>=1.19)continue;
      const row=((y%size+size)%size)*size;
      for(let x=x0;x<=x1;x++){
        const nx=((x+.5)/size-cx)/rx;
        const d=Math.hypot(nx,ny);
        if(d>=1.19)continue;
        // Solid, rounded centers with a small soft border for antialiasing.
        const value=smooth(clamp((1.19-d)/.45))*strength;
        const index=row+(x%size+size)%size;
        if(value>silhouettes[index])silhouettes[index]=value;
      }
    }
  };
  for(let n=0;n<46;n++){
    const x=random(),y=random();
    const radius=.022+random()*.035;
    const height=radius*(.58+random()*.30);
    const weight=.73+random()*.27;
    puff(x,y,radius*1.38,height*.76,weight*.94);
    const lobes=4+Math.floor(random()*5);
    for(let i=0;i<lobes;i++){
      puff(x+(random()*2-1)*radius*.92,
        y+(random()*.95-.35)*height,
        radius*(.43+random()*.39),height*(.56+random()*.48),
        weight*(.91+random()*.09));
    }
  }

  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    let broad=0,weight=0,amplitude=1;
    for(const frequency of [4,8,16,32]){
      broad+=noise(u,v,frequency)*amplitude;
      weight+=amplitude;
      amplitude*=.51;
    }
    broad/=weight;
    const index=(y*size+x)*4;
    data[index]=Math.round(clamp(silhouettes[y*size+x])*255);
    data[index+1]=Math.round(clamp(broad)*255);
    data[index+2]=Math.round(clamp(noise(u,v,64))*255);
    data[index+3]=255;
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
  // At zero elevation we must EXACTLY match the scene fog colour; otherwise
  // the ocean and far-distance terrain reveal a straight horizontal seam.
  float elevation=clamp(d.y,0.0,1.0);
  vec3 col=mix(uSkyHorizon,uSkyTop,smoothstep(.01,.93,elevation));
  float horizonHaze=1.0-smoothstep(.0,.22,elevation);
  col=mix(col,uSkyHorizon,horizonHaze*.56);

  // Stable stars, sun and moon remain tied to world direction, not the camera.
  vec3 cell=floor(d*290.0);
  vec3 intra=fract(d*290.0)-.5;
  float sparkle=step(.9992,hash31(cell))*(1.0-smoothstep(.11,.48,length(intra)));
  col+=vec3(.62,.78,1.0)*sparkle*uNight*.9;
  float towardSun=dot(d,normalize(uSunDir));
  // Two soft halo scales frame a deliberately painted, readable solar disc.
  float sunHalo=pow(max(towardSun,0.0),18.0)*.23+
    pow(max(towardSun,0.0),95.0)*.25;
  float sunDisc=smoothstep(.99930,.99965,towardSun);
  float sunCore=smoothstep(.99976,.99990,towardSun);
  col+=uSunColor*(sunHalo+sunDisc*.88+sunCore*.48)*(1.0-uNight);
  float towardMoon=dot(d,normalize(uMoonDir));
  // The moon has a wider cool glow, but its light disappears during the day.
  float moonHalo=pow(max(towardMoon,0.0),28.0)*.15+
    pow(max(towardMoon,0.0),135.0)*.18;
  float moonDisc=smoothstep(.99928,.99964,towardMoon);
  float moonCore=smoothstep(.99975,.99991,towardMoon);
  col+=vec3(.70,.82,1.0)*(moonHalo+moonDisc*.72+moonCore*.30)*uNight;

  // Even clear weather keeps a few illustrated puffs and a faint upper veil.
  if(uCloud>.02){
    // Project onto a curved sky plane (no camera-facing billboards, no textures
    // scrolling across the screen). Two strata travel at different speeds.
    vec2 plane=d.xz/max(.24,d.y+.46);
    float breeze=.40+uWind;
    vec2 flow=uTime*vec2(.00050,.00019)*breeze;
    vec2 flowBack=uTime*vec2(-.00024,.00015)*(.55+uWind*.55);

    // Slowly moving domain warp continuously evolves EVERY silhouette, while
    // the atlas retains a drawn, rounded topology. No geometry is regenerated.
    vec2 warp=texture2D(uCloudNoise,plane*.16+flow*.28+vec2(.31,.17)).gb-.5;
    vec2 warpBack=texture2D(uCloudNoise,plane*.25-flowBack*.18+vec2(.61,.54)).gb-.5;
    vec2 breathing=vec2(
      sin(uTime*.083+plane.y*2.7),
      cos(uTime*.061+plane.x*2.4));
    vec2 nearUV=plane*.29+flow+vec2(.27,.31)+warp*.085+breathing*.010;
    // The upper veil is stretched and drifts across the cumulus layer.
    vec2 farUV=plane*vec2(.39,.17)+flowBack+vec2(.56,.22)+warpBack*.035;
    vec4 nearShape=texture2D(uCloudNoise,nearUV);
    vec4 farShape=texture2D(uCloudNoise,farUV);
    float detail=texture2D(uCloudNoise,nearUV*2.9+flowBack*.7).b;
    float shape=nearShape.r+(nearShape.g-.5)*.085+(detail-.5)*.10;
    float threshold=mix(.90,.36,clamp(uCloud,0.0,1.0));
    // Cohesive formation/dissolution, not a uniform sliding alpha texture.
    threshold+=.038*sin(uTime*.10+nearShape.g*6.283);
    float cloudMask=smoothstep(threshold-.075,threshold+.065,shape);
    float veilField=farShape.g+(farShape.r-.5)*.15+(farShape.b-.5)*.06;
    float veilMask=smoothstep(mix(.69,.51,uCloud),mix(.82,.66,uCloud),veilField);
    float skyVisibility=smoothstep(-.015,.21,d.y);

    // Weather fronts provide a continuous cloud layer only when strongly
    // overcast. Illustrated puffs still project above the dark cloud deck.
    float deckStrength=smoothstep(.68,.98,uCloud);
    float deckNoise=texture2D(uCloudNoise,plane*.13+flow*.22+vec2(.25,.6)).g;
    vec3 deckColor=uCloudColor*(.63+.18*deckNoise);
    col=mix(col,deckColor,deckStrength*(.79+.20*deckNoise)*skyVisibility);

    // Density differences give each painted puff a cheap pseudo-normal.
    float sampleX=texture2D(uCloudNoise,nearUV+vec2(.006,0.0)).r;
    float sampleY=texture2D(uCloudNoise,nearUV+vec2(0.0,.006)).r;
    vec2 gradient=vec2(nearShape.r-sampleX,nearShape.r-sampleY);
    float bulge=smoothstep(threshold+.02,.97,shape);
    vec3 pseudoNormal=normalize(vec3(gradient.x*7.0,.42+bulge*.65,
      gradient.y*7.0));
    vec3 lightDir=normalize((1.0-uNight)*uSunDir+uNight*uMoonDir+
      vec3(0.0,.20,0.0));
    float upperLight=clamp(dot(pseudoNormal,lightDir),0.0,1.0);
    float lowerShade=1.0-smoothstep(.05,.32,d.y);
    float innerShade=(.53+.22*upperLight+.20*bulge-.12*lowerShade)*
      mix(1.0,.78,smoothstep(.72,1.0,uCloud));
    // Thin luminous edges keep the soft illustration, with stronger backlight.
    float edge=smoothstep(.025,.11,length(gradient))*
      (1.0-smoothstep(threshold+.04,threshold+.20,shape));
    float rim=edge*(.28+.72*pow(max(dot(d,lightDir),0.0),4.0));
    vec3 lightTint=mix(vec3(.59,.72,.96),uSunColor,1.0-uNight);
    vec3 painted=uCloudColor*innerShade+lightTint*rim*.19;
    // Warm edges at sunset but never permanently orange during daylight.
    float sunset=1.0-smoothstep(.11,.48,abs(uSunDir.y));
    painted=mix(painted,painted*.75+uSunColor*.25,sunset*.27*(1.0-uNight));

    col=mix(col,uCloudColor*(.78+.12*farShape.g),
      veilMask*(.11+.27*uCloud)*skyVisibility);
    col=mix(col,painted,cloudMask*.97*skyVisibility);
  }
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
