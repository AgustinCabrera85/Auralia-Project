import {
  ArcRotateCamera, Color3, DirectionalLight, Engine, FreeCamera,
  HemisphericLight, Mesh, MeshBuilder, Scene, SceneInstrumentation, SceneLoader,
  TransformNode, Vector3, VertexData
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { AuraliaHeightAtlas } from './atlas.mjs';
import { createPreviewTerrainMaterial } from './material.mjs';
import { createPreviewWater } from './water.mjs';
import { createPreviewRivers, riverControlPoints } from './rivers.mjs';
import { createRiverChannelField } from './riverChannel.mjs';
import { FAR_SUBDIVISIONS, NEAR_SUBDIVISIONS } from './previewLod.mjs';
import { PreviewTerrainStream } from './terrainStream.mjs';
import { createInspection } from './inspection.mjs';
import { createPreviewVegetation } from './vegetation.mjs';
import { createPreviewRocks } from './rocks.mjs';
import { createIslandVisual } from './islandVisual.mjs';
import { applyLandscapeAtmosphere, LANDSCAPE_ATMOSPHERE_CONFIG } from '../world/LandscapeAtmosphere';
import './preview.css';

const canvas = document.querySelector('#renderCanvas');
const loading = document.querySelector('#loading');
const status = document.querySelector('#status');
const menu = document.querySelector('#landmarks');
const coords = document.querySelector('#coords');
const buttonMode = document.querySelector('#mode');
const buttonWalk = document.querySelector('#walk');
const buttonGuides = document.querySelector('#guides');
const detailLabel = document.querySelector('#detail');
const qualitySelect = document.querySelector('#quality');
const QUALITY = {
  balanced: { fps: 30, resolution: 0.75 },
  saving: { fps: 20, resolution: 0.6 },
  high: { fps: 60, resolution: 1 }
};
let quality = QUALITY.balanced;
let atlas = null;
let engine = null;
let scene = null;
let instrumentation = null;
let orbit = null;
let free = null;
let currentMode = 'orbit';
let visibleGuides = false;
let guideMeshes = [];
let farMeshes = new Map();
let highMeshes = new Map();
let lastLodUpdate = 0;
let upPressed = false;
let downPressed = false;
let lastLocation = null;
let vegetation = null;
let rocks = null;
let riverSystem = null;
let waterSystem = null;
let channelField = null;
let terrainStream = null;
let inspection = null;
let inspectionEyeY = null;
const baselineGeometry = new URLSearchParams(location.search).get('geometry') === 'baseline';
const islandVisuals = [];
const extraLocations = [
  { name: 'Desierto del noroeste', x: -5200, z: -3800, range: 1650 },
  { name: 'Cumbres nevadas', x: 2500, z: -3500, range: 1750 },
  { name: 'Albor desde arriba', x: -4750, z: -3500, range: 1700, floating: 'albor', view: 'above' },
  { name: 'Albor desde abajo', x: -4750, z: -3500, range: 1500, floating: 'albor', view: 'below' },
  { name: 'Umbrael desde arriba', x: 5200, z: -3700, range: 1700, floating: 'umbrael', view: 'above' },
  { name: 'Umbrael desde abajo', x: 5200, z: -3700, range: 1500, floating: 'umbrael', view: 'below' },
];

const $ = (id) => document.getElementById(id);
function setProgress(message) { loading.textContent = message; status.textContent = message; }

function makeTileMesh(tile, subdivisions, sharedMaterial) {
  const res = subdivisions;
  const count = (res + 1) * (res + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const indices = new Uint32Array(res * res * 6);
  let v = 0;
  const size = atlas.size, x0 = tile.boundsXZ[0], z0 = tile.boundsXZ[1];
  for (let iz = 0; iz <= res; iz++) {
    const z = z0 + size * iz / res;
    for (let ix = 0; ix <= res; ix++) {
      const x = x0 + size * ix / res;
      const h = channelField.tileVertexHeight(tile, ix, iz, res);
      positions[v++] = x; positions[v++] = h; positions[v++] = z;
      const step = 7;
      const nx = channelField.heightAt(x - step, z) - channelField.heightAt(x + step, z);
      const nz = channelField.heightAt(x, z - step) - channelField.heightAt(x, z + step);
      const length = Math.hypot(nx, 2 * step, nz);
      const ni = (iz * (res + 1) + ix) * 3;
      normals[ni] = nx / length;
      normals[ni + 1] = 2 * step / length;
      normals[ni + 2] = nz / length;
    }
  }
  let t = 0;
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    const a = iz * (res + 1) + ix, b = a + res + 1;
    // Babylon computes upward-facing normals for this winding in its left-handed scene.
    indices[t++] = a; indices[t++] = a + 1; indices[t++] = b;
    indices[t++] = a + 1; indices[t++] = b + 1; indices[t++] = b;
  }
  const mesh = new Mesh(`MAP_${tile.id}_${res}`, scene);
  const data = new VertexData();
  data.positions = positions; data.normals = normals; data.indices = indices;
  data.applyToMesh(mesh);
  mesh.setVerticesData('parentHeight', Float32Array.from({length:count},(_,i)=>positions[i*3+1]),false,1);
  mesh.material = sharedMaterial;
  mesh.isPickable = false;
  mesh.metadata = { previewTile: tile.id, subdivisions, center: tile.centerXZ };
  return mesh;
}

function orbitAround(b) {
  const loc = typeof b === 'string'
    ? [...atlas.manifest.bookmarks, ...extraLocations, ...(riverSystem?.landmarks ?? [])].find(x => x.name === b) : b;
  if (!loc) return;
  lastLocation = loc;
  const floating = loc.floating ? atlas.manifest.islands.find(x => x.id === loc.floating) : null;
  const overview = loc.name === 'Continente completo';
  const y = overview ? 230 : floating ? floating.positionXYZ[1] - 80 : atlas.sample(loc.x, loc.z) + 120;
  if (currentMode !== 'orbit') setMode('orbit');
  const target = new Vector3(loc.x, y, loc.z);
  orbit.setTarget(target);
  if (overview) {
    orbit.radius = loc.range ?? 17000;
    orbit.alpha = Math.PI / 2;
    orbit.beta = 0.62;
  } else {
    const below = floating && loc.view === 'below';
    const ferragris = loc.name.startsWith('Ferragrís');
    const betas = below ? [2.05, 1.98, 1.9, 1.8] : floating ? [0.86, 0.7]
      : ferragris ? [0.48, 0.55, 0.65] : loc.river ? [0.52, 0.65, 0.78]
        : [0.96, 0.82, 0.68, 0.54, 0.42];
    const alphas = ferragris
      ? [Math.PI * 1.15, Math.PI / 2, 0, Math.PI * 0.9, -Math.PI / 2]
      : [Math.PI * 1.15, Math.PI * 1.35, Math.PI * 0.9, Math.PI / 2, -Math.PI / 2, 0];
    let pose = null;
    for (const factor of [1, 1.25, 1.5]) {
      const radius = (loc.range ?? 1600) * factor;
      for (const beta of betas) {
        for (const alpha of alphas) {
          if (!orbitPoseClear(target, radius, alpha, beta)) continue;
          pose = { radius, alpha, beta }; break;
        }
        if (pose) break;
      }
      if (pose) break;
    }
    orbit.radius = pose?.radius ?? (loc.range ?? 1600) * 1.5;
    orbit.alpha = pose?.alpha ?? Math.PI * 1.15;
    orbit.beta = pose?.beta ?? betas.at(-1);
  }
  updateHighDetail(true);
}

function orbitPoseClear(target, radius, alpha, beta) {
  const x = target.x + radius * Math.cos(alpha) * Math.sin(beta);
  const y = target.y + radius * Math.cos(beta);
  const z = target.z + radius * Math.sin(alpha) * Math.sin(beta);
  for (const progress of [0, 0.25, 0.5, 0.75]) {
    const px = x + (target.x - x) * progress;
    const py = y + (target.y - y) * progress;
    const pz = z + (target.z - z) * progress;
    if (py < atlas.sample(px, pz) + 55) return false;
  }
  return true;
}

function safeWalkSpawn(focus) {
  let best = null;
  for (const radius of [120, 240, 360, 520, 800]) for (let a = 0; a < 20; a++) {
    const angle = a * Math.PI * 2 / 20;
    const x = focus.x + Math.cos(angle) * radius, z = focus.z + Math.sin(angle) * radius;
    if (!atlas.tileAt(x, z)) continue;
    const surface = atlas.getSurface(x, z, 15);
    const slope = Math.hypot(surface.slopeX, surface.slopeZ);
    if (surface.height < atlas.manifest.seaLevelMetres + 2 || slope > 0.42) continue;
    const towardX = (focus.x - x) / radius, towardZ = (focus.z - z) / radius;
    const headings = [[towardX, towardZ], [-towardX, -towardZ],
      [-towardZ, towardX], [towardZ, -towardX]];
    let view = null;
    headings.forEach(([dx, dz], index) => {
      const rise = Math.max(...[60, 130, 240, 360].map(distance =>
        Math.max(0, atlas.sample(x + dx * distance, z + dz * distance) - surface.height)));
      const score = rise * 4 + (index ? 8 : 0);
      if (!view || score < view.score) view = { dx, dz, score };
    });
    const score = slope * 110 + view.score + radius * 0.025;
    if (!best || score < best.score) best = { x, z, y: channelField.heightAt(x, z) + 1.75, lookX: view.dx, lookZ: view.dz, score };
  }
  return best ?? { x: -1250, z: 1920, y: atlas.sample(-1250, 1920) + 1.75, lookX: 0, lookZ: -1 };
}

function setMode(mode) {
  inspectionEyeY = null;
  if (mode === currentMode) return;
  if (mode === 'free' || mode === 'walk') {
    orbit.detachControl(canvas);
    const focus = orbit.target;
    const spawn = mode === 'walk' ? safeWalkSpawn(focus) : null;
    if (spawn) {
      free.position = new Vector3(spawn.x, spawn.y, spawn.z);
      free.setTarget(new Vector3(spawn.x + spawn.lookX * 80, spawn.y, spawn.z + spawn.lookZ * 80));
    } else {
      const h = Math.max(atlas.sample(focus.x, focus.z), focus.y - 120);
      free.position = new Vector3(focus.x + 500, h + 450, focus.z + 650);
      free.setTarget(new Vector3(focus.x, h + 100, focus.z));
    }
    scene.activeCamera = free;
    free.attachControl(canvas, true);
    currentMode = mode;
    free.speed = mode === 'walk' ? 9 : 34;
    buttonMode.textContent = mode === 'free' ? 'Volver a cámara orbital' : 'Vuelo libre (WASD)';
    buttonWalk.textContent = mode === 'walk' ? 'Volver a cámara orbital' : 'Caminar (WASD)';
    status.textContent = mode === 'walk' ? 'A pie: WASD · mouse para mirar · terreno simplificado (sin colisiones de objetos)' : 'Vuelo libre: WASD · mouse para mirar · Q/E para bajar/subir';
  } else {
    free.detachControl(canvas);
    scene.activeCamera = orbit;
    orbit.attachControl(canvas, true);
    currentMode = 'orbit';
    buttonMode.textContent = 'Vuelo libre (WASD)';
    buttonWalk.textContent = 'Caminar (WASD)';
    status.textContent = 'Orbital: arrastrar para rotar · botón derecho para desplazar · rueda para zoom';
  }
}

function installGuides(splines) {
  for (const spline of splines) {
    const source = spline.type === 'river' ? riverControlPoints(spline) : spline.controlPoints;
    const pts = source.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z))
      .map(p => new Vector3(p.x, atlas.sample(p.x, p.z) + 9, p.z));
    if (pts.length < 2) continue;
    const line = MeshBuilder.CreateLines(`GUIA_${spline.id}`, { points: pts }, scene);
    line.color = spline.type === 'river' ? Color3.FromHexString('#4ec6f1') : Color3.FromHexString('#d79c46');
    line.isVisible = visibleGuides;
    line.isPickable = false;
    guideMeshes.push(line);
  }
}

