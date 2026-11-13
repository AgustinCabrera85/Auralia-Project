import { Matrix, Mesh, Quaternion, SceneLoader, Vector3 } from '@babylonjs/core';
import { ASSET_CATALOG } from '../world/assetCatalog';
import { configureGeologyMaterial } from '../world/LandscapeAtmosphere';
import { ROCK_PART_FOOTPRINTS, rockScaleForDiameter } from '../world/rockPackData';

// A few centered pieces from main's rock pack, shared through thin instances.
const PARTS = [
  { index: 0, diameter: 2.2, spacing: 65, chance: 0.32 },
  { index: 7, diameter: 0.8, spacing: 42, chance: 0.30 },
  { index: 10, diameter: 0.25, spacing: 28, chance: 0.22 },
];

function hash(x, z, seed) {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

async function importParts(scene) {
  const path = ASSET_CATALOG.packRocas.path;
  const result = await SceneLoader.ImportMeshAsync('', path.slice(0, path.lastIndexOf('/') + 1),
    path.split('/').pop(), scene);
  const meshes = result.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
  const selected = [];
  for (const part of PARTS) {
    const mesh = meshes.find(item => item.name === `tripo_part_${part.index}`);
    if (!mesh) throw new Error(`Falta la roca ${part.index} del catálogo principal`);
    mesh.computeWorldMatrix(true);
    mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());
    mesh.refreshBoundingInfo(true);
    const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
    mesh.bakeTransformIntoVertices(Matrix.Translation(
      -(minimum.x + maximum.x) / 2, -minimum.y, -(minimum.z + maximum.z) / 2));
    mesh.parent = null;
    mesh.position.setAll(0);
    mesh.scaling.setAll(1);
    mesh.rotation.setAll(0);
    mesh.rotationQuaternion = null;
    mesh.name = `ROCA_PROXIMA_${part.index}`;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    configureGeologyMaterial(mesh.material, 'packRocas');
    const bounds = mesh.getBoundingInfo().boundingBox;
    const width = Math.max(bounds.maximum.x - bounds.minimum.x,
      bounds.maximum.z - bounds.minimum.z);
    if (Math.abs(width - ROCK_PART_FOOTPRINTS[part.index]) > 0.001)
      throw new Error(`Cambió la escala de la roca ${part.index}`);
    selected.push(mesh);
  }
  for (const mesh of result.meshes)
    if (!selected.includes(mesh) && !mesh.isDisposed()) mesh.dispose(false, false);
  return selected;
}

export async function createPreviewRocks(scene, atlas, channelField) {
  const sources = await importParts(scene);
  let lastX = Infinity, lastZ = Infinity;
  let instanceCount = 0;

  function update(force = false) {
    const camera = scene.activeCamera;
    if (!camera) return;
    const point = camera.name === 'CAM_orbit' && camera.radius < 2800
      ? camera.target : camera.position;
    if (!force && Math.hypot(point.x - lastX, point.z - lastZ) < 150) return;
    lastX = point.x; lastZ = point.z;
    instanceCount = 0;
    PARTS.forEach((part, kind) => {
      const matrices = [];
      const radius = 380, cell = part.spacing;
      const left = Math.floor((point.x - radius) / cell), right = Math.ceil((point.x + radius) / cell);
      const top = Math.floor((point.z - radius) / cell), bottom = Math.ceil((point.z + radius) / cell);
      for (let iz = top; iz <= bottom; iz++) for (let ix = left; ix <= right; ix++) {
        const x = (ix + 0.18 + hash(ix, iz, kind + 51) * 0.64) * cell;
        const z = (iz + 0.18 + hash(ix, iz, kind + 59) * 0.64) * cell;
        if (Math.hypot(x - point.x, z - point.z) > radius || !atlas.tileAt(x, z)) continue;
        const channel = channelField.nearest(x, z);
        if (channel && channel.distance < channel.inner + 2) continue;
        const surface = atlas.getSurface(x, z, 5);
        if (surface.height < atlas.manifest.seaLevelMetres + 1 ||
            Math.hypot(surface.slopeX, surface.slopeZ) > 0.55) continue;
        const weights = atlas.materialAt(x, z);
        const density = Math.min(1, weights[1] * 0.7 + weights[5] + weights[2] * 0.15);
        if (hash(ix, iz, kind + 67) > part.chance * density) continue;
        const diameter = part.diameter * (0.75 + hash(ix, iz, kind + 73) * 0.5);
        const scale = rockScaleForDiameter(part.index, diameter);
        const yaw = hash(ix, iz, kind + 79) * Math.PI * 2;
        const y = channelField.heightAt(x, z) - 0.05;
        matrices.push(...Matrix.Compose(new Vector3(scale, scale, scale),
          Quaternion.RotationAxis(Vector3.Up(), yaw), new Vector3(x, y, z)).m);
      }
      const source = sources[kind];
      source.setEnabled(matrices.length > 0);
      source.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
      if (matrices.length) source.thinInstanceRefreshBoundingInfo();
      instanceCount += matrices.length / 16;
    });
  }

  return { update, get instanceCount() { return instanceCount; },
    dispose: () => sources.forEach(source => source.dispose()) };
}
