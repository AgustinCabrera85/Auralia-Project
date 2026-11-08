import {
  Color3, Effect, Mesh, MeshBuilder, RawTexture, Scene, ShaderMaterial, Texture,
  Vector2, Vector3, type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame, RGB } from './ClimateModel';
import { CloudPieces } from './CloudPieces';
import { getAuraliaWind, type AuraliaWindState } from '../AuraliaWindSystem';
import { NOISE_CLOUD_FUNCTIONS } from './NoiseCloudShader';

type CloudRenderer = 'noise' | 'pieces';

/** The atmospheric sky is always drawn: only its cloud renderer is swappable. */
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
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uCloudColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uCloud;
uniform float uNight;
uniform float uFlash;
${NOISE_CLOUD_FUNCTIONS}

float hash31(vec3 p){
  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}

void main(void){
  vec3 d=normalize(vDirection);
  // At zero elevation the sky EXACTLY equals the scene fog color.
  float elevation=clamp(d.y,0.0,1.0);
  vec3 col=mix(uSkyHorizon,uSkyTop,smoothstep(.01,.93,elevation));
  float horizonHaze=1.0-smoothstep(.0,.22,elevation);
  col=mix(col,uSkyHorizon,horizonHaze*.56);

  // Stars, sun and moon remain world-aligned. Clouds occlude them below.
  vec3 cell=floor(d*290.0);
  vec3 intra=fract(d*290.0)-.5;
  float sparkle=step(.9992,hash31(cell))*(1.0-smoothstep(.11,.48,length(intra)));
  col+=vec3(.62,.78,1.0)*sparkle*uNight*.9;
  float towardSun=dot(d,normalize(uSunDir));
  float sunHalo=pow(max(towardSun,0.0),18.0)*.23+
    pow(max(towardSun,0.0),95.0)*.25;
  float sunDisc=smoothstep(.99930,.99965,towardSun);
  float sunCore=smoothstep(.99976,.99990,towardSun);
  col+=uSunColor*(sunHalo+sunDisc*.88+sunCore*.48)*(1.0-uNight);
  float towardMoon=dot(d,normalize(uMoonDir));
  float moonHalo=pow(max(towardMoon,0.0),28.0)*.15+
    pow(max(towardMoon,0.0),135.0)*.18;
  float moonDisc=smoothstep(.99928,.99964,towardMoon);
  float moonCore=smoothstep(.99975,.99991,towardMoon);
  col+=vec3(.70,.82,1.0)*(moonHalo+moonDisc*.72+moonCore*.30)*uNight;

  // Weather can tint the air without drawing a second family of cloud shapes.
  float weatherHaze=smoothstep(.65,.99,uCloud)*smoothstep(.0,.23,d.y);
  col=mix(col,uCloudColor*.72,weatherHaze*.18);

  // Ordered procedural cumulus masses are composed directly into the dome.
  // CloudPieces, when selected, draws separately and this returns sky.
  col=cloudField(d,col);

  col+=vec3(.65,.75,.95)*uFlash*.34;
  gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
}`;

const rgb=(v:RGB)=>new Color3(v[0],v[1],v[2]);
const smooth=(a:number,b:number,x:number)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};

/**
 * Keep the illustrated renderer as the default. The noise field remains an
 * explicit experiment with ?cloudRenderer=noise after visual comparison.
 *
 * ?cloudQuality=low|standard|high selects 4/6/8 depth samples and affects
 * performance, not procedural structure. Use ?climateDebug=1 to change
 * time/weather without modifying saved progress.
 */
export class SkyDome {
  private readonly dome:Mesh;
  private readonly material:ShaderMaterial;
  private readonly pieces:CloudPieces|null;
  private readonly noise:Texture|null;
  private readonly renderer:CloudRenderer;
  private readonly wind:AuraliaWindState;
  private readonly cloudFlow=new Vector2(0,0);
  private previousSeconds=0;
  private cloudAmount=-1;
  private stormAmount=0;
  private readonly sunDir=new Vector3(0,1,0);
  private readonly moonDir=new Vector3(0,-1,0);
  private readonly qualitySteps:number;
  private noiseReady=false;
  private disposed=false;
  private debugPanel:HTMLDivElement|null=null;
  private debugTimer=0;

  constructor(scene:Scene,private readonly camera:ArcRotateCamera){
    const params=new URLSearchParams(location.search);
    this.renderer=params.get('cloudRenderer')==='noise'?'noise':'pieces';
    const quality=params.get('cloudQuality');
    this.qualitySteps=quality==='low'?4:quality==='high'?8:6;
    this.wind=getAuraliaWind(scene);
    Effect.ShadersStore['auraliaClimateSkyVertexShader']=VERTEX_SHADER;
    Effect.ShadersStore['auraliaClimateSkyFragmentShader']=FRAGMENT_SHADER;
    this.material=new ShaderMaterial('auralia-climate-sky-mat',scene,
      {vertex:'auraliaClimateSky',fragment:'auraliaClimateSky'},
      {attributes:['position'],uniforms:[
        'worldViewProjection','uSkyTop','uSkyHorizon','uCloudColor','uSunColor',
        'uSunDir','uMoonDir','uCloud','uNight','uFlash',
        'uCloudEnabled','uCloudAmount','uCloudStorm','uCloudSteps',
        'uCloudSeconds','uCloudWind','uCloudFlow','uCloudDay','uCloudNight','uCloudTwilight'
      ],samplers:['uCloudField']});
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

    this.pieces=this.renderer==='pieces'?new CloudPieces(scene,camera):null;
    if(this.renderer==='noise'){
      this.noise=new Texture(
        '/assets/auralia-clouds/noise/cloud_field_rgba_512.png',
        scene,false,false,Texture.TRILINEAR_SAMPLINGMODE,
        ()=>{if(!this.disposed)this.noiseReady=true;},
        (_message,error)=>{
          if(!this.disposed)console.warn('[Auralia] No cargó el ruido de nubes.',error);
        });
      this.noise.wrapU=Texture.WRAP_ADDRESSMODE;
      this.noise.wrapV=Texture.WRAP_ADDRESSMODE;
      this.noise.anisotropicFilteringLevel=1;
      this.noise.gammaSpace=false;
      this.material.setTexture('uCloudField',this.noise);
    } else {
      // The sampler remains active in GLSL even when uCloudEnabled is zero.
      // Leaving it unset can reuse the postprocess input on texture unit 0,
      // causing a framebuffer feedback loop that drops the entire sky draw.
      this.noise=RawTexture.CreateRGBATexture(new Uint8Array([0,0,0,0]),
        1,1,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
      this.noise.name='auralia-sky-empty-cloud-field';
      this.noise.gammaSpace=false;
      this.material.setTexture('uCloudField',this.noise);
    }

    if(params.has('cloudDebug'))this.createDebugPanel();
  }

  update(frame:ClimateFrame,flash:number,animationSeconds:number):void{
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
    this.material.setFloat('uFlash',flash);

    this.pieces?.update(frame,animationSeconds);
    // Shared wind controller drives trees, grass and cloud field consistently.
    // Integrate travel: changing gust intensity must not multiply all elapsed
    // time and make the entire cloud field jump to a different position.
    const dt=Math.max(0,Math.min(.1,animationSeconds-this.previousSeconds));
    this.previousSeconds=animationSeconds;
    const travel=dt*(.000095+.00011*this.wind.effectiveStrength);
    this.cloudFlow.x+=this.wind.direction[0]*travel;
    this.cloudFlow.y+=this.wind.direction[1]*travel;
    const storm=smooth(.66,.99,frame.weatherMix.cloud)*
      smooth(.16,.51,frame.weatherMix.darken);
    if(this.cloudAmount<0){
      this.cloudAmount=frame.weatherMix.cloud;
      this.stormAmount=storm;
    }else{
      // Weather expands/unites the same bodies instead of fading their detail.
      const blend=1-Math.exp(-dt*2.0);
      this.cloudAmount+=(frame.weatherMix.cloud-this.cloudAmount)*blend;
      this.stormAmount+=(storm-this.stormAmount)*blend;
    }
    this.material.setFloat('uCloudEnabled',this.renderer==='noise'&&this.noiseReady?1:0);
    this.material.setFloat('uCloudAmount',this.cloudAmount);
    this.material.setFloat('uCloudStorm',this.stormAmount);
    this.material.setFloat('uCloudSteps',this.qualitySteps);
    this.material.setFloat('uCloudSeconds',animationSeconds%86400);
    this.material.setFloat('uCloudWind',this.wind.effectiveStrength);
    this.material.setVector2('uCloudFlow',this.cloudFlow);
    this.material.setFloat('uCloudDay',frame.dayLight);
    this.material.setFloat('uCloudNight',frame.night);
    this.material.setFloat('uCloudTwilight',frame.twilight);

    if(this.debugPanel){
      this.debugTimer+=dt;
      if(this.debugTimer>=.48){
        this.debugTimer=0;
        this.debugPanel.textContent=
          `Nubes: ${this.renderer} · ${this.qualitySteps} pasos · `+
          `ruido ${this.noiseReady?'cargado':'pendiente'} · `+
          `cobertura ${Math.round(this.cloudAmount*100)}% · `+
          `tormenta ${Math.round(this.stormAmount*100)}%`;
      }
    }
  }

  private createDebugPanel():void{
    const panel=document.createElement('div');
    panel.style.cssText='position:fixed;left:12px;top:70px;z-index:1100;'+
      'background:#152839df;color:#f9f5e5;font:12px monospace;'+
      'padding:8px 10px;border-radius:8px;pointer-events:none';
    panel.textContent=`Nubes ${this.renderer} · ${this.qualitySteps} pasos`;
    document.body.appendChild(panel);
    this.debugPanel=panel;
  }

  dispose():void{
    this.disposed=true;
    this.debugPanel?.remove();
    this.pieces?.dispose();
    this.noise?.dispose();
    this.dome.dispose(false,false);
    this.material.dispose(false,false);
  }
}
