import { riverControlPoints } from './riverControlPoints.mjs';
import { FAR_SUBDIVISIONS, NEAR_SUBDIVISIONS } from './previewLod.mjs';

const CELL = 96;
const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A reversible render-time channel. The R16 atlas and authored splines stay untouched. */
export function createRiverChannelField(atlas, splines) {
  const rowsByRiver = new Map();
  const cells = new Map();
  for (const spline of splines.filter(item => item.type === 'river' && item.width > 0)) {
    const points = riverControlPoints(spline);
    if (points.length < 2) continue;
    const rows = [];
    let distance = 0;
    for (let segment = 0; segment < points.length - 1; segment++) {
      const a = points[segment], b = points[segment + 1];
      const length = distanceXZ(a, b);
      if (length < 0.1) continue;
      const steps = Math.ceil(length / 8);
      for (let step = segment ? 1 : 0; step <= steps; step++) {
        const t = step / steps;
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (rows.length) distance += Math.hypot(x - rows.at(-1).x, z - rows.at(-1).z);
        rows.push({ x, z, authoredY: a.y + (b.y - a.y) * t, distance });
      }
    }
    if (rows.length < 2) continue;
    const halfWidth = spline.width / 2;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], prev = rows[Math.max(0, i - 1)], next = rows[Math.min(rows.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      row.normalX = -dz / length;
      row.normalZ = dx / length;
      const bankHeights = [-1, -.5, 0, .5, 1].map(cross =>
        atlas.sample(row.x + row.normalX * halfWidth * cross,
          row.z + row.normalZ * halfWidth * cross));
      // Keep the surface below both banks and the centerline even on steep
      // traverses. A shallow channel cap made those sections float in midair.
      const lowestBank = Math.min(...bankHeights);
      row.waterY = Math.min(lowestBank, Math.max(row.authoredY, lowestBank - 5)) - 0.35;
    }
    rowsByRiver.set(spline.id, rows);
    const inner = Math.max(halfWidth + 6, 13);
    const outer = inner + 20;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      const segment = { a, b, halfWidth, inner, outer, id: spline.id };
      const minX = Math.floor((Math.min(a.x, b.x) - outer) / CELL);
      const maxX = Math.floor((Math.max(a.x, b.x) + outer) / CELL);
      const minZ = Math.floor((Math.min(a.z, b.z) - outer) / CELL);
      const maxZ = Math.floor((Math.max(a.z, b.z) + outer) / CELL);
      for (let cz = minZ; cz <= maxZ; cz++) for (let cx = minX; cx <= maxX; cx++) {
        const cellKey = `${cx},${cz}`;
        if (!cells.has(cellKey)) cells.set(cellKey, []);
        cells.get(cellKey).push(segment);
      }
    }
  }

  function nearest(x, z) {
    let best = null;
    for (const segment of cells.get(key(x, z)) ?? []) {
      const dx = segment.b.x - segment.a.x, dz = segment.b.z - segment.a.z;
      const length2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1,
        ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / length2));
      const px = segment.a.x + dx * t, pz = segment.a.z + dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (distance > segment.outer || (best && distance >= best.distance)) continue;
      best = { distance, waterY: segment.a.waterY + (segment.b.waterY - segment.a.waterY) * t,
        inner: segment.inner, outer: segment.outer, halfWidth: segment.halfWidth, id: segment.id };
    }
    return best;
  }

  function heightAt(x, z) {
    const base = atlas.sample(x, z);
    let ground = base;
    // Waterways can overlap or turn sharply. The union of their channels must
    // stay below every surface there, regardless of which centerline is closer.
    for (const segment of cells.get(key(x, z)) ?? []) {
      const dx = segment.b.x - segment.a.x, dz = segment.b.z - segment.a.z;
      const t = Math.max(0, Math.min(1,
        ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / (dx * dx + dz * dz)));
      const distance = Math.hypot(x - segment.a.x - dx * t, z - segment.a.z - dz * t);
      if (distance > segment.outer) continue;
      const waterY = segment.a.waterY + (segment.b.waterY - segment.a.waterY) * t;
      const bed = waterY - 1.4;
      const shoulder = smoothstep(segment.inner, segment.outer, distance);
      const waterFootprint = 1 - smoothstep(segment.halfWidth, segment.inner, distance);
      ground = Math.max(base - 3,
        Math.min(ground, bed + (base - bed) * shoulder, base - 2.2 * waterFootprint));
    }
    return ground;
  }

  function tileVertexHeight(tile, gx, gz, subdivisions) {
    const x = tile.boundsXZ[0] + gx * atlas.size / subdivisions;
    const z = tile.boundsXZ[1] + gz * atlas.size / subdivisions;
    const original = heightAt(x, z);
    if (subdivisions !== NEAR_SUBDIVISIONS) return original;
    const edge = Math.min(gx, gz, subdivisions - gx, subdivisions - gz);
    if (edge >= 4) return original;
    // The nearby sector has four times as many edge vertices. Interpolate the
    // resident coarse edge and blend across four inner rows: no T-junction or
    // sudden cliff when a neighboring sector is still coarse.
    const onX = gx <= edge || subdivisions - gx <= edge;
    const along = onX ? gz : gx;
    const fixed = onX ? (gx < subdivisions / 2 ? 0 : subdivisions) :
      (gz < subdivisions / 2 ? 0 : subdivisions);
    const coarse = along / 4;
    const i = Math.min(FAR_SUBDIVISIONS - 1, Math.floor(coarse));
    const t = coarse - i;
    const sample = index => {
      const sx = onX ? tile.boundsXZ[0] + fixed * atlas.size / subdivisions :
        tile.boundsXZ[0] + index * atlas.size / FAR_SUBDIVISIONS;
      const sz = onX ? tile.boundsXZ[1] + index * atlas.size / FAR_SUBDIVISIONS :
        tile.boundsXZ[1] + fixed * atlas.size / subdivisions;
      return heightAt(sx, sz);
    };
    const coarseHeight = sample(i) * (1 - t) + sample(i + 1) * t;
    return original + (coarseHeight - original) * (1 - edge / 4);
  }
  function renderedHeightAt(x, z, subdivisions) {
    const tile = atlas.tileAt(x, z);
    if (!tile) return heightAt(x, z);
    const fx = Math.max(0, Math.min(subdivisions, (x - tile.boundsXZ[0]) / atlas.size * subdivisions));
    const fz = Math.max(0, Math.min(subdivisions, (z - tile.boundsXZ[1]) / atlas.size * subdivisions));
    const ix = Math.min(subdivisions - 1, Math.floor(fx));
    const iz = Math.min(subdivisions - 1, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    const grid = (gx, gz) => {
      return tileVertexHeight(tile, gx, gz, subdivisions);
    };
    const h00 = grid(ix, iz), h10 = grid(ix + 1, iz);
    const h01 = grid(ix, iz + 1), h11 = grid(ix + 1, iz + 1);
    return tx + tz <= 1
      ? h00 * (1 - tx - tz) + h10 * tx + h01 * tz
      : h10 * (1 - tz) + h11 * (tx + tz - 1) + h01 * (1 - tx);
  }

  return { rowsByRiver, nearest, heightAt, tileVertexHeight, renderedHeightAt,
    atlasTileAt: (x, z) => atlas.tileAt(x, z) };
}
