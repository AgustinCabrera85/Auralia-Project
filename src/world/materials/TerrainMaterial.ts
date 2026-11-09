import { Color3, DirectionalLight, Effect, Scene, ShaderMaterial, Texture, Vector2, Vector3 } from '@babylonjs/core';
import { LAKE_RESERVATIONS, LAGOONS, riverSample, streamSample, waterSurfaceAt } from '../geographicFeatures';
import { GEOLOGY_FORMATIONS, geologyInfluence, geologyLocal } from '../geologyData';
import { biomeWeightsAt, MAINLAND } from '../terrainData';
import { FOLIAGE_FOREST } from '../foliageForestConfig';

/** Metres and dimensionless blend controls for the continental terrain. */
export type TerrainMaterialConfig=Readonly<{
  tileScale:number;grassDetailScale:number;macroScale:number;macroStrength:number;
  normalStrength:number;rockNormalStrength:number;
  slopeStart:number;slopeFull:number;rockHeightStart:number;rockHeightFull:number;
  shoreBlend:number;soilBlend:number;maskNoiseScale:number;maskNoiseStrength:number;
  sandStrength:number;
}>;

export const TERRAIN_MATERIAL_CONFIG:TerrainMaterialConfig={
  tileScale:.135,grassDetailScale:1.37,macroScale:.012,macroStrength:.085,
  normalStrength:.16,rockNormalStrength:.23,
  slopeStart:.32,slopeFull:1.2,rockHeightStart:38,rockHeightFull:95,
  shoreBlend:18,soilBlend:42,maskNoiseScale:.044,maskNoiseStrength:3.5,
  sandStrength:.84
};

const clamp=(n:number):number=>Math.max(0,Math.min(1,n));
const smooth=(a:number,b:number,n:number):number=>{
  const t=clamp((n-a)/(b-a));return t*t*(3-2*t);
};
const CANYON=GEOLOGY_FORMATIONS.find(formation=>formation.kind==='canyon');
const WATER_BASINS=[...LAKE_RESERVATIONS,...LAGOONS];

/** RGBA weights: grass, soil, rock, sand. Inputs use the canonical mainland sampler. */
export function terrainMaterialWeightsAt(x:number,z:number,height:number,slope:number,
  config:TerrainMaterialConfig=TERRAIN_MATERIAL_CONFIG):[number,number,number,number]{
  if(height<MAINLAND.waterLevel-.1||
    (waterSurfaceAt(x,z)?.level??-Infinity)>height+.05)return [0,.34,.06,.6];
  const river=riverSample(x,z),stream=streamSample(x,z);
  let bank=Math.min(river.distance-river.width,stream.distance-stream.width);
  for(const lake of WATER_BASINS){
    const radial=Math.hypot((x-lake.x)/lake.radiusX,(z-lake.z)/lake.radiusZ);
    bank=Math.min(bank,(radial-.94)*Math.min(lake.radiusX,lake.radiusZ));
  }
  const noise=Math.sin(x*config.maskNoiseScale+Math.sin(z*config.maskNoiseScale*.73)) *
    Math.cos(z*config.maskNoiseScale-x*config.maskNoiseScale*.29);
  bank+=noise*config.maskNoiseStrength;
  const biome=biomeWeightsAt(x,z);
  let rock=clamp(smooth(config.slopeStart,config.slopeFull,slope)*.96+
    smooth(config.rockHeightStart,config.rockHeightFull,height)*
    (biome.sierras+biome.cumbres)*.38);
  let sand=clamp((1-smooth(0,config.shoreBlend,bank))*config.sandStrength+
    (1-smooth(1,5,height))*biome.costa*.7);
  let soil=clamp(.12+(1-smooth(config.shoreBlend*.35,config.soilBlend,bank))*.42+
    noise*.055);
  if(CANYON){
    const influence=geologyInfluence(CANYON,x,z);
    if(influence>0){
      const across=Math.abs(geologyLocal(CANYON,x,z).across);
      soil+=influence*(1-smooth(17,37,across))*.38;
      rock+=influence*smooth(23,48,across)*.22;
    }
  }
  rock=clamp(rock);
  sand=clamp(sand)*(1-rock);
  soil=clamp(soil)*(1-rock-sand);
  const grass=Math.max(0,1-rock-sand-soil);
  return [grass,soil,rock,sand];
}

Effect.ShadersStore['auraliaContinentalTerrainVertexShader']=`
  precision highp float;
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec4 color;
  attribute vec2 uv;
  uniform mat4 world;
  uniform mat4 worldViewProjection;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec4 vWeights;
  varying vec2 vExtras;
  void main(void){
    vWorldPos=(world*vec4(position,1.0)).xyz;
    vWorldNormal=normalize(mat3(world)*normal);
    vWeights=color;
    vExtras=uv;
    gl_Position=worldViewProjection*vec4(position,1.0);
  }
`;

