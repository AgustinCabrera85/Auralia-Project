import { Color3, DirectionalLight, Effect, Engine, Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
import { BIOME_MATERIALS, BIOME_TEXTURE_GPU_BYTES, materialLayer } from './BiomeMaterialCatalog';
import { createBiomeTextureArrays } from './BiomeTextureArrays';
import { createTerrainMaterial as createLegacyMaterial } from './TerrainMaterialV2';
import type { TerrainMaterialConfig } from './TerrainMaterial';
import { LANDSCAPE_REGIONS } from '../landscapeRegions';

const SHADER='auraliaBiomeTerrain';
const regionsGLSL=Object.entries(LANDSCAPE_REGIONS).map(([name,r])=>
  `float ${name}=regionMask(p,vec4(${[r.x,r.z,r.rx,r.rz].map(n=>n.toFixed(1)).join(',')}));`).join('\n');

Effect.ShadersStore[`${SHADER}VertexShader`]=`
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vWeights;
varying vec2 vExtras;
void main(){
  vWorldPos=(world*vec4(position,1.0)).xyz;
  vNormal=normalize(mat3(world)*normal);
  vWeights=color;vExtras=uv;
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;

Effect.ShadersStore[`${SHADER}FragmentShader`]=`
precision highp float;
precision highp sampler2DArray;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vWeights;
varying vec2 vExtras;
uniform sampler2DArray biomeAlbedos;
uniform sampler2DArray biomeNormals;
uniform vec3 surfaceParams[${BIOME_MATERIALS.length}];
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float macroStrength;
vec3 geometricNormal,dpdx,dpdy;
float bumpFade;
struct Surface {vec3 color;vec3 normal;float roughness;};
vec2 rotateUV(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}
float regionMask(vec2 p,vec4 region){
  return 1.0-smoothstep(.48,1.08,length((p-region.xy)/region.zw));
}
vec3 tangentNormal(vec3 sampleN,vec2 du,vec2 dv){
  vec3 p2=cross(dpdy,geometricNormal),p1=cross(geometricNormal,dpdx);
  vec3 T=p2*du.x+p1*dv.x,B=p2*du.y+p1*dv.y;
  float scale=inversesqrt(max(max(dot(T,T),dot(B,B)),.00000001));
  // OpenGL tangent normal follows the rotated projection, including steep faces.
  return normalize((T*sampleN.x+B*sampleN.y)*scale+geometricNormal*sampleN.z);
}
Surface layer(float index,vec2 plane,vec2 du,vec2 dv){
  vec3 params=surfaceParams[int(index)];
  float rotation=.17+index*.31;
  vec2 uv=rotateUV(plane*params.x,rotation);
  du=rotateUV(du*params.x,rotation);dv=rotateUV(dv*params.x,rotation);
  vec3 color=textureGrad(biomeAlbedos,vec3(uv,index),du,dv).rgb;
  if(index==${materialLayer('pradera_templada')}.0)color*=vec3(.82,.92,.88);
  vec3 n=textureGrad(biomeNormals,vec3(uv,index),du,dv).rgb*2.0-1.0;
  n.xy*=params.y*bumpFade;n=normalize(n);
  return Surface(color,tangentNormal(n,du,dv),params.z);
}
Surface mixSurface(Surface a,Surface b,float weight){
  return Surface(mix(a.color,b.color,weight),mix(a.normal,b.normal,weight),mix(a.roughness,b.roughness,weight));
}
Surface floorLayer(float index){return layer(index,vWorldPos.xz,dpdx.xz,dpdy.xz);}
Surface cliffLayer(float index){
  vec3 axes=pow(abs(geometricNormal),vec3(4.0));axes/=max(dot(axes,vec3(1.0)),.00001);
  Surface x=layer(index,vWorldPos.zy,dpdx.zy,dpdy.zy);
  Surface y=floorLayer(index);
  Surface z=layer(index,vWorldPos.xy,dpdx.xy,dpdy.xy);
  return Surface(x.color*axes.x+y.color*axes.y+z.color*axes.z,
    x.normal*axes.x+y.normal*axes.y+z.normal*axes.z,y.roughness);
}
void paint(inout Surface ground,float index,float amount){
  if(amount>.001)ground=mixSurface(ground,floorLayer(index),amount);
}
void main(){
  geometricNormal=normalize(vNormal);
  if(!gl_FrontFacing)geometricNormal=-geometricNormal;
  dpdx=dFdx(vWorldPos);dpdy=dFdy(vWorldPos);
  float distanceToCamera=length(vWorldPos-cameraPosition);
  bumpFade=1.0-smoothstep(70.0,240.0,distanceToCamera);
  vec2 p=vWorldPos.xz;
  ${regionsGLSL}
  wetland=max(wetland,lake);
  vec4 weights=max(vWeights,vec4(0.0));vec2 extra=max(vExtras,vec2(0.0));
  float total=max(dot(weights,vec4(1.0))+extra.x+extra.y,.00001);
  weights/=total;extra/=total;
  Surface ground=floorLayer(${materialLayer('pradera_templada')}.0);
  paint(ground,${materialLayer('valle_cultivo_tierra_fertil')}.0,weights.y/max(weights.x+weights.y,.00001));
  paint(ground,${materialLayer('bosque_templado_suelo')}.0,forest*.92);
  paint(ground,${materialLayer('pantano_humedo')}.0,wetland*.85);
  paint(ground,${materialLayer('orilla_rio_fangosa')}.0,wetland*weights.y*.7);
  paint(ground,${materialLayer('estepa_seca')}.0,steppe*.9);
  paint(ground,${materialLayer('sierra_grava_pasto')}.0,sierra*.88);
  paint(ground,${materialLayer('alpino_roca_nieve')}.0,alpine*.92);
  paint(ground,${materialLayer('desierto_arena')}.0,desert);
  paint(ground,${materialLayer('volcanico_basalto')}.0,volcanic);
  paint(ground,${materialLayer('tierra_maldita')}.0,cursed);
  paint(ground,${materialLayer('selva_humeda')}.0,jungle);
  // Rock uses all three world projections; high cliffs do not stretch floor UVs.
  Surface rock=ground;
  if(weights.z>.001){
    rock=cliffLayer(${materialLayer('rock')}.0);
    if(desert>.001)rock=mixSurface(rock,cliffLayer(${materialLayer('badlands_arcilla_roja')}.0),desert);
    if(volcanic>.001)rock=mixSurface(rock,cliffLayer(${materialLayer('volcanico_basalto')}.0),volcanic);
    if(cursed>.001)rock=mixSurface(rock,cliffLayer(${materialLayer('tierra_maldita')}.0),cursed*.75);
  }
  Surface sand=ground;
  if(weights.w>.001){
    sand=floorLayer(${materialLayer('costa_playa')}.0);
    paint(sand,${materialLayer('orilla_rio_fangosa')}.0,wetland);
    paint(sand,${materialLayer('desierto_arena')}.0,desert);
  }
  float groundWeight=weights.x+weights.y;
  vec3 albedo=ground.color*groundWeight+rock.color*weights.z+sand.color*weights.w;
  vec3 normal=ground.normal*groundWeight+rock.normal*weights.z+sand.normal*weights.w;
  float roughness=ground.roughness*groundWeight+rock.roughness*weights.z+sand.roughness*weights.w;
  if(extra.x>.001){Surface snow=floorLayer(${materialLayer('snow')}.0);
    albedo+=snow.color*extra.x;normal+=snow.normal*extra.x;roughness+=snow.roughness*extra.x;}
  vec3 emission=vec3(0.0);
  if(extra.y>.001){Surface lava=floorLayer(${materialLayer('lava')}.0);
    albedo+=lava.color*extra.y;normal+=lava.normal*extra.y;roughness+=lava.roughness*extra.y;
    emission=lava.color*extra.y*(.25+1.1*clamp((lava.color.r-lava.color.g)*2.2,0.0,1.0));}
  float snowCover=smoothstep(185.0,295.0,vWorldPos.y)*max(alpine,sierra*.45)*(1.0-volcanic)*(1.0-extra.y);
  if(snowCover>.001){Surface snow=floorLayer(${materialLayer('snow')}.0);
    albedo=mix(albedo,snow.color,snowCover);normal=mix(normal,snow.normal,snowCover);roughness=mix(roughness,.97,snowCover);}
  vec3 N=normalize(normal),L=normalize(sunDirection),V=normalize(cameraPosition-vWorldPos);
  float ambient=clamp(.65+.25*N.y,.36,1.0);
  vec3 lit=albedo*(vec3(.46,.51,.54)*ambient+sunColor*max(dot(N,L),0.0));
  vec3 H=normalize(V+L);
  lit+=sunColor*pow(max(dot(N,H),0.0),mix(100.0,6.0,roughness))*(1.0-roughness)*.20;
  float broad=sin(p.x*.012+sin(p.y*.0085))*cos(p.y*.012-p.x*.0044);
  lit*=1.0+macroStrength*broad;
  lit+=emission;
  float fog=1.0-exp(-pow(distanceToCamera*fogDensity,2.0));
  gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,1.0)),1.0);
}`;

export function createTerrainMaterial(scene:Scene,config:TerrainMaterialConfig):
  {material:ShaderMaterial;dispose:()=>void}{
  // WebGL1 and non-browser tests retain the established 8-sampler material.
  const legacy=typeof location!=='undefined'&&new URLSearchParams(location.search).get('terrainMaterials')==='legacy';
  const engine=scene.getEngine();
  if(!(engine instanceof Engine)||engine.webGLVersion<2||typeof createImageBitmap==='undefined'||legacy)
    return createLegacyMaterial(scene,config);
  const textures=createBiomeTextureArrays(scene);
  const material=new ShaderMaterial('auralia-biome-terrain',scene,{vertex:SHADER,fragment:SHADER},{
    attributes:['position','normal','color','uv'],
    uniforms:['world','worldViewProjection','surfaceParams','cameraPosition','sunDirection','sunColor','fogColor','fogDensity','macroStrength'],
    samplers:['biomeAlbedos','biomeNormals']});
  material.backFaceCulling=false;
  material.setTexture('biomeAlbedos',textures.albedo);material.setTexture('biomeNormals',textures.normal);
  material.setArray3('surfaceParams',BIOME_MATERIALS.flatMap(m=>[m.scale,m.normalStrength,m.roughness]));
  material.setFloat('macroStrength',config.macroStrength);
  material.metadata={biomeMaterials:{status:'loading',layers:BIOME_MATERIALS.length,
    samplers:2,gpuBytes:BIOME_TEXTURE_GPU_BYTES,sourceSize:1024,runtimeSize:512}};
  void textures.ready.then(()=>{material.metadata.biomeMaterials.status='ready';}).catch(error=>{
    if(error?.name==='AbortError')return;
    material.metadata.biomeMaterials.status='failed';
    console.error('[Auralia] No se pudieron cargar los materiales de biomas',error);
  });
  const light=scene.lights.find(l=>l instanceof DirectionalLight) as DirectionalLight|undefined;
  const direction=new Vector3(.5,1,-.4),color=new Color3(.88,.82,.72);
  const observer=scene.onBeforeRenderObservable.add(()=>{
    if(light){direction.copyFrom(light.direction).scaleInPlace(-1).normalize();color.copyFrom(light.diffuse).scaleInPlace(light.intensity*.65);}
    material.setVector3('sunDirection',direction);material.setColor3('sunColor',color);
    if(scene.activeCamera)material.setVector3('cameraPosition',scene.activeCamera.globalPosition);
    material.setColor3('fogColor',scene.fogColor);
    material.setFloat('fogDensity',scene.fogMode===Scene.FOGMODE_EXP2?scene.fogDensity:0);
  });
  return {material,dispose:()=>{scene.onBeforeRenderObservable.remove(observer);textures.dispose();material.dispose();}};
}
