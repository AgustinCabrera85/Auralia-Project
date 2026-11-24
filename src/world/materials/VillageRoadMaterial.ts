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
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
void main(){
 vPosition=(world*vec4(position,1.0)).xyz;vNormal=normalize(mat3(world)*normal);vUV=uv;vColor=color;
 gl_Position=worldViewProjection*vec4(position,1.0);
}`;
Effect.ShadersStore[`${SHADER}FragmentShader`]=`
precision highp float;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D soil;
uniform sampler2D gravel;
uniform sampler2D relief;
uniform sampler2D cobbleColor;
uniform sampler2D cobbleNormal;
uniform sampler2D cobbleSurface;
uniform sampler2D cobbleHeight;
uniform float cobbleRepeat;
uniform float regionalRoad;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform vec3 cameraPosition;
uniform vec3 fogColor;
uniform float fogDensity;
${CHARACTER_SHADOW_GLSL}
float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float roadNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(roadHash(i),roadHash(i+vec2(1.0,0.0)),f.x),
            mix(roadHash(i+vec2(0.0,1.0)),roadHash(i+vec2(1.0)),f.x),f.y);
}
void main(){
 if(vColor.a<.005)discard;
 vec3 dirt=texture2D(soil,vUV).rgb;
 vec3 stone=texture2D(gravel,vUV*.83+vec2(.37,.19)).rgb;
 // A sparse gravel contribution, stronger along the worn shoulders.
 float stones=smoothstep(.30,.49,dot(stone,vec3(.30,.59,.11)))*vColor.b;
 vec3 earth=mix(dirt,stone,stones);
 // The existing UVs are village metres / 12. Keep the inlays fixed to the road,
 // with irregular exposed patches and soil covering low joints and shoulders.
 vec2 cobbleUV=vUV*cobbleRepeat;
 vec3 surface=texture2D(cobbleSurface,cobbleUV).rgb;
 float height=texture2D(cobbleHeight,cobbleUV).r;
 float patches=roadNoise(vUV*1.35)*.72+roadNoise(vUV*4.1+vec2(7.3,2.8))*.28;
 float exposure=mix(smoothstep(.30,.72,patches)*vColor.g,.85+.15*patches,regionalRoad);
 float burial=mix(1.02,.34,exposure);
 float inlay=mix(smoothstep(burial-.045,burial+.045,height),smoothstep(.12,.32,height),regionalRoad);
 vec3 tint=mix(vec3(vColor.r),vColor.rgb,regionalRoad);
 vec3 albedo=mix(earth,texture2D(cobbleColor,cobbleUV).rgb,inlay)*tint;
 float distanceToCamera=distance(cameraPosition,vPosition);
 float detail=1.0-smoothstep(35.0,95.0,distanceToCamera);
 vec2 bump=(texture2D(relief,vUV).rg*2.0-1.0)*.22;
 vec3 cobbleBump=texture2D(cobbleNormal,cobbleUV).rgb*2.0-1.0;
 vec3 tangentNormal=normalize(mix(vec3(bump,1.0),vec3(cobbleBump.xy*.60,cobbleBump.z),inlay));
 tangentNormal=normalize(mix(vec3(0.0,0.0,1.0),tangentNormal,detail));
 vec3 baseNormal=normalize(vNormal);
 vec3 T=normalize(vec3(1.0,0.0,0.0)-baseNormal*baseNormal.x),B=cross(baseNormal,T);
 vec3 N=normalize(T*tangentNormal.x+B*tangentNormal.y+baseNormal*tangentNormal.z);
 float visibility=characterSunVisibility(vPosition);
 float ao=mix(1.0,surface.r,inlay);
 float diffuse=max(dot(N,sunDirection),0.0);
 vec3 halfVector=normalize(sunDirection+normalize(cameraPosition-vPosition));
 float roughness=surface.g;
 float glint=pow(max(dot(N,halfVector),0.0),mix(48.0,4.0,roughness))*(1.0-roughness)*.08*inlay*diffuse;
 vec3 lit=albedo*(ambientColor*ao+sunColor*diffuse*visibility)+sunColor*glint*visibility;
 float fog=1.0-exp(-pow(distanceToCamera*fogDensity,2.0));
 gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,1.0)),vColor.a);
}`;

/** Inlaid stones share the earth mesh: seven 1K maps plus the shadow map, one draw. */
export function createVillageRoadMaterial(scene:Scene,worldScale=1,regional=false):ShaderMaterial{
 const material=new ShaderMaterial(regional?'regional:cobblestone':'brisalia:earth-road',scene,{vertex:SHADER,fragment:SHADER},{
  attributes:['position','normal','uv','color'],needAlphaBlending:true,
  uniforms:['world','worldViewProjection','cobbleRepeat','regionalRoad','sunDirection','sunColor','ambientColor','cameraPosition','fogColor','fogDensity',...CHARACTER_SHADOW_UNIFORMS],
  samplers:['soil','gravel','relief','cobbleColor','cobbleNormal','cobbleSurface','cobbleHeight','characterShadowMap']});
 const base='/assets/terrain/biomes/textures/';
 const cobbles='/assets/terrain/brisalia/Brisalia_Adoquines_';
 const paths={soil:base+'albedo/biome_valle_cultivo_tierra_fertil_albedo_1k.webp',
  gravel:base+'albedo/biome_sierra_grava_pasto_albedo_1k.webp',relief:base+'normal/biome_valle_cultivo_tierra_fertil_normal_gl_1k.png',
  cobbleColor:cobbles+'BaseColor_1K.jpg',cobbleNormal:cobbles+'NormalGL_1K.png',
  cobbleSurface:cobbles+'ORM_1K.png',cobbleHeight:cobbles+'Height16_1K.png'};
 const textures=Object.entries(paths).map(([key,path])=>{
  const texture=new Texture(path,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
  texture.gammaSpace=key==='soil'||key==='gravel'||key==='cobbleColor';material.setTexture(key,texture);return texture;
 });
 // About eight 20–25 cm stones per 1.8 m tile, scaled with the settlement.
 material.setFloat('cobbleRepeat',12/(1.8*worldScale));
 material.setFloat('regionalRoad',regional?1:0);
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
