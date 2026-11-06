/**
 * Auralia Foliage Wind — Babylon.js (WebGL2 / GLSL)
 * Applies to glTF materials named Auralia_V4_Leaves_*.
 * Does NOT modify the glb; call attachAuraliaFoliageWind(scene, result.meshes)
 * after importing the vegetation.
 *
 * Requirements: @babylonjs/core (MaterialPluginBase + PBRMaterial).
 * Shadow maps and depth-only passes may need a dedicated displacement strategy.
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';

class AuraliaFoliageWindPlugin extends MaterialPluginBase {
  constructor(material, windState) {
    super(material, 'AuraliaFoliageWind', 200, { AURALIA_FOLIAGE_WIND: false });
    this.windState = windState;
    this._enable(true);
  }

  prepareDefines(defines) {
    defines.AURALIA_FOLIAGE_WIND = true;
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'aurTime', size: 1, type: 'float' },
        { name: 'aurStrength', size: 1, type: 'float' },
        { name: 'aurWindDir', size: 2, type: 'vec2' },
      ],
    };
  }

  bindForSubMesh(ubo) {
    const w = this.windState;
    ubo.updateFloat('aurTime', w.time);
    ubo.updateFloat('aurStrength', w.strength);
    ubo.updateFloat2('aurWindDir', w.direction[0], w.direction[1]);
  }

  getCustomCode(shaderType) {
    if (shaderType !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: `
        #ifdef AURALIA_FOLIAGE_WIND
          #ifdef UV1
            // Gentle per-card UV wiggle. The atlas padding leaves safe room.
            float uvPhase = dot(positionUpdated.xz, vec2(2.72, 3.13));
            uvUpdated.x += sin(aurTime * 3.2 + uvPhase) * 0.002 * aurStrength;
          #endif
        #endif
      `,
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        #ifdef AURALIA_FOLIAGE_WIND
          vec2 windDirection = normalize(aurWindDir + vec2(0.0001, 0.0001));
          float localHeight = max(0.0, positionUpdated.y);
          float heightWeight = smoothstep(0.0, 6.2, localHeight);
          float phase = worldPos.x * 0.31 + worldPos.z * 0.46;
          float gust = sin(aurTime * 1.35 + phase) * 0.64 +
                       sin(aurTime * 2.16 + phase * 0.47) * 0.36;
          float sway = (0.035 + 0.115 * heightWeight) * aurStrength * gust;
          worldPos.xz += windDirection * sway;
          // Fine leaf flutter: small local motion, not large geometry bending.
          float flutter = sin(aurTime * 5.75 + phase * 3.3);
          worldPos.x += flutter * 0.008 * aurStrength;
          vPositionW = vec3(worldPos);
        #endif
      `,
    };
  }
}

/**
 * @param {import('@babylonjs/core/scene.js').Scene} scene
 * @param {Array} meshes imported meshes from SceneLoader/ImportMeshAsync
 * @param {{strength?:number,direction?:[number,number]}} options
 * @returns controller to update or dispose wind
 */
export function attachAuraliaFoliageWind(scene, meshes, options = {}) {
  const state = {
    time: 0,
    strength: Math.max(0, Number(options.strength ?? 0.8)),
    direction: options.direction ?? [1, 0.25],
  };
  const plugins = [];
  const seen = new Set();
  for (const mesh of meshes) {
    const materials = mesh.material?.subMaterials ?? (mesh.material ? [mesh.material] : []);
    for (const material of materials) {
      if (!(material instanceof PBRMaterial)) continue;
      if (!String(material.name).includes('Auralia_V4_Leaves_')) continue;
      if (seen.has(material)) continue;
      seen.add(material);
      plugins.push(new AuraliaFoliageWindPlugin(material, state));
    }
  }
  const observer = scene.onBeforeRenderObservable.add(() => {
    // Limit float precision loss in shaders after long sessions.
    state.time = (state.time + scene.getEngine().getDeltaTime() / 1000) % 300;
  });
  return {
    state,
    get materialCount() { return plugins.length; },
    setStrength(value) { state.strength = Math.max(0, Number(value)); },
    setDirection(x, z) { state.direction = [x, z]; },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const plugin of plugins) plugin.dispose?.();
    },
  };
}
