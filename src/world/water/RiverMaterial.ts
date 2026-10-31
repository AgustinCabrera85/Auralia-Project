import { Scene, ShaderMaterial } from '@babylonjs/core';
import { type WaterTextureBank } from './waterResources';

/** The water mesh provides world X/Z flow in uv2 and (shore,speed,rapids,depth) in color. */
export function createRiverWaterMaterial(scene: Scene, textures: WaterTextureBank): ShaderMaterial {
  const material = new ShaderMaterial('auralia-river-material',scene,'auraliaRiver', {
    attributes: ['position','normal','uv2','color'],
    uniforms: ['world','worldViewProjection','uCameraPosition','uSunDirection','uFogColor',
      'uFogDensity','uTime','uNormalStrength'],
    samplers: ['uNormals','uFoamNoise'],
    needAlphaBlending: false,
  });
  material.setTexture('uNormals',textures.riverNormals);
  material.setTexture('uFoamNoise',textures.foamNoise);
  material.setFloat('uNormalStrength',1.0);
  material.backFaceCulling=false;
  return material;
}
