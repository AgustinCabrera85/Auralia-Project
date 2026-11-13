/**
 * Auralia World Studio v3.6 / 25-sector heightfield data reader.
 * Pure JS: no Babylon dependency. Metres: +X east, +Z south, +Y up.
 * This is an independent trial; never modifies the game's canonical terrainData.
 */
export class AuraliaHeightAtlas {
  constructor(manifest) {
    if (manifest?.schema !== 'auralia-worldstudio-trial-v1') throw new Error('Manifest de Auralia incompatible');
    this.manifest = manifest;
    this.tiles = new Map();
    this.quantization = manifest.heightEncoding;
    this.min = this.quantization.minMetres;
    this.max = this.quantization.maxMetres;
    this.size = manifest.tileSizeMeters;
    this.resolution = manifest.resolution;
    this.colorResolution = manifest.colorResolution;
    this.boundary = manifest.coordinateSystem.boundsXZ;
    this.materialResolution = 0;
    this.materialWeightsA = null;
    this.materialWeightsB = null;
  }

  static async load(url = '/auralia-preview/data/manifest.json', onProgress = () => {}) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se encontró el manifiesto: ${response.status}`);
    const atlas = new AuraliaHeightAtlas(await response.json());
    let done = 0;
    // Bounded concurrency: avoid 50 simultaneous fetch/decode operations.
    const jobs = [...atlas.manifest.tiles];
    async function work() {
      for (;;) {
        const tile = jobs.shift();
        if (!tile) return;
        const [heightResp, colorResp] = await Promise.all([fetch(tile.heightFile), fetch(tile.colorFile)]);
        if (!heightResp.ok || !colorResp.ok) throw new Error(`No se pudo cargar sector ${tile.id}`);
        const [heightBytes, colorBytes] = await Promise.all([heightResp.arrayBuffer(), colorResp.arrayBuffer()]);
        const expectedH = atlas.resolution * atlas.resolution * 2;
        const expectedC = atlas.colorResolution * atlas.colorResolution * 3;
        if (heightBytes.byteLength !== expectedH || colorBytes.byteLength !== expectedC) {
          throw new Error(`Archivo de sector incompleto: ${tile.id}`);
        }
        // DataView handles the declared little-endian R16 on any host CPU.
        const dv = new DataView(heightBytes);
        const height = new Uint16Array(atlas.resolution * atlas.resolution);
        for (let i = 0; i < height.length; i++) height[i] = dv.getUint16(i * 2, true);
        atlas.tiles.set(`${tile.cx},${tile.cz}`, { ...tile, height, color: new Uint8Array(colorBytes) });
        onProgress(++done, atlas.manifest.tiles.length);
      }
    }
    await Promise.all(Array.from({ length: 4 }, work));
    const materialResponse = await fetch('/auralia-preview/data/surface-materials.json');
    if (!materialResponse.ok) throw new Error(`No se encontraron los pesos de materiales: ${materialResponse.status}`);
    const materials = await materialResponse.json();
    const [responseA, responseB] = await Promise.all([
      fetch(materials.files.weightsA.path), fetch(materials.files.weightsB.path)
    ]);
    if (!responseA.ok || !responseB.ok) throw new Error('No se pudieron cargar las máscaras de materiales');
    atlas.setMaterialWeights(materials,
      new Uint8Array(await responseA.arrayBuffer()), new Uint8Array(await responseB.arrayBuffer()));
    return atlas;
  }

  setMaterialWeights(metadata, weightsA, weightsB) {
    const n = metadata.resolution;
    if (metadata.schema !== 'auralia-worldstudio-material-weights-v1' ||
        metadata.channelCount !== 7 || n !== 320 ||
        metadata.originXZ[0] !== this.boundary[0] || metadata.originXZ[1] !== this.boundary[1] ||
        metadata.spanXZ[0] !== this.boundary[2] - this.boundary[0] ||
        metadata.spanXZ[1] !== this.boundary[3] - this.boundary[1] ||
        weightsA.length !== n * n * 4 || weightsB.length !== n * n * 4) {
      throw new Error('Máscaras de materiales incompatibles con el terreno');
    }
    this.materialResolution = n;
    this.materialWeightsA = weightsA;
    this.materialWeightsB = weightsB;
  }

  materialAt(x, z) {
    if (!this.materialWeightsA || !this.materialWeightsB) throw new Error('Máscaras de materiales no cargadas');
    const n = this.materialResolution;
    const fx = Math.max(0, Math.min(n - 1, (x - this.boundary[0]) / (this.boundary[2] - this.boundary[0]) * (n - 1)));
    const fz = Math.max(0, Math.min(n - 1, (z - this.boundary[1]) / (this.boundary[3] - this.boundary[1]) * (n - 1)));
    const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(n - 1, x0 + 1), z1 = Math.min(n - 1, z0 + 1);
    const tx = fx - x0, tz = fz - z0;
    const result = new Array(7);
    for (let channel = 0; channel < 7; channel++) {
      const source = channel < 4 ? this.materialWeightsA : this.materialWeightsB;
      const offset = channel % 4;
      const at = (ix, iz) => source[(iz * n + ix) * 4 + offset];
      const top = at(x0, z0) * (1 - tx) + at(x1, z0) * tx;
      const bottom = at(x0, z1) * (1 - tx) + at(x1, z1) * tx;
      result[channel] = (top * (1 - tz) + bottom * tz) / 255;
    }
    return result;
  }

  tileAt(x, z) {
    const minX = this.boundary[0], minZ = this.boundary[1];
    const maxX = this.boundary[2], maxZ = this.boundary[3];
    if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
    // -7000..7000 in 5 equal tiles; tile IDs -2..2.
    const cx = Math.max(-2, Math.min(2, Math.floor((x - minX) / this.size) - 2));
    const cz = Math.max(-2, Math.min(2, Math.floor((z - minZ) / this.size) - 2));
    return this.tiles.get(`${cx},${cz}`) ?? null;
  }

  sample(x, z) {
    const tile = this.tileAt(x, z);
    if (!tile) return this.manifest.seaLevelMetres - 45;
    const u = Math.max(0, Math.min(1, (x - tile.boundsXZ[0]) / this.size));
    const v = Math.max(0, Math.min(1, (z - tile.boundsXZ[1]) / this.size));
    const n = this.resolution, fx = u * (n - 1), fz = v * (n - 1);
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, n - 1), z1 = Math.min(z0 + 1, n - 1);
    const tx = fx - x0, tz = fz - z0;
    const a = tile.height[z0 * n + x0], b = tile.height[z0 * n + x1];
    const c = tile.height[z1 * n + x0], d = tile.height[z1 * n + x1];
    const v16 = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    return this.min + v16 / 65535 * (this.max - this.min);
  }

  colorAt(x, z) {
    const tile = this.tileAt(x, z);
    if (!tile) return [0.18, 0.34, 0.43];
    const n = this.colorResolution;
    const u = Math.max(0, Math.min(1, (x - tile.boundsXZ[0]) / this.size)) * (n - 1);
    const v = Math.max(0, Math.min(1, (z - tile.boundsXZ[1]) / this.size)) * (n - 1);
    const xi = Math.min(n - 1, Math.round(u)), zi = Math.min(n - 1, Math.round(v));
    const i = (zi * n + xi) * 3;
    return [tile.color[i] / 255, tile.color[i + 1] / 255, tile.color[i + 2] / 255];
  }

  getSurface(x, z, step = 12) {
    const h = this.sample(x, z);
    const dx = (this.sample(x + step, z) - this.sample(x - step, z)) / (step * 2);
    const dz = (this.sample(x, z + step) - this.sample(x, z - step)) / (step * 2);
    return { height: h, slopeX: dx, slopeZ: dz };
  }
}
