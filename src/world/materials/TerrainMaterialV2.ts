/**
 * Auralia World Editor — Surface Materials v2.
 * Six independently authored 1K albedos and normal maps; two 1K runtime normal atlases.
 * Keeps the existing WorldEditState painting / TerrainStream vertex-weight protocol:
 *   color RGBA = grass, soil, rock, sand; uv XY = snow, lava.
 * Does not alter original TerrainMaterial.ts (whose biome weights grass uses).
 */
import { Color3, DirectionalLight, Effect, Scene, ShaderMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { TerrainMaterialConfig } from './TerrainMaterial';

const SHADER = 'auraliaTerrainDistinctLayersV2';

Effect.ShadersStore[`${SHADER}VertexShader`] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vBaseWeights;
varying vec2 vExtraWeights;
void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(world) * normal);
  vBaseWeights = color;
  // These are splat weights, not texture coordinates.
  vExtraWeights = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

Effect.ShadersStore[`${SHADER}FragmentShader`] = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vBaseWeights;
varying vec2 vExtraWeights;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float macroStrength;
uniform float macroScale;
uniform float layerScale;
uniform sampler2D texGrass;
uniform sampler2D texSoil;
uniform sampler2D texRock;
uniform sampler2D texSand;
uniform sampler2D texSnow;
uniform sampler2D texLava;
uniform sampler2D normAtlas0;
uniform sampler2D normAtlas1;

