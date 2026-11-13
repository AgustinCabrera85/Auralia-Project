import { Mesh, VertexData } from '@babylonjs/core';
import { loadWaterMasks } from '../world/editor/AuraliaWaterProfiles';
import { createWorldWaterMaterial, updateWorldWaterMaterial } from '../world/editor/LiveWaterProfiles';
import { riverControlPoints } from './riverControlPoints.mjs';
export { riverControlPoints } from './riverControlPoints.mjs';

const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function createChunk(scene, spline, rows, material, channelField, index) {
  const vertices = [], uvs = [], flow = [], colors = [], indices = [], waterline = [];
  const tileIds = new Set();
  const halfWidth = spline.width / 2;
  const lanes = [-1, -0.7, 0, 0.7, 1];
  for (let i = 0; i < rows.length; i++) {
    const point = rows[i];
    const previous = rows[Math.max(0, i - 1)];
    const next = rows[Math.min(rows.length - 1, i + 1)];
    const slope = Math.abs(next.waterY - previous.waterY) /
      Math.max(1, distanceXZ(previous, next));
    const bend = 1 - Math.max(-1, Math.min(1,
      previous.normalX * next.normalX + previous.normalZ * next.normalZ));
    const speed = Math.min(1, 0.24 + Math.sqrt(slope) * 0.95 + bend * 0.4);
    const turbulence = Math.min(1, 0.12 + slope * 2.5 + bend * 0.8);
    const downstream = previous.waterY >= next.waterY ? 1 : -1;
    for (const cross of lanes) {
      const x = point.x + point.normalX * halfWidth * cross;
      const z = point.z + point.normalZ * halfWidth * cross;
      // The exported profiles still cross terrain above the shallow channel.
      // Preserve a visible provisional ribbon in those sections, but derive it
      // from the source field, never from a mesh LOD. The audit reports these
      // unsupported profiles; this fallback is not an authored hydraulic grade.
      const ground = channelField.heightAt(x,z);
      const surface = Math.max(point.waterY, ground + 0.8);
      vertices.push(x, surface, z);
      waterline.push({ x, z });
      const tile = channelField.atlasTileAt(x, z);
      if (tile) tileIds.add(tile.id);
      uvs.push(x / 16, z / 16);
      flow.push(point.normalZ * downstream, -point.normalX * downstream);
      // Keep a shallow visual channel where the reversible 3 m excavation
      // cannot reach the authored waterline on a steep traverse.
      const depth = Math.max(0.7 * (1 - Math.abs(cross)),
        surface - ground);
      const shore = Math.max(Math.pow(Math.abs(cross), 4) * 0.98,
        1 - Math.min(1, depth / 0.5));
      // Match GeographyStream's shore, normalized speed, turbulence and depth.
      colors.push(shore, speed, turbulence, Math.min(1, depth / 5));
    }
    if (i) for (let lane = 0; lane < lanes.length - 1; lane++) {
      const previous = (i - 1) * lanes.length + lane, current = i * lanes.length + lane;
      indices.push(previous, previous + 1, current,
        previous + 1, current + 1, current);
    }
  }
  const mesh = new Mesh(`RIO_${spline.id}_${index}`, scene);
  const data = new VertexData();
  data.positions = vertices;
  data.uvs = uvs;
  data.uvs2 = flow;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
  mesh.isPickable = false;
  mesh.metadata = { previewRiver: spline.id, authoredWidth: spline.width, channel: true };
  mesh.setEnabled(false);
  const middle = rows[Math.floor(rows.length / 2)];
  const radius = Math.max(...rows.map(row => distanceXZ(row, middle))) + halfWidth;
  return { mesh, x: middle.x, z: middle.z, radius, waterline, tileIds,
    positions: new Float32Array(vertices), lodSignature: '' };
}

function landmarkFor(atlas, spline, points) {
  const center = (points.length - 1) / 2;
  const candidates = points.map((point, index) => ({ point, index }))
    .filter(({ point }) => atlas.sample(point.x, point.z) > atlas.manifest.seaLevelMetres + 1)
    .sort((a, b) => Math.abs(a.index - center) - Math.abs(b.index - center));
  const point = candidates[0]?.point ?? points[Math.round(center)];
  return { name: spline.name, x: point.x, z: point.z, range: spline.width <= 12 ? 420 : 550,
    river: spline.id };
}

/** Streamed spline surfaces with the same World Water river shader and 1K masks as main. */
export function createPreviewRivers(scene, atlas, splines, channelField) {
  const masks = loadWaterMasks(scene);
  const material = createWorldWaterMaterial(scene, 'river', masks);
  material.zOffset = -2;
  material.metadata = { source: 'Auralia World Water river profile', shared: true };
  const chunks = [], landmarks = [];
  for (const spline of splines.filter(item => item.type === 'river' && item.width > 0)) {
    const points = riverControlPoints(spline);
    const rows = channelField.rowsByRiver.get(spline.id);
    if (points.length < 2 || !rows || rows.length < 2) continue;
    landmarks.push(landmarkFor(atlas, spline, points));
    for (let start = 0, index = 0; start < rows.length - 1; start += 48, index++) {
      const part = rows.slice(start, Math.min(start + 49, rows.length));
      if (part.length > 1) chunks.push(createChunk(scene, spline, part, material, channelField, index));
    }
  }
  const beforeRender = scene.onBeforeRenderObservable.add(() =>
    updateWorldWaterMaterial(material, 'river', scene, performance.now() / 1000));
  let activeCount = 0;
  return {
    landmarks,
    get activeCount() { return activeCount; },
    get chunkCount() { return chunks.length; },
    update(focus, localView, highMeshes, selectedRiver) {
      activeCount = 0;
      const nearbyRivers = new Set(selectedRiver ? [selectedRiver] : []);
      if (localView) for (const chunk of chunks) {
        if (Math.hypot(chunk.x - focus.x, chunk.z - focus.z) < 2200 + chunk.radius)
          nearbyRivers.add(chunk.mesh.metadata.previewRiver);
      }
      for (const chunk of chunks) {
        const visible = localView && nearbyRivers.has(chunk.mesh.metadata.previewRiver) &&
          Math.hypot(chunk.x-focus.x,chunk.z-focus.z)<2600+chunk.radius;
        chunk.mesh.setEnabled(visible);
        if (!visible) continue;
        activeCount++;
      }
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(beforeRender);
      for (const chunk of chunks) chunk.mesh.dispose();
      material.dispose(); masks.caustics.dispose(); masks.waterfall.dispose();
    }
  };
}
