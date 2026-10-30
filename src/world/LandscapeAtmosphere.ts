import { Color3, PBRMaterial, Scene, type Material } from '@babylonjs/core';

/** Scene fog is the sole atmospheric pass for Babylon materials and custom shaders. */
export const LANDSCAPE_ATMOSPHERE_CONFIG={
  fogMode:Scene.FOGMODE_EXP2,
  fogDensity:.00135,
  fogColor:'#b5d6f2',
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
