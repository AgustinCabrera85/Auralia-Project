import { Color3, Color4, PBRMaterial, Scene, type Material } from '@babylonjs/core';

/** Scene fog is the sole atmospheric pass for Babylon materials and custom shaders. */
export const LANDSCAPE_ATMOSPHERE_CONFIG={
  fogMode:Scene.FOGMODE_EXP2,
  fogDensity:.00072,
  fogColor:'#8db8c7',
  skyColor:'#70afe4',
  cameraFar:1900,
  importedDirectIntensity:.62,
  cliffMetallic:0,
  cliffRoughness:.88,
  cliffAlbedoTint:new Color3(.74,.80,.69)
} as const;

export function applyLandscapeAtmosphere(scene:Scene):void{
  scene.fogMode=LANDSCAPE_ATMOSPHERE_CONFIG.fogMode;
  scene.fogDensity=LANDSCAPE_ATMOSPHERE_CONFIG.fogDensity;
  scene.fogColor=Color3.FromHexString(LANDSCAPE_ATMOSPHERE_CONFIG.fogColor);
  const sky=Color3.FromHexString(LANDSCAPE_ATMOSPHERE_CONFIG.skyColor);
  scene.clearColor=new Color4(sky.r,sky.g,sky.b,1);
}

const tunedFoliageMaterials=new WeakSet<Material>();

/** Warmer bark and fuller greens for the illustrated GLBs under the scene lights. */
export function configureFoliageV4Material(material:Material|null):void{
  if(!(material instanceof PBRMaterial)||
    !material.name.startsWith('Auralia_V4_')||tunedFoliageMaterials.has(material))return;
  tunedFoliageMaterials.add(material);
  material.fogEnabled=true;
  material.directIntensity=.88;
  const name=material.name.toLowerCase();
  if(name.includes('_wood_')||name.endsWith('_twig'))
    material.albedoColor=material.albedoColor.multiply(new Color3(.88,.76,.66));
  else if(name.includes('_leaves_'))
    material.albedoColor=material.albedoColor.multiply(new Color3(.73,.93,.61));
  else if(name.includes('_meadow_')||name.includes('_green_'))
    material.albedoColor=material.albedoColor.multiply(new Color3(.76,.96,.65));
  else if(name.includes('_flower_pink'))
    material.albedoColor=material.albedoColor.multiply(new Color3(.98,.77,.88));
  else if(name.includes('_flower_blue'))
    material.albedoColor=material.albedoColor.multiply(new Color3(.75,.86,.98));
}

/** The cliff GLB omits metallic/roughness factors, so glTF defaults to metal=1. */
export function configureGeologyMaterial(material:Material|null,kind:string,adjusted=true):void{
  if(!material)return;
  material.fogEnabled=true;
  if(material instanceof PBRMaterial&&[
    'formacionRocosa','escalonRocoso','rocasRectangulares','mesetaPasto',
    'acantilado2','packRocas'
  ].includes(kind))
    material.directIntensity=adjusted?LANDSCAPE_ATMOSPHERE_CONFIG.importedDirectIntensity:1;
  if(kind!=='acantilado2'||!(material instanceof PBRMaterial))return;
  material.metallic=adjusted?LANDSCAPE_ATMOSPHERE_CONFIG.cliffMetallic:1;
  material.roughness=adjusted?LANDSCAPE_ATMOSPHERE_CONFIG.cliffRoughness:1;
  material.albedoColor=adjusted?LANDSCAPE_ATMOSPHERE_CONFIG.cliffAlbedoTint:Color3.White();
}

export function configureVegetationMaterial(material:Material|null):void{
  if(!material)return;
  material.fogEnabled=true;
  if(material instanceof PBRMaterial)
    material.directIntensity=LANDSCAPE_ATMOSPHERE_CONFIG.importedDirectIntensity;
}