async function loadIsland(island) {
  const name = island.file.split('/').pop();
  const result = await SceneLoader.ImportMeshAsync('', '/auralia-preview/models/', name, scene);
  const carrier = new TransformNode(`REINO_FLOTANTE_${island.id.toUpperCase()}`, scene);
  // Authored GLB uses Z-up source geometry. Rotate into Babylon Y-up.
  carrier.rotation.x = -Math.PI / 2;
  carrier.position = Vector3.FromArray(island.positionXYZ);
  carrier.scaling.setAll(island.scale ?? 1);
  for (const mesh of result.meshes) if (!mesh.parent) mesh.parent = carrier;
  for (const mesh of result.meshes) if (mesh instanceof Mesh) {
    mesh.isPickable = false;
    mesh.metadata = { ...mesh.metadata, floatingKingdom: island.id };
    const visual = createIslandVisual(scene, mesh);
    if (visual) islandVisuals.push({ ...visual, island });
  }
  return carrier;
}

function updateHighDetail(force = false) {
  const target = currentMode === 'orbit' ? orbit.target : free.position;
  for (const visual of islandVisuals) {
    const close = Math.hypot(target.x - visual.island.positionXYZ[0],
      target.z - visual.island.positionXYZ[2]) < 3000;
    visual.source.isVisible = !close;
    visual.proxy.isVisible = close;
  }
  if (terrainStream) {
    terrainStream.update(target, currentMode !== 'orbit' || orbit.radius < 4500);
  } else {
  for (const tile of atlas.manifest.tiles) {
    const far = farMeshes.get(tile.id);
    if (far) far.setEnabled(!highMeshes.has(tile.id));
  }
  const tiles = (currentMode === 'orbit' && orbit.radius > 4500 ? [] : [...atlas.manifest.tiles])
    .map(t => ({ tile: t, distance: Math.hypot(t.centerXZ[0] - target.x, t.centerXZ[1] - target.z) }))
    .filter(t => t.distance < 2650)
    .sort((a,b) => a.distance - b.distance)
    .slice(0, 2);
  const desired = new Set(tiles.map(t => t.tile.id));
  for (const [id, mesh] of highMeshes) {
    if (!desired.has(id)) { mesh.dispose(); highMeshes.delete(id); farMeshes.get(id)?.setEnabled(true); }
  }
  // Max one expensive terrain refinement per check to avoid a large frame spike.
  const tile = tiles.find(x => !highMeshes.has(x.tile.id));
  if (tile) {
    const mesh = makeTileMesh(tile.tile, NEAR_SUBDIVISIONS, terrainMaterial);
    highMeshes.set(tile.tile.id, mesh);
    farMeshes.get(tile.tile.id)?.setEnabled(false);
  }
  }
  vegetation?.update(force);
  rocks?.update(force);
  const nearSurface = currentMode === 'orbit' ? orbit.radius < 4200
    : free.position.y - atlas.sample(free.position.x, free.position.z) < 2300;
  waterSystem?.update(target, nearSurface);
  riverSystem?.update(target, nearSurface, highMeshes, lastLocation?.river);
  detailLabel.textContent = terrainStream ? 'Detalle por parches con tres niveles' : `Sectores detalle: ${highMeshes.size}/2`;
}
let terrainMaterial = null;

