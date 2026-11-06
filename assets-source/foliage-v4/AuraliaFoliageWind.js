/**
 * AURALIA — Stylized Tree / Branch / Foliage Shader V5 (Babylon.js, WebGL2)
 * ----------------------------------------------------------------------
 * Drop-in replacement for the V4 AuraliaFoliageWind.js module.
 * Reuses existing V4 GLBs, UVs, alpha atlases and LODs without changing a byte.
 *
 * Adds:
 *   1) Shared, root-anchored wind on wood (trunks + branches) and leaf cards.
 *   2) Tiny additional flutter and safe UV movement for leaves.
 *   3) Procedural, painterly bark colour variation INSIDE PBR lighting.
 *   4) One scene update observer, reused across successive asset imports.
 *
 * Usage:
 *   import { attachAuraliaFoliageWind } from './AuraliaFoliageWind.js';
 *   const wind = attachAuraliaFoliageWind(scene, result.meshes, {
 *     strength: 0.65, direction: [1, 0.25], barkStrength: 0.9,
 *   });
 *
 * Call attachAuraliaFoliageWind again for subsequently imported meshes.
 * Returns the same scene-level controller. All V4 materials are autodetected.
 *
 * Scope/limits:
 * - WebGL2/GLSL PBRMaterial (not WebGPU/WGSL).
 * - Does not alter actual wood geometry, alpha textures, or GLB file sizes.
 * - Animated main-color pass; independent shadow/depth shaders may need matching
 *   displacement if you notice subtle shadow/foliage mismatches.
 * - Intentionally does not animate grass, flowers or unsupported materials.
 */

import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';

const SCENES = new WeakMap();
const MATERIAL_KIND = {
  LEAVES: 'leaves',
  WOOD: 'wood',
};

function classify(material) {
  const name = String(material?.name || '').toLowerCase();
  if (name.includes('auralia_v4_leaves_')) return MATERIAL_KIND.LEAVES;
  if (name.includes('auralia_v4_wood_') || name.includes('auralia_v4_twig')) {
    return MATERIAL_KIND.WOOD;
  }
  return null;
}

