import { Color3, Effect, RawTexture, RawTexture2DArray, ShaderMaterial, Texture, Vector3, Vector4 } from '@babylonjs/core';
import { BIOME_MATERIALS } from '../world/materials/BiomeMaterialCatalog';

// Native channel names are absent from the World Studio project. These are
// shared 1K visual proxies, selected against its painted masks and RGB export.
export const PREVIEW_LAYERS = [
  { id: 'pradera_templada', role: 'pasto' },
  { id: 'sierra_grava_pasto', role: 'tierra y grava' },
  { id: 'desierto_arena', role: 'arena' },
  { id: 'snow', role: 'nieve' },
  { id: 'pantano_humedo', role: 'zona húmeda' },
  { id: 'rock', role: 'roca' },
  { id: 'tierra_maldita', role: 'suelo de Umbrael' },
].map(layer => ({ ...layer, ...BIOME_MATERIALS.find(material => material.id === layer.id) }));

const SHADER = 'auraliaWorldStudioPreview';
Effect.ShadersStore[`${SHADER}VertexShader`] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute float parentHeight;
uniform float lodBlend;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec3 morphed = vec3(position.x, mix(parentHeight, position.y, lodBlend), position.z);
  vWorldPos = (world * vec4(morphed, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(morphed, 1.0);
}`;

Effect.ShadersStore[`${SHADER}FragmentShader`] = `
precision highp float;
precision highp sampler2DArray;
varying vec3 vWorldPos;
varying vec3 vNormal;
uniform sampler2D macroColors;
uniform sampler2D weightsA;
uniform sampler2D weightsB;
uniform sampler2DArray albedoLayers;
uniform sampler2DArray normalLayers;
uniform vec4 mapBounds;
uniform vec3 layerMeans[7];
uniform float layerScales[7];
uniform float layerRoughness[7];
uniform float waterLevel;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float fogDensity;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 rotateUV(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
vec3 projectedColor(int index, vec2 plane, float scale, float angle) {
  float warp = noise(plane * 0.006 + float(index) * 3.1) - 0.5;
  vec2 uv = rotateUV(plane * scale + vec2(warp * 0.42), angle);
  vec3 fine = texture(albedoLayers, vec3(uv, float(index))).rgb;
  vec2 broadUV = rotateUV(uv * 0.43, 1.13) + vec2(17.4, 9.2);
  vec3 broad = texture(albedoLayers, vec3(broadUV, float(index))).rgb;
  return mix(fine, broad, 0.19 + noise(plane * 0.018 + float(index) * 7.0) * 0.17);
}
vec3 layerColor(int index, vec3 normal) {
  float scale = layerScales[index] * (index == 0 ? 1.2 : 1.0);
  float angle = 0.17 + float(index) * 0.43;
  vec3 axes = pow(abs(normal), vec3(4.0));
  axes /= max(dot(axes, vec3(1.0)), 0.001);
  vec3 floorColor = projectedColor(index, vWorldPos.xz, scale, angle);
  if (axes.y > 0.995) return floorColor;
  vec3 xColor = projectedColor(index, vWorldPos.zy, scale, angle);
  vec3 zColor = projectedColor(index, vWorldPos.xy, scale, angle);
  return floorColor * axes.y + xColor * axes.x + zColor * axes.z;
}
void main() {
  vec2 mapUV = clamp((vWorldPos.xz - mapBounds.xy) / mapBounds.zw, 0.0, 1.0);
  vec2 colorUV = mapUV * (1279.0 / 1280.0) + vec2(0.5 / 1280.0);
  vec2 weightUV = mapUV * (319.0 / 320.0) + vec2(0.5 / 320.0);
  vec3 macro = texture(macroColors, colorUV).rgb;
  vec4 a = texture(weightsA, weightUV), b = texture(weightsB, weightUV);
  float weights[7];
  weights[0] = a.r; weights[1] = a.g; weights[2] = a.b; weights[3] = a.a;
  weights[4] = b.r; weights[5] = b.g; weights[6] = b.b;
  // Shore bands depend on height and slope, never on the coarse colour map.
  float shoreBand = (1.0-smoothstep(0.2,3.5,vWorldPos.y-waterLevel)) * smoothstep(0.65,0.95,vNormal.y);
  float beach = shoreBand * (1.0-weights[3]) * (1.0-weights[6]);
  for (int i=0;i<7;i++) weights[i] *= 1.0-beach*0.7;
  weights[2] += beach*0.7;
  float total = 0.0;
  for (int i = 0; i < 7; i++) total += weights[i];
  float unpainted = max(0.0, 1.0 - total);
  float bareRock = clamp((1.0 - vNormal.y) * 1.5 + smoothstep(550.0, 1200.0, vWorldPos.y) * 0.5, 0.0, 1.0);
  weights[0] += unpainted * (1.0 - bareRock);
  weights[5] += unpainted * bareRock;
  total = max(total + unpainted, 0.001);
  vec3 palette = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    weights[i] /= total;
    palette += weights[i] * layerMeans[i];
  }
  vec3 normal = normalize(vNormal);
  float distanceToCamera = length(vWorldPos - cameraPosition);
  float detailFade = 1.0 - smoothstep(450.0, 3200.0, distanceToCamera);
  vec3 modulation = vec3(1.0);
  int strongest = 0;
  if (detailFade > 0.01) {
    float cliff = smoothstep(0.35, 0.78, 1.0 - abs(normal.y));
    for (int i = 0; i < 7; i++) {
      if (weights[i] > weights[strongest]) strongest = i;
      float detailWeight = weights[i];
      if (i == 0) detailWeight *= 1.0 - cliff * 0.72;
      if (i == 5) detailWeight += weights[0] * cliff * 0.72;
      if (detailWeight < 0.012) continue;
      vec3 textureColor = layerColor(i, normal);
      vec3 ratio = textureColor / max(layerMeans[i], vec3(0.07));
      float brightness = dot(ratio, vec3(0.299, 0.587, 0.114));
      // The exported RGB8 holds the approved hue; shared Auralia layers add
      // mostly structure and only a little local colour variation.
      modulation += detailWeight * (mix(vec3(brightness), ratio, 0.18) - vec3(1.0));
    }
    {
      float scale = layerScales[strongest];
      vec3 bump = texture(normalLayers, vec3(vWorldPos.xz * scale, float(strongest))).rgb * 2.0 - 1.0;
      vec3 axes=pow(abs(normal),vec3(4.0));axes/=max(dot(axes,vec3(1.0)),0.001);
      vec3 perturbation=vec3(bump.x,0.0,bump.y)*axes.y;
      if(axes.y<0.995){
        vec3 bx=texture(normalLayers,vec3(vWorldPos.zy*scale,float(strongest))).rgb*2.0-1.0;
        vec3 bz=texture(normalLayers,vec3(vWorldPos.xy*scale,float(strongest))).rgb*2.0-1.0;
        perturbation+=vec3(0.0,bx.y,bx.x)*axes.x+vec3(bz.x,bz.y,0.0)*axes.z;
      }
      normal = normalize(normal + perturbation * 0.18 * detailFade);
    }
  }
  // Keep the authored regional hue legible at map scale while the seven shared
  // Auralia layers supply material detail near the camera.
  vec3 albedo = mix(palette * mix(vec3(1.0), clamp(modulation, vec3(0.70), vec3(1.34)),
    detailFade * 0.82), macro, 0.22);
  albedo *= 1.0 + (noise(vWorldPos.xz * 0.009) - 0.5) * 0.12;
  vec3 lightDirection = normalize(sunDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float ambient = clamp(0.65 + 0.25 * normal.y, 0.36, 1.0);
  vec3 lit = albedo * (vec3(0.46, 0.51, 0.54) * ambient + sunColor * diffuse);
  float wet = max(weights[4],1.0-smoothstep(0.1,1.5,abs(vWorldPos.y-waterLevel)));
  lit *= 1.0-wet*0.22;
  vec3 eye = normalize(cameraPosition - vWorldPos);
  float roughness=0.0;
  for(int i=0;i<7;i++)roughness+=weights[i]*layerRoughness[i];
  roughness=mix(roughness,0.28,wet);
  vec3 halfDirection=normalize(lightDirection+eye);
  float nh=max(dot(normal,halfDirection),0.0),nv=max(dot(normal,eye),0.001);
  float alpha2=pow(max(0.15,roughness),4.0);
  float distribution=alpha2/(3.14159*pow(nh*nh*(alpha2-1.0)+1.0,2.0));
  float k=pow(roughness+1.0,2.0)/8.0;
  float visibility=nv/(nv*(1.0-k)+k)*diffuse/(diffuse*(1.0-k)+k);
  float fresnel=0.04+0.96*pow(1.0-max(dot(halfDirection,eye),0.0),5.0);
  lit+=sunColor*distribution*visibility*fresnel/max(4.0*nv,0.01);
  float fog = 1.0 - exp(-pow(distanceToCamera * fogDensity, 2.0));
  gl_FragColor = vec4(mix(lit, fogColor, clamp(fog, 0.0, 0.97)), 1.0);
}`;

function makeMacroTexture(atlas, scene) {
  const tilePixels = atlas.colorResolution;
  const side = tilePixels * 5;
  const bytes = new Uint8Array(side * side * 4);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
    const tile = atlas.tiles.get(`${cx},${cz}`);
    if (!tile) throw new Error(`Falta el color del sector ${cx},${cz}`);
    for (let row = 0; row < tilePixels; row++) {
      const source = row * tilePixels * 3;
      const target = ((cz + 2) * tilePixels + row) * side * 4 + (cx + 2) * tilePixels * 4;
      for (let col = 0; col < tilePixels; col++) {
        const si = source + col * 3, ti = target + col * 4;
        bytes[ti] = tile.color[si];
        bytes[ti + 1] = tile.color[si + 1];
        bytes[ti + 2] = tile.color[si + 2];
        bytes[ti + 3] = 255;
      }
    }
  }
  const texture = RawTexture.CreateRGBATexture(bytes, side, side, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.gammaSpace = true;
  return texture;
}

async function makeLayerArrays(scene, onProgress) {
  const size = 1024, depth = PREVIEW_LAYERS.length, stride = size * size * 4;
  const colors = new Uint8Array(stride * depth), normals = new Uint8Array(stride * depth);
  const means = [];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo crear el decodificador de texturas');
  for (let layer = 0; layer < depth; layer++) {
    let mean = [0, 0, 0];
    for (const channel of ['albedo', 'normal']) {
      const url = PREVIEW_LAYERS[layer][channel];
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Textura 1K no disponible: ${url}`);
      const bitmap = await createImageBitmap(await response.blob(), {
        resizeWidth: size, resizeHeight: size, resizeQuality: 'high', colorSpaceConversion: 'none'
      });
      try {
        context.clearRect(0, 0, size, size);
        context.drawImage(bitmap, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        (channel === 'albedo' ? colors : normals).set(pixels, layer * stride);
        if (channel === 'albedo') {
          for (let i = 0; i < pixels.length; i += 64) {
            mean[0] += pixels[i]; mean[1] += pixels[i + 1]; mean[2] += pixels[i + 2];
          }
          mean = mean.map(value => value / (size * size / 16) / 255);
        }
      } finally { bitmap.close(); }
    }
    means.push(...mean);
    onProgress?.(layer + 1, depth);
  }
  canvas.width = canvas.height = 1;
  const albedo = RawTexture2DArray.CreateRGBATexture(colors, size, size, depth, scene);
  const normal = RawTexture2DArray.CreateRGBATexture(normals, size, size, depth, scene);
  for (const texture of [albedo, normal]) {
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
  }
  albedo.gammaSpace = true; normal.gammaSpace = false;
  return { albedo, normal, means };
}

