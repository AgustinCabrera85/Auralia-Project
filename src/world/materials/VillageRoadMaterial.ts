import { Color3, DirectionalLight, Effect, HemisphericLight, Scene, ShaderMaterial, Texture, Vector3 } from '@babylonjs/core';
import { bindCharacterShadow, CHARACTER_SHADOW_GLSL, CHARACTER_SHADOW_UNIFORMS } from './CharacterShadowSampling';

const SHADER='auraliaVillageRoad';
Effect.ShadersStore[`${SHADER}VertexShader`]=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vPosition;
varying vec2 vUV;
varying vec4 vColor;
void main(){
 vPosition=(world*vec4(position,1.0)).xyz;vUV=uv;vColor=color;
 gl_Position=worldViewProjection*vec4(position,1.0);
}`;
Effect.ShadersStore[`${SHADER}FragmentShader`]=`
precision highp float;
varying vec3 vPosition;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D soil;
uniform sampler2D gravel;
uniform sampler2D relief;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform vec3 cameraPosition;
uniform vec3 fogColor;
uniform float fogDensity;
${CHARACTER_SHADOW_GLSL}
void main(){
 if(vColor.a<.005)discard;
 vec3 dirt=texture2D(soil,vUV).rgb;
 vec3 stone=texture2D(gravel,vUV*.83+vec2(.37,.19)).rgb;
 // A sparse gravel contribution, stronger along the worn shoulders.
 float stones=smoothstep(.30,.49,dot(stone,vec3(.30,.59,.11)))*vColor.b;
 vec3 albedo=mix(dirt,stone,stones)*vColor.r;
 float distanceToCamera=distance(cameraPosition,vPosition);
 vec2 bump=(texture2D(relief,vUV).rg*2.0-1.0)*.22*(1.0-smoothstep(35.0,95.0,distanceToCamera));
 vec3 N=normalize(vec3(bump.x,1.0,-bump.y));
 vec3 lit=albedo*(ambientColor+sunColor*max(dot(N,sunDirection),0.0)*characterSunVisibility(vPosition));
 float fog=1.0-exp(-pow(distanceToCamera*fogDensity,2.0));
 gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,1.0)),vColor.a);
}`;

/** Three existing 1K maps, one draw, no new lights, geometry props or render targets. */
export function createVillageRoadMaterial(scene:Scene):ShaderMaterial{
 const material=new ShaderMaterial('brisalia:earth-road',scene,{vertex:SHADER,fragment:SHADER},{
  attributes:['position','normal','uv','color'],needAlphaBlending:true,
  uniforms:['world','worldViewProjection','sunDirection','sunColor','ambientColor','cameraPosition','fogColor','fogDensity',...CHARACTER_SHADOW_UNIFORMS],
  samplers:['soil','gravel','relief','characterShadowMap']});
 const base='/assets/terrain/biomes/textures/';
 const paths={soil:'albedo/biome_valle_cultivo_tierra_fertil_albedo_1k.webp',
  gravel:'albedo/biome_sierra_grava_pasto_albedo_1k.webp',relief:'normal/biome_valle_cultivo_tierra_fertil_normal_gl_1k.png'};
 const textures=Object.entries(paths).map(([key,path])=>{
  const texture=new Texture(base+path,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
  texture.gammaSpace=key!=='relief';material.setTexture(key,texture);return texture;
 });
 material.zOffset=-2;material.zOffsetUnits=-2;material.backFaceCulling=true;
 const sun=scene.lights.find(l=>l instanceof DirectionalLight) as DirectionalLight|undefined;
 const hemi=scene.lights.find(l=>l instanceof HemisphericLight) as HemisphericLight|undefined;
 const direction=new Vector3(.5,1,-.4),color=new Color3(.88,.82,.72),ambient=new Color3(.46,.51,.54);
 const observer=scene.onBeforeRenderObservable.add(()=>{
  bindCharacterShadow(material,scene);
  if(sun){direction.copyFrom(sun.direction).scaleInPlace(-1).normalize();color.copyFrom(sun.diffuse).scaleInPlace(sun.intensity*.65);}
  if(hemi)ambient.copyFrom(hemi.diffuse).scaleInPlace(.24+hemi.intensity*.35);
  material.setVector3('sunDirection',direction);material.setColor3('sunColor',color);material.setColor3('ambientColor',ambient);
  if(scene.activeCamera)material.setVector3('cameraPosition',scene.activeCamera.globalPosition);
  material.setColor3('fogColor',scene.fogColor);material.setFloat('fogDensity',scene.fogMode===Scene.FOGMODE_EXP2?scene.fogDensity:0);
 });
 material.onDisposeObservable.add(()=>{scene.onBeforeRenderObservable.remove(observer);for(const t of textures)t.dispose();});
 return material;
}