async function start() {
  try {
    setProgress('Cargando el mapa definido de Auralia...');
    engine = new Engine(canvas, true, { adaptToDeviceRatio: false, antialias: true });
    const applyQuality = () => {
      quality = QUALITY[qualitySelect.value] ?? QUALITY.balanced;
      engine.maxFPS = quality.fps;
      engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / quality.resolution));
      engine.resize();
    };
    applyQuality();
    qualitySelect.addEventListener('change', applyQuality);
    engine.renderEvenInBackground = false;
    scene = new Scene(engine);
    instrumentation = new SceneInstrumentation(scene);
    applyLandscapeAtmosphere(scene);
    const hemi = new HemisphericLight('SKY_ambient', new Vector3(0,1,0), scene);
    hemi.intensity = .88;
    hemi.groundColor = new Color3(.48,.55,.62);
    const sun = new DirectionalLight('SUN', new Vector3(-.5,-1.3,.55), scene);
    sun.intensity = 1.35;
    sun.diffuse = new Color3(1,.91,.76);
    orbit = new ArcRotateCamera('CAM_orbit',Math.PI/2,.62,17000,new Vector3(0,230,0),scene);
    orbit.maxZ = 40000;
    orbit.lowerRadiusLimit = 25; orbit.upperRadiusLimit = 29000;
    orbit.lowerBetaLimit = .055; orbit.upperBetaLimit = 2.75;
    orbit.wheelPrecision = 25; orbit.wheelDeltaPercentage = 0.12; orbit.panningSensibility = 4;
    orbit.useCtrlForPanning = false; orbit.panningMouseButton = 2;
    orbit.attachControl(canvas,true);
    scene.activeCamera = orbit;
    free = new FreeCamera('CAM_free',new Vector3(-1000,500,1200),scene);
    free.keysUp=[87]; free.keysDown=[83]; free.keysLeft=[65]; free.keysRight=[68];
    free.speed=34; free.angularSensibility=1800; free.inertia=.6;
    free.minZ=.2; free.maxZ=40000;
    free.detachControl(canvas);
    atlas = await AuraliaHeightAtlas.load(undefined, (done,total) => setProgress(`Cargando alturas y materiales: ${done}/${total} sectores`));
    const splineResponse = await fetch('/auralia-preview/data/splines.json');
    if (!splineResponse.ok) throw new Error('No se encontraron los splines de ríos');
    const splines = await splineResponse.json();
    channelField = createRiverChannelField(atlas, splines);
    const terrain = await createPreviewTerrainMaterial(scene, atlas, sun,
      (done, total) => setProgress(`Preparando texturas 1K: ${done}/${total} materiales`));
    terrainMaterial = terrain.material;
    if (baselineGeometry) {
      for (const tile of atlas.manifest.tiles) farMeshes.set(tile.id, makeTileMesh(tile, FAR_SUBDIVISIONS, terrainMaterial));
    } else {
      terrainStream = new PreviewTerrainStream(scene,atlas,channelField,terrainMaterial);
      await terrainStream.initialize((done,total)=>setProgress(`Preparando cobertura: ${done}/${total} sectores`));
    }
    waterSystem = await createPreviewWater(scene, atlas, sun, channelField);
    riverSystem = createPreviewRivers(scene, atlas, splines, channelField);
    setProgress('Colocando Albor al oeste y Umbrael al este...');
    await Promise.allSettled(atlas.manifest.islands.map(async i => {
      try { await loadIsland(i); }
      catch(error){console.error(`[AuraliaPreview] Error GLB ${i.name}:`,error);status.textContent=`No se pudo cargar ${i.name}. Revisá consola.`;}
    }));
    setProgress('Preparando vegetación y rocas próximas a la cámara...');
    vegetation = await createPreviewVegetation(scene, atlas, channelField);
    try { rocks = await createPreviewRocks(scene, atlas, channelField); }
    catch (error) { console.warn('[AuraliaPreview] No se pudieron cargar las rocas:', error); }
    installGuides(splines);
    for (const loc of [...atlas.manifest.bookmarks, ...extraLocations]) {
      const option = document.createElement('option');option.value=loc.name;option.textContent=loc.name;
      menu.append(option);
    }
    const riverGroup = document.createElement('optgroup');
    riverGroup.label = 'Ríos y canales · acercar para inspeccionar';
    for (const loc of riverSystem.landmarks) {
      const option = document.createElement('option');option.value=loc.name;option.textContent=loc.name;
      riverGroup.append(option);
    }
    menu.append(riverGroup);
    menu.value = 'Continente completo';
    $('visit').addEventListener('click', () => orbitAround(menu.value));
    $('zoomIn').addEventListener('click', () => {
      if (currentMode !== 'orbit') setMode('orbit');
      orbit.radius = Math.max(orbit.lowerRadiusLimit, orbit.radius * 0.7);
      updateHighDetail(true);
    });
    $('zoomOut').addEventListener('click', () => {
      if (currentMode !== 'orbit') setMode('orbit');
      orbit.radius = Math.min(orbit.upperRadiusLimit, orbit.radius / 0.7);
      updateHighDetail(true);
    });
    buttonMode.addEventListener('click', () => setMode(currentMode === 'free' ? 'orbit':'free'));
    buttonWalk.addEventListener('click', () => setMode(currentMode === 'walk' ? 'orbit':'walk'));
    buttonGuides.addEventListener('click', () => {
      visibleGuides=!visibleGuides;
      for(const line of guideMeshes)line.isVisible=visibleGuides;
      buttonGuides.textContent=visibleGuides?'Ocultar guías':'Mostrar guías';
    });
    $('reset').addEventListener('click',()=>orbitAround('Continente completo'));
    window.addEventListener('keydown', event => {
      if(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)return;
      if(['w','a','s','d','q','e'].includes(event.key.toLowerCase()))inspectionEyeY=null;
      if(event.key.toLowerCase()==='q')downPressed=true;
      if(event.key.toLowerCase()==='e')upPressed=true;
    });
    window.addEventListener('keyup', event => {
      if(event.key.toLowerCase()==='q')downPressed=false;
      if(event.key.toLowerCase()==='e')upPressed=false;
    });
    setProgress('Mapa listo. No se modificaron los guardados ni el mundo original.');
    loading.hidden=true;
    updateHighDetail(true);
    if(import.meta.env.DEV){
      inspection=createInspection({scene,engine,atlas,channelField,terrainStream,baseline:baselineGeometry,visit:view=>{
        setMode('walk');
        const y=Math.max(channelField.heightAt(view.x,view.z),atlas.manifest.seaLevelMetres)+view.height;
        inspectionEyeY=y;
        free.position.set(view.x,y,view.z);
        const length=Math.hypot(view.dx,view.dz)||1;
        free.setTarget(new Vector3(view.targetX??view.x+view.dx/length*100,view.targetY??y,view.targetZ??view.z+view.dz/length*100));
        updateHighDetail(true);
      }});
      window.__auraliaPreviewDebug={scene,atlas,channelField,terrainStream,inspection};
    }
    let dtTotal=0;
    engine.runRenderLoop(() => {
      if (!scene) return;
      // Main's local fog would hide a 14 km overview. Scale its density with
      // the orbit radius while retaining the same atmosphere when nearby.
      scene.fogDensity = currentMode === 'orbit'
        ? Math.min(LANDSCAPE_ATMOSPHERE_CONFIG.fogDensity, .32 / Math.max(600, orbit.radius))
        : LANDSCAPE_ATMOSPHERE_CONFIG.fogDensity;
      const dt = Math.min(engine.getDeltaTime(), 90) / 1000;
      terrainStream?.tick(dt);
      waterSystem?.tick();
      if(currentMode==='free') {
        if(upPressed)free.position.y+=100*dt;
        if(downPressed)free.position.y-=100*dt;
        free.position.y=Math.max(free.position.y,channelField.heightAt(free.position.x,free.position.z)+2.2);
      }
      if(currentMode==='walk') {
        const h = terrainStream?.heightAt(free.position.x, free.position.z) ?? channelField.heightAt(free.position.x, free.position.z);
        free.position.y = inspectionEyeY ?? Math.max(h, atlas.manifest.seaLevelMetres) + 1.75;
      }
      dtTotal+=dt;
      if(dtTotal>.25){dtTotal=0;updateHighDetail();
        const pos=currentMode==='orbit'?orbit.target:free.position;
        coords.textContent=`X ${Math.round(pos.x)} · Z ${Math.round(pos.z)} · Y ${Math.round(atlas.sample(pos.x,pos.z))} · ${engine.getFps().toFixed(0)} FPS`;
        const active = scene.getActiveMeshes();
        const activeSectors = new Set(active.data.slice(0, active.length)
          .map(mesh => mesh.metadata?.previewTile).filter(Boolean)).size;
        detailLabel.textContent=`${engine.getFps().toFixed(0)} FPS · ${Math.round(scene.getActiveIndices()/3).toLocaleString('es-AR')} triángulos · ${instrumentation.drawCallsCounter.current} draw calls · ${activeSectors} sectores activos (${terrainStream ? [...terrainStream.records.values()].filter(r=>r.node.lod==='near'&&r.mesh.isEnabled()).length : highMeshes.size} detalle) · ${riverSystem?.activeCount ?? 0} tramos de río · ${vegetation?.instanceCount ?? 0} plantas y ${rocks?.instanceCount ?? 0} rocas próximas`;
      }
      const renderStart=performance.now();scene.render();inspection?.frame(performance.now()-renderStart);
    });
    window.addEventListener('resize',()=>engine.resize());
  }catch(error){
    console.error(error);
    loading.hidden=false;
    setProgress(`No se pudo cargar el preview: ${error?.message ?? error}. Verificá que se copió la carpeta public/auralia-preview completa.`);
  }
}
void start();