export async function createPreviewTerrainMaterial(scene, atlas, sun, onProgress) {
  if (scene.getEngine().webGLVersion < 2) throw new Error('La vista de materiales requiere WebGL 2');
  const macro = makeMacroTexture(atlas, scene);
  const maskA = RawTexture.CreateRGBATexture(atlas.materialWeightsA, 320, 320, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  const maskB = RawTexture.CreateRGBATexture(atlas.materialWeightsB, 320, 320, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  for (const texture of [maskA, maskB]) {
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.gammaSpace = false;
  }
  const layers = await makeLayerArrays(scene, onProgress);
  const material = new ShaderMaterial('worldstudio-native-weight-preview', scene,
    { vertex: SHADER, fragment: SHADER }, {
      attributes: ['position', 'normal', 'parentHeight'],
      uniforms: ['world', 'worldViewProjection', 'lodBlend', 'waterLevel', 'mapBounds', 'layerMeans', 'layerScales', 'layerRoughness', 'cameraPosition', 'sunDirection', 'sunColor', 'fogColor', 'fogDensity'],
      samplers: ['macroColors', 'weightsA', 'weightsB', 'albedoLayers', 'normalLayers']
    });
  material.backFaceCulling = true;
  material.setFloat('lodBlend',1);
  material.onBindObservable.add(mesh => material.getEffect()?.setFloat('lodBlend',mesh?.metadata?.lodBlend ?? 1));
  material.setTexture('macroColors', macro);
  material.setTexture('weightsA', maskA);
  material.setTexture('weightsB', maskB);
  material.setTexture('albedoLayers', layers.albedo);
  material.setTexture('normalLayers', layers.normal);
  material.setVector4('mapBounds', new Vector4(atlas.boundary[0], atlas.boundary[1],
    atlas.boundary[2] - atlas.boundary[0], atlas.boundary[3] - atlas.boundary[1]));
  material.setArray3('layerMeans', layers.means);
  material.setFloats('layerScales', PREVIEW_LAYERS.map(layer => layer.scale));
  material.setFloats('layerRoughness', PREVIEW_LAYERS.map(layer => layer.roughness ?? 0.94));
  material.setFloat('waterLevel',atlas.manifest.seaLevelMetres);
  const direction = new Vector3();
  const sunColor = new Color3();
  const observer = scene.onBeforeRenderObservable.add(() => {
    direction.copyFrom(sun.direction).scaleInPlace(-1).normalize();
    material.setVector3('sunDirection', direction);
    sunColor.copyFrom(sun.diffuse).scaleInPlace(sun.intensity * 0.65);
    material.setColor3('sunColor', sunColor);
    if (scene.activeCamera) material.setVector3('cameraPosition', scene.activeCamera.globalPosition);
    material.setColor3('fogColor', scene.fogColor);
    material.setFloat('fogDensity', scene.fogDensity);
  });
  material.metadata = { source: 'World Studio native seven-channel weights', textureSize: 1024, shared: true };
  return { material, dispose: () => {
    scene.onBeforeRenderObservable.remove(observer);
    for (const texture of [macro, maskA, maskB, layers.albedo, layers.normal]) texture.dispose();
    material.dispose();
  } };
}