Effect.ShadersStore['auraliaContinentalTerrainFragmentShader']=`
  precision highp float;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec4 vWeights;
  varying vec2 vExtras;
  uniform sampler2D texGrass;
  uniform sampler2D texSoil;
  uniform sampler2D texRock;
  uniform sampler2D texSand;
  uniform sampler2D texSnow;
  uniform sampler2D texLava;
  uniform sampler2D normGrass;
  uniform sampler2D normRock;
  uniform vec3 cameraPosition;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float tileScale;
  uniform float grassDetailScale;
  uniform float macroScale;
  uniform float macroStrength;
  uniform float normalStrength;
  uniform float rockNormalStrength;
  uniform vec2 forestCenter;
  uniform vec2 forestRadii;

  vec4 rockColor(vec3 p,vec3 axes){
    vec3 q=p*tileScale*.83;
    return texture2D(texRock,q.zy)*axes.x+
      texture2D(texRock,q.xz)*axes.y+
      texture2D(texRock,q.xy)*axes.z;
  }
  vec3 rockNormal(vec3 p,vec3 axes){
    vec3 q=p*tileScale*.83;
    vec3 x=texture2D(normRock,q.zy).xyz*2.0-1.0;
    vec3 y=texture2D(normRock,q.xz).xyz*2.0-1.0;
    vec3 z=texture2D(normRock,q.xy).xyz*2.0-1.0;
    return vec3(0.0,x.y,x.x)*axes.x+
      vec3(y.x,0.0,y.y)*axes.y+
      vec3(z.x,z.y,0.0)*axes.z;
  }
  void main(void){
    vec3 normal=normalize(vWorldNormal);
    if(!gl_FrontFacing)normal=-normal;
    vec4 weights=max(vWeights,vec4(0.0));
    float total=max(dot(weights,vec4(1.0))+vExtras.x+vExtras.y,0.0001);
    weights/=total;
    vec2 extra=max(vExtras,vec2(0.0))/total;
    // Continuous world-space warp and a rotated second grass sample break 1K repeats.
    float broad=sin(vWorldPos.x*macroScale+sin(vWorldPos.z*macroScale*.71))*
      cos(vWorldPos.z*macroScale-vWorldPos.x*macroScale*.37);
    vec2 warp=vec2(broad,cos(vWorldPos.x*macroScale*.83+vWorldPos.z*macroScale*.91))*.24;
    vec2 uv=vWorldPos.xz*tileScale+warp;
    vec2 uvGrass2=vec2(uv.y,-uv.x)*grassDetailScale+vec2(17.3,4.9);
    vec4 grass=mix(texture2D(texGrass,uv),texture2D(texGrass,uvGrass2),.34+.12*broad);
    float forestDistance=length((vWorldPos.xz-forestCenter)/forestRadii);
    float forestMask=1.0-smoothstep(.88,1.02,forestDistance);
    vec3 forestGrass=clamp(grass.rgb*vec3(1.40,1.48,.94)+
      vec3(.022,.018,.003),0.0,1.0);
    grass.rgb=mix(grass.rgb,forestGrass,forestMask);
    // The distant meadow keeps a low-cost world-space cover pattern after GLB tufts thin out.
    float distanceToCamera=length(vWorldPos-cameraPosition);
    float coverNoise=sin(vWorldPos.x*.54+sin(vWorldPos.z*.27))*
      cos(vWorldPos.z*.47-vWorldPos.x*.21);
    float coverPatch=smoothstep(.12,.75,coverNoise);
    float coverBlend=forestMask*smoothstep(95.0,165.0,distanceToCamera)*coverPatch*.28;
    grass.rgb=mix(grass.rgb,clamp(grass.rgb*vec3(1.26,1.33,.90)+
      vec3(.006,.012,0.0),0.0,1.0),coverBlend);
    vec4 soil=texture2D(texSoil,uv*1.07+vec2(2.4,7.1));
    vec4 sand=texture2D(texSand,uv*.9+vec2(11.7,3.2));
    vec3 axes=pow(abs(normal),vec3(5.0));
    axes/=max(dot(axes,vec3(1.0)),.0001);
    vec4 rock=rockColor(vWorldPos+vec3(warp.x,0.0,warp.y),axes);
    vec4 snow=texture2D(texSnow,uv*.73+vec2(3.1,6.2));
    vec4 lava=texture2D(texLava,uv*.64+vec2(8.4,2.7));
    vec3 albedo=grass.rgb*weights.x+soil.rgb*weights.y+
      rock.rgb*weights.z+sand.rgb*weights.w+snow.rgb*extra.x+lava.rgb*extra.y;
    float roughness=clamp(grass.a*weights.x+soil.a*weights.y+
      rock.a*weights.z+sand.a*weights.w+snow.a*extra.x+lava.a*extra.y,.48,1.0);
    vec3 grassMap=texture2D(normGrass,uv).xyz*2.0-1.0;
    vec3 grain=vec3(grassMap.x,0.0,grassMap.y)*weights.x*normalStrength+
      rockNormal(vWorldPos+vec3(warp.x,0.0,warp.y),axes)*weights.z*rockNormalStrength;
    normal=normalize(normal+grain);
    float diffuse=max(dot(normal,normalize(sunDirection)),0.0);
    float ambient=clamp(.64+.28*normal.y,.35,1.0);
    vec3 lit=albedo*(vec3(.46,.51,.53)*ambient+sunColor*diffuse);
    vec3 viewDir=normalize(cameraPosition-vWorldPos);
    vec3 halfDir=normalize(viewDir+normalize(sunDirection));
    float highlight=pow(max(dot(normal,halfDir),0.0),mix(40.0,4.0,roughness));
    lit+=sunColor*highlight*(1.0-roughness)*.17;
    lit+=lava.rgb*extra.y*1.25; // Emission from painted lava
    // Small colour drift follows world coordinates, independent of chunk origin.
    lit*=1.0+macroStrength*broad+.025*sin(vWorldPos.x*.137)*cos(vWorldPos.z*.119);
    lit*=1.0+forestMask*weights.x*.10;
    float fog=1.0-exp(-pow(distanceToCamera*fogDensity,2.0));
    gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,1.0)),1.0);
  }
`;

