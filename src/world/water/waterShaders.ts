import { Effect } from '@babylonjs/core';

/**
 * Water shaders for Babylon.js WebGL 1/2. Each surface has its own motion model.
 * GLSL 100 syntax intentionally avoids a WebGPU-only dependency.
 */
export function registerAuraliaWaterShaders(): void {
  if (Effect.ShadersStore.auraliaOceanVertexShader && Effect.ShadersStore.auraliaRiverVertexShader) return;

  Effect.ShadersStore.auraliaOceanVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 uCameraPosition;
uniform vec2 uPatchCenter;
uniform float uTime;
uniform float uPatchRadius;
uniform float uNearPatch;
uniform float uWaveStrength;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vWaveHeight;
varying float vShore;

const float TAU = 6.28318530718;

void gerstner(vec2 xz, vec2 dir, float lengthM, float amplitude, float speed,
              inout vec2 offset, inout float elevation, inout vec2 slope) {
  float k = TAU / lengthM;
  float phase = k * dot(dir, xz) - sqrt(9.81 * k) * uTime * speed;
  float sn = sin(phase);
  float cs = cos(phase);
  elevation += amplitude * sn;
  // A modest horizontal shift makes crests asymmetric without folding the mesh.
  offset += dir * (amplitude * .45 * cs);
  slope += dir * (amplitude * k * cs);
}

void main(void) {
  vec3 worldP = (world * vec4(position, 1.0)).xyz;
  float dist = length(worldP.xz - uPatchCenter);
  float patchFade = 1.0 - smoothstep(uPatchRadius * .72, uPatchRadius * .985, dist);
  float fade = patchFade * uNearPatch * uWaveStrength * (1.0-color.g);
  vec2 disp = vec2(0.0);
  float height = 0.0;
  vec2 grad = vec2(0.0);
  gerstner(worldP.xz, normalize(vec2(.92,.39)), 42.0, .83, .92, disp, height, grad);
  gerstner(worldP.xz, normalize(vec2(-.42,.91)), 25.0, .38, 1.09, disp, height, grad);
  gerstner(worldP.xz, normalize(vec2(.75,-.66)), 12.0, .18, 1.23, disp, height, grad);
  gerstner(worldP.xz, normalize(vec2(-.96,-.28)), 7.0, .095, 1.31, disp, height, grad);
  vec3 finalP = position + vec3(disp.x * fade, height * fade, disp.y * fade);
  vWorldPos = (world * vec4(finalP, 1.0)).xyz;
  vWaveNormal = normalize(vec3(-grad.x * fade, 1.0, -grad.y * fade));
  vWaveHeight = height * fade;
  vShore = color.r * uNearPatch;
  gl_Position = worldViewProjection * vec4(finalP, 1.0);
}`;

  Effect.ShadersStore.auraliaOceanFragmentShader = `
precision highp float;
uniform sampler2D uNormals;
uniform sampler2D uFoamNoise;
uniform vec3 uCameraPosition;
uniform vec2 uPatchCenter;
uniform float uPatchRadius;
uniform float uNearPatch;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uNormalStrength;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vWaveHeight;
varying float vShore;

void main(void) {
  // The far sea must not cover troughs of the detailed Gerstner patch.
  if (uNearPatch < .5 && length(vWorldPos.xz - uPatchCenter) < uPatchRadius * .975) discard;
  vec2 xz = vWorldPos.xz;
  vec2 uva = xz * .045 + vec2(uTime * .013, uTime * .007);
  vec2 uvb = vec2(-xz.y, xz.x) * .091 + vec2(-uTime * .027, uTime * .021);
  vec3 a = texture2D(uNormals, uva).xyz * 2.0 - 1.0;
  vec3 b = texture2D(uNormals, uvb).xyz * 2.0 - 1.0;
  vec3 normal = normalize(vWaveNormal +
    vec3(a.x + .63 * b.x, 0.0, a.y + .63 * b.y) * (.24 * uNormalStrength));
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);
  vec3 lightDir = normalize(uSunDirection);
  vec3 halfVector = normalize(viewDir + lightDir);
  float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 5.0);
  float diffuseSky = clamp(normal.y * .5 + .5, 0.0, 1.0);
  vec3 seaDeep = vec3(.015,.17,.26);
  vec3 seaShallow = vec3(.055,.40,.44);
  vec3 water = mix(seaDeep, seaShallow, clamp(vShore * .65,0.0,1.0));
  vec3 sky = mix(vec3(.59,.76,.85), vec3(.28,.54,.75), diffuseSky);
  water = mix(water, sky, .18 + .59 * fresnel);
  float sparkle = pow(max(dot(normal, halfVector), 0.0), 140.0);
  water += sparkle * vec3(1.0,.89,.70) * 1.05;

  float noiseA = texture2D(uFoamNoise, xz * .073 + uTime * .009).r;
  float noiseB = texture2D(uFoamNoise, xz * .14 - uTime * .015).r;
  float shoreFoam = smoothstep(.32, .91, vShore) * smoothstep(.44,.80,noiseA);
  float crestFoam = smoothstep(.32, .78, vWaveHeight) * smoothstep(.52,.83,noiseB) * .48;
  float foam = clamp(shoreFoam * .75 + crestFoam,0.0,.88);
  water = mix(water, vec3(.78,.94,.91), foam);

  float d = distance(uCameraPosition, vWorldPos);
  float fog = 1.0 - exp(-pow(uFogDensity * d, 2.0));
  water = mix(water, uFogColor, clamp(fog,0.0,.97));
  gl_FragColor = vec4(water,1.0);
}`;

  Effect.ShadersStore.auraliaRiverVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv2;     // direction of flow in world XZ, normalized on CPU
attribute vec4 color;   // shore, speed, turbulence, approximate depth
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vSurfaceNormal;
varying vec2 vFlow;
varying vec4 vWaterInfo;

void main(void) {
  vFlow = uv2;
  vWaterInfo = color;
  vSurfaceNormal = normalize(mat3(world) * normal);
  // Directional normals animate the flow without opening cracks in the
  // river mesh when a vertical ripple dips beneath the terrain.
  float bankSink = smoothstep(.35,.98,color.r) * .18;
  vec3 movedLocal = position + vec3(0.0, -bankSink, 0.0);
  vWorldPos = (world * vec4(movedLocal,1.0)).xyz;
  gl_Position = worldViewProjection * vec4(movedLocal,1.0);
}`;

  Effect.ShadersStore.auraliaRiverFragmentShader = `
precision highp float;
uniform sampler2D uNormals;
uniform sampler2D uFoamNoise;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uNormalStrength;
varying vec3 vWorldPos;
varying vec3 vSurfaceNormal;
varying vec2 vFlow;
varying vec4 vWaterInfo;

void main(void) {
  float shore = clamp(vWaterInfo.r,0.0,1.0);
  float speed = clamp(vWaterInfo.g,0.0,1.0);
  float turbulence = clamp(vWaterInfo.b,0.0,1.0);
  float depth = clamp(vWaterInfo.a,0.0,1.0);
  float flowLen = length(vFlow);
  float flowAmount = smoothstep(0.0,.85,flowLen);
  vec2 flow = flowLen > .001 ? normalize(vFlow) : vec2(.95,.31);
  float cascade = smoothstep(.12,.55,1.0-clamp(vSurfaceNormal.y,0.0,1.0));
  vec2 across = vec2(-flow.y,flow.x);
  float texScale = mix(.049,.083,flowAmount);
  vec2 riverUV = vWorldPos.xz * texScale;
  vec2 cascadeUV = vec2(dot(vWorldPos.xz,across),vWorldPos.y) * texScale;
  float t = uTime * mix(.018,.13+.40*speed,flowAmount);
  // Loop-free directional movement: two interleaved flow phases cross-fade.
  float phaseA = fract(t);
  float phaseB = fract(t + .5);
  float crossfade = abs(phaseA * 2.0 - 1.0);
  vec2 uvA = riverUV - flow * (phaseA * .45);
  vec2 uvB = riverUV - flow * (phaseB * .45);
  vec3 a = texture2D(uNormals, uvA).xyz * 2.0 - 1.0;
  vec3 b = texture2D(uNormals, uvB).xyz * 2.0 - 1.0;
  vec2 tangentNoise = mix(a.xy,b.xy,crossfade);
  if(cascade > .01){
    vec2 fallA = cascadeUV + vec2(0.0,phaseA * .45);
    vec2 fallB = cascadeUV + vec2(0.0,phaseB * .45);
    vec2 fallingNoise = mix(texture2D(uNormals,fallA).xy,
                            texture2D(uNormals,fallB).xy,crossfade)*2.0-1.0;
    tangentNoise = mix(tangentNoise,fallingNoise,cascade);
  }
  vec2 secondaryUV = vec2(-riverUV.y,riverUV.x) * 1.7 + uTime * vec2(-.01,.014);
  vec2 secondary = texture2D(uNormals,secondaryUV).xy*2.0-1.0;
  float bump = uNormalStrength * (.19 + turbulence*.22);
  vec3 normal = normalize(vSurfaceNormal +
    vec3((tangentNoise.x + secondary.x*.28)*bump,0.0,
         (tangentNoise.y + secondary.y*.28)*bump));
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);
  vec3 lightDir = normalize(uSunDirection);
  float ndotv = clamp(dot(normal,viewDir),0.0,1.0);
  float fresnel = pow(1.0-ndotv,5.0);
  vec3 shallowColor = vec3(.055,.32,.34);
  vec3 deepColor = vec3(.018,.18,.27);
  vec3 colorWater = mix(shallowColor,deepColor,smoothstep(.02,.42,depth));
  vec3 sky = mix(vec3(.57,.75,.78),vec3(.30,.54,.69),clamp(normal.y,0.0,1.0));
  colorWater=mix(colorWater,sky, .12 + .48*fresnel);
  vec3 halfVector=normalize(lightDir+viewDir);
  colorWater+=pow(max(dot(normal,halfVector),0.0),105.0)*vec3(1.0,.89,.76)*.56;

  float foamNoise = texture2D(uFoamNoise,riverUV*.72 - flow*uTime*(.025+.08*speed)).r;
  if(cascade > .01){
    float fallingFoam=texture2D(uFoamNoise,cascadeUV*.72 + vec2(0.0,uTime*(.025+.08*speed))).r;
    foamNoise=mix(foamNoise,fallingFoam,cascade);
  }
  float roughFoam = smoothstep(.43,.77,foamNoise) *
                    (turbulence*.70 + shore*.48);
  // Foam is spatially localized to turns/rapids/obstacles and banks.
  float fallingFoam = cascade * (.18 + .48 * smoothstep(.34,.77,foamNoise));
  float foam = clamp(roughFoam * mix(.26,1.0,flowAmount) + fallingFoam,0.0,.9);
  colorWater = mix(colorWater,vec3(.78,.94,.89),foam);
  float dist = distance(uCameraPosition,vWorldPos);
  float fog = 1.0-exp(-pow(uFogDensity*dist,2.0));
  colorWater=mix(colorWater,uFogColor,clamp(fog,0.0,.97));
  // Opaque inland water writes depth. Blending exposed the ocean plane below
  // lake basins and made overlapping chunk edges look like dark polygons.
  if(shore > .96) discard;
  gl_FragColor=vec4(colorWater,1.0);
}`;
}