function materialList(mesh) {
  const material = mesh?.material;
  if (!material) return [];
  return Array.isArray(material.subMaterials)
    ? material.subMaterials.filter(Boolean)
    : [material];
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function cleanDirection(direction) {
  const x = safeNumber(direction?.[0], 1);
  const z = safeNumber(direction?.[1], 0.2);
  const length = Math.hypot(x, z);
  if (length < 0.001) return [1, 0];
  return [x / length, z / length];
}

/** One shared PBR plugin class; the shader uses defines for wood vs. leaves. */
class AuraliaLivingFoliagePlugin extends MaterialPluginBase {
  constructor(material, sharedState, role) {
    // getCustomCode may be queried during super(): its keys are constant.
    super(material, 'AuraliaLivingFoliageV5', 200, {
      AUR_V5_WIND: false,
      AUR_V5_WOOD: false,
      AUR_V5_LEAVES: false,
    });
    this.state = sharedState;
    this.role = role;
    this._enable(true);
  }

  isCompatible(shaderLanguage) {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  prepareDefines(defines) {
    defines.AUR_V5_WIND = true;
    defines.AUR_V5_WOOD = this.role === MATERIAL_KIND.WOOD;
    defines.AUR_V5_LEAVES = this.role === MATERIAL_KIND.LEAVES;
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'aurTimeV5', size: 1, type: 'float' },
        { name: 'aurWindStrengthV5', size: 1, type: 'float' },
        { name: 'aurWindDirV5', size: 2, type: 'vec2' },
        { name: 'aurModelHeightV5', size: 1, type: 'float' },
        { name: 'aurBarkStrengthV5', size: 1, type: 'float' },
        { name: 'aurWoodMotionV5', size: 1, type: 'float' },
      ],
    };
  }

  _writeUniforms(ubo, subMesh) {
    const s = this.state;
    // Submesh-local bounding height: works for full-resolution and LOD1,
    // and for distinct trees sharing a material (if the loader reuses it).
    const mesh = subMesh?.getMesh?.() || subMesh?.getRenderingMesh?.();
    const box = mesh?.getBoundingInfo?.()?.boundingBox;
    const maxY = box?.maximum?.y;
    const height = Number.isFinite(maxY) ? Math.max(0.25, maxY) : 7;
    ubo.updateFloat('aurTimeV5', s.time);
    ubo.updateFloat('aurWindStrengthV5', s.strength);
    ubo.updateFloat2('aurWindDirV5', s.direction[0], s.direction[1]);
    ubo.updateFloat('aurModelHeightV5', height);
    ubo.updateFloat('aurBarkStrengthV5', s.barkStrength);
    ubo.updateFloat('aurWoodMotionV5', s.branchMotion);
  }

  bindForSubMesh(ubo, _scene, _engine, subMesh) {
    this._writeUniforms(ubo, subMesh);
  }

  // On some Babylon render paths the regular bind is cached. Keep per-mesh
  // height + time current even when two meshes share a PBR material.
  hardBindForSubMesh(ubo, _scene, _engine, subMesh) {
    this._writeUniforms(ubo, subMesh);
  }

  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          #ifdef AUR_V5_WOOD
            varying vec3 vAurWoodPositionV5;
          #endif
        `,
        CUSTOM_VERTEX_UPDATE_POSITION: `
          #ifdef AUR_V5_WOOD
            // Local coordinates: glTF Y-up; no UVs or texture required for bark.
            vAurWoodPositionV5 = positionUpdated;
          #endif
          #ifdef AUR_V5_LEAVES
            #ifdef UV1
              // < 1 atlas texel of movement; V4 has tile padding.
              float aurUvPhase = dot(positionUpdated.xz, vec2(2.17, 1.73));
              uvUpdated.x += sin(aurTimeV5 * 2.25 + aurUvPhase)
                             * 0.0007 * aurWindStrengthV5;
            #endif
          #endif
        `,
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
          #ifdef AUR_V5_WIND
            // Wind phase computed in world space: nearby trees do not all move
            // in lockstep; thin instances naturally receive a different phase.
            float aurH = max(aurModelHeightV5, 0.25);
            float aurLocalY = max(positionUpdated.y, 0.0);
            float aurHeight01 = clamp(aurLocalY / aurH, 0.0, 1.0);
            float aurBendWeight = aurHeight01 * aurHeight01;
            vec2 aurDirection = normalize(aurWindDirV5 + vec2(0.00001, 0.00001));
            float aurPhase = dot(worldPos.xz, vec2(0.32, 0.47));
            float aurMain = sin(aurTimeV5 * 0.93 + aurPhase);
            float aurGust = sin(aurTimeV5 * 1.53 + aurPhase * 0.62);
            float aurSway = (0.75 * aurMain + 0.25 * aurGust) * aurBendWeight;
            // Short bushes bend less than 8m trees; top displacement <= ~11cm.
            float aurAmplitude = min(0.11, aurH * 0.016) * aurWindStrengthV5;
            #ifdef AUR_V5_WOOD
              aurAmplitude *= aurWoodMotionV5;
            #endif
            worldPos.xz += aurDirection * aurAmplitude * aurSway;
            #ifdef AUR_V5_LEAVES
              // Extra motion at the canopy tips. No new animation tracks.
              float aurFlutter = sin(aurTimeV5 * 3.65 + aurPhase * 3.1);
              float aurFlutterAmp = min(0.012, aurH * 0.0025);
              worldPos.xz += aurDirection * (aurFlutter * aurFlutterAmp
                                            * aurWindStrengthV5 * aurHeight01);
            #endif
            // PBR vertex pipeline needs vPositionW after modifying worldPos.
            vPositionW = vec3(worldPos);
          #endif
        `,
      };
    }

    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          #ifdef AUR_V5_WOOD
            varying vec3 vAurWoodPositionV5;
          #endif
        `,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
          #ifdef AUR_V5_WOOD
            // Soft illustrative bark colour, BEFORE PBR lighting.
            // Procedural strokes follow trunk/branch coordinates and remain
            // subtle to avoid noisy grain at typical gameplay distance.
            vec3 aurP = vAurWoodPositionV5;
            float aurWobble = sin(aurP.x * 8.1 + aurP.z * 5.4 + aurP.y * 3.8);
            float aurGrain = sin(aurP.y * 19.0 + 0.7 * aurWobble);
            float aurBroad = sin(aurP.y * 5.0 + aurP.x * 3.6 - aurP.z * 2.8);
            float aurHeightTint = clamp(aurP.y / max(aurModelHeightV5, 0.25), 0.0, 1.0);
            float aurPaint = 1.0 + aurBarkStrengthV5
                              * (0.065 * aurGrain + 0.045 * aurBroad);
            vec3 aurWarmTint = mix(vec3(0.96, 0.93, 0.90),
                                   vec3(1.08, 1.04, 0.95), aurHeightTint);
            surfaceAlbedo *= aurWarmTint * aurPaint;
          #endif
        `,
      };
    }
    return null;
  }
}