vec2 rotate2(vec2 p,float a){
  float c=cos(a),s=sin(a);
  return vec2(p.x*c-p.y*s,p.x*s+p.y*c);
}
vec3 unpackNormal(vec4 n) {return n.xyz*2.0-1.0;}
vec2 atlasUV(vec2 repeatUV,vec2 tile){
  // Each tile is 512x512, with 4 pixels of edge-extended gutter.
  // The atlas itself is 1024; UVs stay inside each tile even when repeating.
  return tile+vec2(0.00390625)+fract(repeatUV)*0.4921875;
}
vec4 sampleRock(vec3 p,vec3 axes){
  return texture2D(texRock,p.zy)*axes.x +
         texture2D(texRock,p.xz)*axes.y +
         texture2D(texRock,p.xy)*axes.z;
}
vec3 sampleRockBump(vec3 p,vec3 axes){
  vec2 slot=vec2(0.0,0.5);
  vec3 nX=unpackNormal(texture2D(normAtlas0,atlasUV(p.zy,slot)));
  vec3 nY=unpackNormal(texture2D(normAtlas0,atlasUV(p.xz,slot)));
  vec3 nZ=unpackNormal(texture2D(normAtlas0,atlasUV(p.xy,slot)));
  return vec3(0.0,nX.y,nX.x)*axes.x+
         vec3(nY.x,0.0,nY.y)*axes.y+
         vec3(nZ.x,nZ.y,0.0)*axes.z;
}
void main(void) {
  vec4 w0=max(vBaseWeights,vec4(0.0));
  vec2 w1=max(vExtraWeights,vec2(0.0));
  float weightSum=max(dot(w0,vec4(1.0))+w1.x+w1.y,0.00001);
  w0/=weightSum;
  w1/=weightSum;
  vec3 geometricNormal=normalize(vNormal);
  if(!gl_FrontFacing) geometricNormal=-geometricNormal;
  vec3 axes=pow(abs(geometricNormal),vec3(6.0));
  axes/=max(axes.x+axes.y+axes.z,0.00001);

  // World-space coordinates: every layer has its OWN scale, rotation and source.
  // This makes the soil texture genuinely different from the grass texture.
  vec2 p=vWorldPos.xz;
  float broad=sin(p.x*macroScale+sin(p.y*macroScale*.71))*
    cos(p.y*macroScale-p.x*macroScale*.37);
  vec2 warp=vec2(broad,cos(p.x*macroScale*.83+p.y*macroScale*.91))*.14;
  vec2 gUV=rotate2(p,.08)*(.20*layerScale)+warp*.34;
  vec2 dUV=rotate2(p,-.27)*(.145*layerScale)+warp*.47+vec2(9.7,3.2);
  vec3 rUV=(vWorldPos+vec3(warp.x,warp.y,warp.x))*(.115*layerScale);
  vec2 aUV=rotate2(p,.40)*(.13*layerScale)+warp*.22+vec2(3.1,10.2);
  vec2 sUV=rotate2(p,-.12)*(.105*layerScale)+warp*.28+vec2(17.1,4.6);
  vec2 lUV=rotate2(p,.18)*(.115*layerScale)+warp*.20+vec2(7.9,1.8);

  vec4 grass=texture2D(texGrass,gUV);
  vec4 soil=texture2D(texSoil,dUV);
  vec4 sand=texture2D(texSand,aUV);
  vec4 snow=texture2D(texSnow,sUV);
  vec4 lava=texture2D(texLava,lUV);
  vec4 rock=sampleRock(rUV,axes);

  vec3 albedo=grass.rgb*w0.x+soil.rgb*w0.y+rock.rgb*w0.z+sand.rgb*w0.w+
              snow.rgb*w1.x+lava.rgb*w1.y;
  float roughness=clamp(grass.a*w0.x+soil.a*w0.y+rock.a*w0.z+
    sand.a*w0.w+snow.a*w1.x+lava.a*w1.y,.15,.99);

  vec3 gN=unpackNormal(texture2D(normAtlas0,atlasUV(gUV,vec2(0.0,0.0))));
  vec3 dN=unpackNormal(texture2D(normAtlas0,atlasUV(dUV,vec2(0.5,0.0))));
  vec3 rN=sampleRockBump(rUV,axes);
  vec3 aN=unpackNormal(texture2D(normAtlas0,atlasUV(aUV,vec2(0.5,0.5))));
  vec3 sN=unpackNormal(texture2D(normAtlas1,atlasUV(sUV,vec2(0.0,0.0))));
  vec3 lN=unpackNormal(texture2D(normAtlas1,atlasUV(lUV,vec2(0.5,0.0))));
  vec3 bump=vec3(0.0);
  bump+=w0.x*vec3(gN.x,0.0,gN.y)*.32;
  bump+=w0.y*vec3(dN.x,0.0,dN.y)*.46;
  bump+=w0.z*rN*.54;
  bump+=w0.w*vec3(aN.x,0.0,aN.y)*.42;
  bump+=w1.x*vec3(sN.x,0.0,sN.y)*.27;
  bump+=w1.y*vec3(lN.x,0.0,lN.y)*.55;
  vec3 N=normalize(geometricNormal+bump);

  vec3 L=normalize(sunDirection);
  float light=max(dot(N,L),0.0);
  float ambient=clamp(.65+.25*N.y,.36,1.0);
  vec3 lit=albedo*(vec3(.46,.51,.54)*ambient+sunColor*light);
  vec3 V=normalize(cameraPosition-vWorldPos);
  vec3 H=normalize(V+L);
  float highlight=pow(max(dot(N,H),0.0),mix(100.0,6.0,roughness));
  lit+=sunColor*highlight*(1.0-roughness)*.20;
  lit*=1.0+macroStrength*broad+.023*sin(p.x*.137)*cos(p.y*.119);
  // Emission follows the lava texture's molten fissures, not an orange tint.
  float molten=clamp((lava.r-lava.g)*2.2,0.0,1.0);
  lit+=lava.rgb*w1.y*(.25+1.1*molten);
  float distanceToCamera=length(vWorldPos-cameraPosition);
  float fog=1.0-exp(-pow(distanceToCamera*fogDensity,2.0));
  gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,1.0)),1.0);
}
`;

const SURFACES=['grass','soil','rock','sand','snow','lava'] as const;

export function createTerrainMaterial(scene:Scene,config:TerrainMaterialConfig):
  {material:ShaderMaterial;dispose:()=>void}{
  const material=new ShaderMaterial('auralia-terrain-six-textures-v2',scene,
    {vertex:SHADER,fragment:SHADER},
    {attributes:['position','normal','color','uv'],
     uniforms:['world','worldViewProjection','cameraPosition','sunDirection','sunColor',
       'fogColor','fogDensity','macroStrength','macroScale','layerScale'],
     samplers:[...SURFACES.map(s=>`tex${s[0].toUpperCase()}${s.slice(1)}`),
       'normAtlas0','normAtlas1']});
  material.backFaceCulling=false;
  const light=scene.lights.find(l=>l instanceof DirectionalLight) as DirectionalLight|undefined;
  material.setVector3('sunDirection',light?light.direction.scale(-1).normalize():new Vector3(.5,1,-.4).normalize());
  material.setColor3('sunColor',light?light.diffuse.scale(light.intensity*.65):new Color3(.88,.82,.72));
  material.setFloat('macroStrength',config.macroStrength);
  material.setFloat('macroScale',config.macroScale);
  material.setFloat('layerScale',1.0);
  const textures:Texture[]=[];
  for(const surface of SURFACES){
    const name=surface[0].toUpperCase()+surface.slice(1);
    const path=`/assets/terrain/aw_${surface}_albedo_rough_1k.webp`;
    const tex=new Texture(path,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU=Texture.WRAP_ADDRESSMODE;tex.wrapV=Texture.WRAP_ADDRESSMODE;
    tex.hasAlpha=false; // albedo.a is roughness, not transparency
    material.setTexture(`tex${name}`,tex);
    textures.push(tex);
  }
  for(let i=0;i<2;i++){
    const texture=new Texture(`/assets/terrain/aw_normals_${i}_1k.webp`,scene,false,false,
      Texture.TRILINEAR_SAMPLINGMODE);
    texture.wrapU=Texture.CLAMP_ADDRESSMODE;
    texture.wrapV=Texture.CLAMP_ADDRESSMODE;
    texture.hasAlpha=false;
    material.setTexture(`normAtlas${i}`,texture);
    textures.push(texture);
  }
  const observer=scene.onBeforeRenderObservable.add(()=>{
    if(scene.activeCamera) material.setVector3('cameraPosition',scene.activeCamera.globalPosition);
    material.setColor3('fogColor',scene.fogColor);
    material.setFloat('fogDensity',scene.fogMode===Scene.FOGMODE_EXP2?scene.fogDensity:0);
  });
  return {material,dispose:()=>{
    scene.onBeforeRenderObservable.remove(observer);
    material.dispose();
    for(const tex of textures)tex.dispose();
  }};
}
