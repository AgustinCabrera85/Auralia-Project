import {
  Color3, Effect, Mesh, MeshBuilder, Scene, ShaderMaterial,
  Vector3, type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame, RGB } from './ClimateModel';
import { CloudPieces } from './CloudPieces';

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

  // Weather can tint the air without drawing a second family of cloud shapes.
  float weatherHaze=smoothstep(.65,.99,uCloud)*smoothstep(.0,.23,d.y);
  col=mix(col,uCloudColor*.72,weatherHaze*.18);

  col+=vec3(.65,.75,.95)*uFlash*.34;
  gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
}`;

const rgb=(v:RGB)=>new Color3(v[0],v[1],v[2]);

/** Atmospheric backdrop and celestial discs behind the illustrated formations. */
export class SkyDome {
  private readonly dome:Mesh;
  private readonly material:ShaderMaterial;
  private readonly pieces:CloudPieces;
  private readonly sunDir=new Vector3(0,1,0);
  private readonly moonDir=new Vector3(0,-1,0);

  constructor(scene:Scene,private readonly camera:ArcRotateCamera){
    // Shader names must not collide with game / shader laboratory names.
    Effect.ShadersStore['auraliaClimateSkyVertexShader']=VERTEX_SHADER;
    Effect.ShadersStore['auraliaClimateSkyFragmentShader']=FRAGMENT_SHADER;
    this.material=new ShaderMaterial('auralia-climate-sky-mat',scene,
      {vertex:'auraliaClimateSky',fragment:'auraliaClimateSky'},
      {attributes:['position'],uniforms:[
        'worldViewProjection','uSkyTop','uSkyHorizon','uCloudColor','uSunColor',
        'uSunDir','uMoonDir','uCloud','uNight','uFlash'
      ]});
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
    this.pieces=new CloudPieces(scene,camera);
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
    this.material.setFloat('uFlash',flash);
    this.pieces.update(frame,animationSeconds);
  }

  dispose():void{
    this.dome.dispose(false,false);
    this.material.dispose(false,false);
    this.pieces.dispose();
  }
}
