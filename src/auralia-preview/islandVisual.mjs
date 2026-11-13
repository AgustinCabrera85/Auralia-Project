import { VertexData } from '@babylonjs/core';

const EDGE_PART = /_(GRASS_TOP|ROCK_UNDERBELLY)$/;
const positionKey = (positions, index) => {
  const i = index * 3;
  return `${Math.round(positions[i] * 10000)},${Math.round(positions[i + 1] * 10000)},${Math.round(positions[i + 2] * 10000)}`;
};

/** A one-step render proxy. The imported v6 mesh and the GLB file are unchanged. */
export function createIslandVisual(scene, source) {
  if (!EDGE_PART.test(source.name)) return null;
  const original = VertexData.ExtractFromMesh(source);
  if (!original.positions?.length || !original.indices?.length) return null;
  const oldPositions = original.positions, oldUVs = original.uvs;
  const oldIndices = original.indices;
  const count = oldPositions.length / 3;
  const canonical = Array.from({ length: count }, (_, i) => positionKey(oldPositions, i));
  const representatives = new Map();
  for (let i = 0; i < count; i++) if (!representatives.has(canonical[i])) representatives.set(canonical[i], i);
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const topology = new Map();
  for (let t = 0; t < oldIndices.length; t += 3) {
    const triangle = [oldIndices[t], oldIndices[t + 1], oldIndices[t + 2]];
    for (let side = 0; side < 3; side++) {
      const a = triangle[side], b = triangle[(side + 1) % 3], opposite = triangle[(side + 2) % 3];
      const key = edgeKey(canonical[a], canonical[b]);
      if (!topology.has(key)) topology.set(key, { a: canonical[a], b: canonical[b], opposite: [] });
      topology.get(key).opposite.push(canonical[opposite]);
    }
  }
  const neighbors = new Map();
  for (const edge of topology.values()) if (edge.opposite.length === 1) {
    if (!neighbors.has(edge.a)) neighbors.set(edge.a, new Set());
    if (!neighbors.has(edge.b)) neighbors.set(edge.b, new Set());
    neighbors.get(edge.a).add(edge.b);
    neighbors.get(edge.b).add(edge.a);
  }
  const point = (key, axis) => oldPositions[representatives.get(key) * 3 + axis];
  const positions = Array.from(oldPositions), uvs = oldUVs ? Array.from(oldUVs) : null;
  const newIndices = [];
  const middle = new Map();
  function midpoint(a, b) {
    const rawKey = edgeKey(String(a), String(b));
    if (middle.has(rawKey)) return middle.get(rawKey);
    const edge = topology.get(edgeKey(canonical[a], canonical[b]));
    const boundary = edge.opposite.length === 1;
    const prev = boundary ? [...(neighbors.get(canonical[a]) ?? [])].find(key => key !== canonical[b]) : null;
    const next = boundary ? [...(neighbors.get(canonical[b]) ?? [])].find(key => key !== canonical[a]) : null;
    const index = positions.length / 3;
    for (let axis = 0; axis < 3; axis++) {
      const pa = oldPositions[a * 3 + axis], pb = oldPositions[b * 3 + axis];
      let coordinate = (pa + pb) * 0.5;
      if (prev && next) {
        // Four-point boundary interpolation rounds the outline while every
        // authored vertex stays exactly where the GLB placed it.
        coordinate = (9 * (pa + pb) - point(prev, axis) - point(next, axis)) / 16;
      } else if (edge.opposite.length === 2) {
        coordinate += (point(edge.opposite[0], axis) + point(edge.opposite[1], axis) - pa - pb) / 16;
      }
      positions.push(coordinate);
    }
    if (uvs) uvs.push((oldUVs[a * 2] + oldUVs[b * 2]) / 2,
      (oldUVs[a * 2 + 1] + oldUVs[b * 2 + 1]) / 2);
    middle.set(rawKey, index);
    return index;
  }
  for (let t = 0; t < oldIndices.length; t += 3) {
    const a = oldIndices[t], b = oldIndices[t + 1], c = oldIndices[t + 2];
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const proxy = source.clone(`${source.name}_SUAVIZADO_PREVIEW`, source.parent, true);
  proxy.makeGeometryUnique();
  const data = new VertexData();
  // The authored glTF deliberately has no normal attribute. Babylon derives
  // its face lighting at draw time; injecting computed normals changes its
  // normal-map path and washes the vegetated tops to grey.
  data.positions = positions;
  data.indices = newIndices;
  if (uvs) data.uvs = uvs;
  data.applyToMesh(proxy);
  proxy.isPickable = false;
  proxy.metadata = { ...source.metadata, visualProxy: true, sourceTriangles: oldIndices.length / 3 };
  proxy.isVisible = false;
  return { source, proxy };
}