function createController(scene, options = {}) {
  const state = {
    time: 0,
    strength: clamp(safeNumber(options.strength, 0.65), 0, 2),
    direction: cleanDirection(options.direction || [1, 0.2]),
    barkStrength: clamp(safeNumber(options.barkStrength, 0.85), 0, 1.5),
    branchMotion: clamp(safeNumber(options.branchMotion, 1), 0, 1),
  };
  const plugins = new Map();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    if (Number.isFinite(dt) && dt > 0) state.time = (state.time + dt) % 1000;
  });

  const controller = {
    state,
    get materialCount() { return plugins.size; },
    get barkMaterialCount() {
      return [...plugins.values()].filter(p => p.role === MATERIAL_KIND.WOOD).length;
    },
    get leafMaterialCount() {
      return [...plugins.values()].filter(p => p.role === MATERIAL_KIND.LEAVES).length;
    },
    setStrength(value) { state.strength = clamp(safeNumber(value, state.strength), 0, 2); },
    setDirection(x, z) { state.direction = cleanDirection([x, z]); },
    setBarkStrength(value) {
      state.barkStrength = clamp(safeNumber(value, state.barkStrength), 0, 1.5);
    },
    setBranchMotion(value) {
      state.branchMotion = clamp(safeNumber(value, state.branchMotion), 0, 1);
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      // Revert shaders to normal PBR without destroying GLB materials.
      for (const plugin of plugins.values()) plugin._enable(false);
      plugins.clear();
      SCENES.delete(scene);
    },
    addMeshes(meshes) {
      let added = 0;
      for (const mesh of meshes || []) {
        for (const material of materialList(mesh)) {
          if (!(material instanceof PBRMaterial) || plugins.has(material)) continue;
          const role = classify(material);
          if (!role) continue;
          plugins.set(material, new AuraliaLivingFoliagePlugin(material, state, role));
          added++;
        }
      }
      return added;
    },
  };
  return controller;
}

/**
 * Add the upgraded wind and bark treatment to imported V4 vegetation.
 * Compatible with existing V4 imports; call once per import batch.
 *
 * @param {import('@babylonjs/core/scene.js').Scene} scene
 * @param {Array} meshes - result.meshes returned by SceneLoader / ImportMeshAsync
 * @param {{strength?: number, direction?: [number,number], barkStrength?: number, branchMotion?: number}} options
 */
export function attachAuraliaFoliageWind(scene, meshes, options = {}) {
  if (!scene?.onBeforeRenderObservable?.add) {
    throw new Error('[Auralia] Falta una escena válida de Babylon.js.');
  }
  let controller = SCENES.get(scene);
  if (!controller) {
    controller = createController(scene, options);
    SCENES.set(scene, controller);
  }
  controller.addMeshes(meshes);
  return controller;
}

/** Explicit alias, if you prefer the more descriptive name. */
export const attachAuraliaStylizedFoliage = attachAuraliaFoliageWind;
