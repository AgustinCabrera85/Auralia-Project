import { Matrix, Mesh, MultiMaterial, Quaternion, SceneLoader, Vector3 } from '@babylonjs/core';
import { configureFoliageV4Material } from '../world/LandscapeAtmosphere';
import { FOLIAGE_V4_ASSETS } from '../world/foliageV4Catalog';

// Existing illustrated V4 LOD meshes are shared as thin-instance templates.
// Placement is a preview approximation driven by the native painted weights.
const KINDS = [
  { asset: 'v4TreeSoftEmerald', channel: 0, spacing: 72, chance: 0.36 },
  { asset: 'v4TreeBroadMeadow', channel: 4, spacing: 76, chance: 0.32 },
  { asset: 'v4TreeTallClouds', channel: 0, spacing: 78, chance: 0.30 },
  { asset: 'v4TreeLeaningSunlit', channel: 0, spacing: 82, chance: 0.28 },
  { asset: 'v4BushRoundLime', channel: 0, spacing: 60, chance: 0.26 },
  { asset: 'v4BushFlowerWhite', channel: 4, spacing: 62, chance: 0.25 },
  { asset: 'v4GrassShort', channel: 0, spacing: 36, chance: 0.42 },
  { asset: 'v4GrassGolden', channel: 1, spacing: 48, chance: 0.30 },
].map(kind => ({ ...kind, path: FOLIAGE_V4_ASSETS[kind.asset].lodPath,
  scale: FOLIAGE_V4_ASSETS[kind.asset].referenceScale,
  radius: FOLIAGE_V4_ASSETS[kind.asset].renderDistance }));
const hash = (x, z, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

async function importTemplate(scene, kind) {
  const file = kind.path.split('/').pop();
  const result = await SceneLoader.ImportMeshAsync('', '/assets/foliage-v4/', file, scene);
  const parts = result.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
  if (!parts.length) throw new Error(`GLB de vegetación sin geometría: ${file}`);
  for (const part of parts) {
    part.computeWorldMatrix(true);
    part.bakeTransformIntoVertices(part.getWorldMatrix().clone());
    part.parent = null;
    part.position.setAll(0); part.scaling.setAll(1); part.rotation.setAll(0);
    part.rotationQuaternion = null;
  }
  const source = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  if (!source) throw new Error(`No se pudo unir la vegetación: ${file}`);
  for (const mesh of result.meshes) if (mesh !== source && !mesh.isDisposed()) mesh.dispose(false, false);
  source.name = `VEGETACION_PROXIMA_${file}`;
  source.isPickable = false;
  const materials = source.material instanceof MultiMaterial
    ? source.material.subMaterials : [source.material];
  for (const material of materials) configureFoliageV4Material(material);
  source.metadata = { previewVegetation: true, source: file };
  source.setEnabled(false);
  return source;
}

export async function createPreviewVegetation(scene, atlas, channelField) {
  const sources = await Promise.all(KINDS.map(kind => importTemplate(scene, kind)));
  let lastX = Infinity, lastZ = Infinity;
  let instanceCount = 0;
  function update(force = false) {
    const camera = scene.activeCamera;
    if (!camera) return;
    const point = camera.name === 'CAM_orbit' && camera.radius < 2800 ? camera.target : camera.position;
    if (!force && Math.hypot(point.x - lastX, point.z - lastZ) < 150) return;
    lastX = point.x; lastZ = point.z;
    instanceCount = 0;
    KINDS.forEach((kind, index) => {
      const source = sources[index], matrices = [];
      const cell = kind.spacing, radius = kind.radius;
      const left = Math.floor((point.x - radius) / cell), right = Math.ceil((point.x + radius) / cell);
      const top = Math.floor((point.z - radius) / cell), bottom = Math.ceil((point.z + radius) / cell);
      for (let iz = top; iz <= bottom; iz++) for (let ix = left; ix <= right; ix++) {
        const x = (ix + 0.18 + hash(ix, iz, index + 1) * 0.64) * cell;
        const z = (iz + 0.18 + hash(ix, iz, index + 9) * 0.64) * cell;
        if (Math.hypot(x - point.x, z - point.z) > radius || !atlas.tileAt(x, z)) continue;
        const channel = channelField.nearest(x, z);
        if (channel && channel.distance < channel.inner + 3) continue;
        const surface = atlas.getSurface(x, z, 14);
        if (surface.height < atlas.manifest.seaLevelMetres + 2 || surface.height > 540 ||
            Math.hypot(surface.slopeX, surface.slopeZ) > 0.42) continue;
        const weights = atlas.materialAt(x, z);
        const painted = weights.reduce((sum, value) => sum + value, 0);
        if (painted < 0.08 || weights[2] > 0.22 || weights[3] > 0.20 ||
            weights[5] > 0.38 || weights[6] > 0.20) continue;
        const biome = weights[kind.channel];
        if (biome < (kind.channel === 4 ? 0.18 : 0.24) || hash(ix, iz, index + 19) > kind.chance * biome) continue;
        const yaw = hash(ix, iz, index + 28) * Math.PI * 2;
        const scale = kind.scale * (0.75 + hash(ix, iz, index + 41) * 0.6);
        const matrix = Matrix.Compose(new Vector3(scale, scale, scale),
          Quaternion.RotationAxis(Vector3.Up(), yaw), new Vector3(x, surface.height, z));
        matrices.push(...matrix.m);
      }
      source.setEnabled(matrices.length > 0);
      source.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
      if (matrices.length) source.thinInstanceRefreshBoundingInfo();
      instanceCount += matrices.length / 16;
    });
  }
  return { update, get instanceCount() { return instanceCount; }, dispose: () => sources.forEach(source => source.dispose()) };
}
