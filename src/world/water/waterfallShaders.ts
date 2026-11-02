import { Effect } from '@babylonjs/core';

/** GLSL 100 waterfall surface; UV.y is accumulated distance down the drop. */
export function registerWaterfallShaders():void{
  if(Effect.ShadersStore.auraliaWaterfallVertexShader)return;
  Effect.ShadersStore.auraliaWaterfallVertexShader=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vPathUV;
varying vec4 vInfo;
void main(void){
  float bankSink=smoothstep(.35,.98,color.r)*.05;
  vec3 local=position-vec3(0.0,bankSink,0.0);
  vWorldPos=(world*vec4(local,1.0)).xyz;
  vNormal=normalize(mat3(world)*normal);
  vPathUV=uv;
  vInfo=color;
  gl_Position=worldViewProjection*vec4(local,1.0);
}`;
  Effect.ShadersStore.auraliaWaterfallFragmentShader=`
precision highp float;
uniform sampler2D uNormals;
uniform sampler2D uFoamNoise;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vPathUV;
varying vec4 vInfo;
void main(void){
  float shore=clamp(vInfo.r,0.0,1.0);
  if(shore>.96)discard;
  vec2 path=vec2(vPathUV.x*.09,vPathUV.y*.105-uTime*.24);
  vec2 crossFlow=vec2(-vPathUV.x*.17+uTime*.013,vPathUV.y*.16-uTime*.13);
  vec2 ripple=texture2D(uNormals,path).xy*2.0-1.0;
  ripple+=.42*(texture2D(uNormals,crossFlow).xy*2.0-1.0);
  vec3 normal=normalize(vNormal+vec3(ripple.x*.18,0.0,ripple.y*.18));
  vec3 viewDir=normalize(uCameraPosition-vWorldPos);
  vec3 lightDir=normalize(uSunDirection);
  float fresnel=pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),5.0);
  float depth=clamp(vInfo.g,0.0,1.0);
  vec3 water=mix(vec3(.055,.32,.35),vec3(.018,.18,.27),smoothstep(.02,.45,depth));
  vec3 sky=mix(vec3(.57,.75,.78),vec3(.30,.54,.69),clamp(normal.y,0.0,1.0));
  water=mix(water,sky,.12+.48*fresnel);
  vec3 halfVector=normalize(lightDir+viewDir);
  water+=pow(max(dot(normal,halfVector),0.0),95.0)*vec3(1.0,.89,.76)*.57;
  float noise=texture2D(uFoamNoise,path*.74).r;
  float impact=clamp(vInfo.b,0.0,1.0);
  float foam=clamp(.12+.36*smoothstep(.42,.75,noise)+impact*.27+shore*.15,0.0,.78);
  water=mix(water,vec3(.78,.94,.89),foam);
  float distanceToCamera=distance(uCameraPosition,vWorldPos);
  float fog=1.0-exp(-pow(uFogDensity*distanceToCamera,2.0));
  water=mix(water,uFogColor,clamp(fog,0.0,.97));
  gl_FragColor=vec4(water,1.0);
}`;
}
