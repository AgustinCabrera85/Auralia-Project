import { Color3, RawTexture, Scene, ShaderMaterial, Texture, Vector3 } from '@babylonjs/core';
import { registerAuraliaWaterShaders } from './waterShaders';

export type WaterTextureBank = Readonly<{
  oceanNormals: Texture;
  riverNormals: Texture;
  foamNoise: Texture;
  release: () => void;
}>;

type SharedEntry = { oceanNormals: Texture; riverNormals: Texture; foamNoise: Texture; refs: number };
const cache = new WeakMap<Scene, SharedEntry>();

/** One 1K texture set per scene, shared by ocean/river/lakes. */
export function acquireWaterTextures(scene: Scene): WaterTextureBank {
  registerAuraliaWaterShaders();
  let entry = cache.get(scene);
  if (!entry) {
    const load = (name: string): Texture => {
      // NullEngine tests run without DOM image loading: provide a valid 1px fallback.
      const texture = typeof document === 'undefined'
        ? RawTexture.CreateRGBATexture(
            new Uint8Array([128,128,255,255]),1,1,scene,false,false,Texture.NEAREST_SAMPLINGMODE)
        : new Texture(`/assets/water/${name}`, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 4;
      return texture;
    };
    entry = {
      oceanNormals: load('ocean_normals_1k.png'),
      riverNormals: load('river_normals_1k.png'),
      foamNoise: load('foam_noise_1k.png'),
      refs: 0,
    };
    cache.set(scene, entry);
  }
  entry.refs++;
  let released = false;
  return {
    oceanNormals: entry.oceanNormals,
    riverNormals: entry.riverNormals,
    foamNoise: entry.foamNoise,
    release: () => {
      if (released) return;
      released = true;
      entry!.refs--;
      if (!entry!.refs) {
        entry!.oceanNormals.dispose();
        entry!.riverNormals.dispose();
        entry!.foamNoise.dispose();
        cache.delete(scene);
      }
    },
  };
}

/** Consistent scene lighting/fog; no second built-in or duplicated fog pass. */
export function updateWaterUniforms(material: ShaderMaterial, scene: Scene, time: number): void {
  const camera = scene.activeCamera;
  if (!camera) return;
  const camPosition = camera.globalPosition ?? camera.position;
  material.setVector3('uCameraPosition', camPosition);
  // The vector points TOWARD the sun, opposite the default directional-light ray.
  material.setVector3('uSunDirection', new Vector3(.35, .88, -.32).normalize());
  material.setColor3('uFogColor', scene.fogMode === Scene.FOGMODE_NONE
    ? new Color3(.62, .78, .87) : scene.fogColor);
  material.setFloat('uFogDensity', scene.fogMode === Scene.FOGMODE_NONE ? 0 : scene.fogDensity);
  material.setFloat('uTime', time);
}