export function createTerrainMaterial(scene:Scene,config:TerrainMaterialConfig=TERRAIN_MATERIAL_CONFIG):
  {material:ShaderMaterial;dispose:()=>void}{
  const material=new ShaderMaterial('material-terreno-continental',scene,
    {vertex:'auraliaContinentalTerrain',fragment:'auraliaContinentalTerrain'},
    {attributes:['position','normal','color','uv'],
      uniforms:['world','worldViewProjection','cameraPosition','sunDirection','sunColor',
        'fogColor','fogDensity','tileScale','grassDetailScale','macroScale','macroStrength',
        'normalStrength','rockNormalStrength','forestCenter','forestRadii'],
      samplers:['texGrass','texSoil','texRock','texSand','texSnow','texLava','normGrass','normRock']});
  material.backFaceCulling=false;
  const sun=scene.lights.find(light=>light instanceof DirectionalLight) as DirectionalLight|undefined;
  material.setVector3('sunDirection',sun?sun.direction.scale(-1).normalize():new Vector3(.5,1,-.4).normalize());
  material.setColor3('sunColor',sun?sun.diffuse.scale(sun.intensity*.65):new Color3(.88,.82,.72));
  material.setColor3('fogColor',scene.fogColor);
  material.setFloat('fogDensity',scene.fogDensity);
  material.setFloat('tileScale',config.tileScale);
  material.setFloat('grassDetailScale',config.grassDetailScale);
  material.setFloat('macroScale',config.macroScale);
  material.setFloat('macroStrength',config.macroStrength);
  material.setFloat('normalStrength',config.normalStrength);
  material.setFloat('rockNormalStrength',config.rockNormalStrength);
  material.setVector2('forestCenter',new Vector2(FOLIAGE_FOREST.x,FOLIAGE_FOREST.z));
  material.setVector2('forestRadii',new Vector2(FOLIAGE_FOREST.radiusX,FOLIAGE_FOREST.radiusZ));
  const textures:Texture[]=[];
  for(const [uniform,name] of [
    ['texGrass','grass_albedo_rough'],['texSoil','soil_albedo_rough'],
    ['texRock','rock_albedo_rough'],['texSand','sand_albedo_rough'],
    ['texSnow','snow_albedo_rough'],['texLava','lava_albedo_rough'],
    ['normGrass','grass_normal'],['normRock','rock_normal']
  ]){
    const texture=new Texture(`/assets/terrain/${name}.webp`,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
    texture.wrapU=Texture.WRAP_ADDRESSMODE;
    texture.wrapV=Texture.WRAP_ADDRESSMODE;
    texture.hasAlpha=false; // Albedo alpha stores roughness, not opacity.
    textures.push(texture);
    material.setTexture(uniform,texture);
  }
  const observer=scene.onBeforeRenderObservable.add(()=>{
    if(scene.activeCamera)material.setVector3('cameraPosition',scene.activeCamera.globalPosition);
    material.setColor3('fogColor',scene.fogColor);
    material.setFloat('fogDensity',scene.fogMode===Scene.FOGMODE_EXP2?scene.fogDensity:0);
  });
  return {material,dispose:()=>{
    scene.onBeforeRenderObservable.remove(observer);
    material.dispose();
    for(const texture of textures)texture.dispose();
  }};
}
