import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, EngineInstrumentation, FreeCamera,
  MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { TerrainStream } from '../world/TerrainStream';
import { TERRAIN_LOD_CONFIG } from '../world/terrainLod';
import { GeographicSurface, legacyGeography, type GeographicSource } from '../world/geography/GeographicSource';
import { WorldStudioSource } from '../world/geography/WorldStudioSource';
import { geographicTraversal } from '../world/geography/GeographicTraversal';
import { CharacterTraversalController } from '../game/CharacterTraversalController';
import { THIRD_PERSON_CAMERA, cameraTerrainView } from '../game/cameraTerrain';
import { BIOME_MATERIALS } from '../world/materials/BiomeMaterialCatalog';
import { setWorldDocument } from '../world/editor/WorldEditState';
import '../auralia-preview/preview.css';

const percentile=(v:number[],p:number)=>v.length?[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]:null;
const RADIUS=TERRAIN_LOD_CONFIG.farRadius+TERRAIN_LOD_CONFIG.farSize+172;
const windowAt=(x:number,z:number):[number,number,number,number]=>[x-RADIUS,z-RADIUS,x+RADIUS,z+RADIUS];

export async function startGeographicValidation(kind:string):Promise<void>{
  const started=performance.now(),canvas=document.querySelector<HTMLCanvasElement>('#renderCanvas')!;
  const panel=document.querySelector<HTMLElement>('#ui')!,status=document.querySelector<HTMLElement>('#status')!;
  const loading=document.querySelector<HTMLElement>('#loading')!,coords=document.querySelector<HTMLElement>('#coords')!;
  panel.innerHTML=`<h1>Auralia · sector de validación</h1><p>Comparación geográfica con el terreno y los materiales del juego.</p>
    <label for="source">Fuente geográfica</label><select id="source"><option value="worldstudio-hybrid">World Studio + detalle local</option><option value="legacy">Geografía actual</option></select>
    <label for="validation-view">Punto de inspección</label><select id="validation-view"><option value="sector">Sector inicial</option><option value="detalle">Relieve local</option><option value="borde">Borde de sector</option><option value="ladera">Ladera montañosa</option></select>
    <button id="go" type="button">Visitar</button><button id="measure" type="button">Guardar medición</button>
    <label for="validation-camera">Cámara</label><select id="validation-camera"><option value="game">Vista del juego</option><option value="walk">A pie · ojos a 1,75 m</option></select>
    <label for="validation-resolution">Resolución · 30 FPS</label><select id="validation-resolution"><option value="1">100 % · comparar texturas</option><option value="0.75">75 % · menor carga gráfica</option></select>
    <p>WASD: caminar · mouse: mirar · Espacio: saltar · Shift: correr.</p>
    <p>La figura mide 1,75 m; el bloque azul, 2 × 3 × 2 m. Ambos permiten evaluar la escala del suelo.</p>
    <small>Sesión de validación sin guardados.</small><pre id="metrics"></pre>
    <a href="/?world=worldstudio">Jugar en el nuevo continente</a><br>
    <a href="/world-preview.html?source=import-reference">Referencia importada completa</a> · <a href="/">Volver al juego actual</a>`;
  const selector=panel.querySelector<HTMLSelectElement>('#source')!;
  selector.value=kind==='legacy'?'legacy':'worldstudio-hybrid';
  selector.onchange=()=>{const url=new URL(location.href);url.searchParams.set('source',selector.value);location.assign(url);};
  // Load the same authored geography as the current game, never player saves.
  // Its 152 legacy height strokes must not be applied to World Studio coordinates.
  if(kind==='legacy'){
    const response=await fetch('/world/auralia-world.json');
    if(!response.ok)throw new Error(`Legacy authored world ${response.status}`);
    setWorldDocument(await response.json());
  }
  const source:GeographicSource=kind==='legacy'?legacyGeography:await WorldStudioSource.load();
  const surface=new GeographicSurface(source),controller=new CharacterTraversalController();
  const base=source.streamed?{x:-1100,z:1900}:{x:0,z:10};
  const views=[{id:'sector',x:base.x,z:base.z,dx:0,dz:-1},
    {id:'detalle',x:base.x+250,z:base.z+100,dx:-1,dz:-.3},
    {id:'borde',x:source.streamed?-1390:72,z:source.streamed?2070:10,dx:1,dz:0},
    {id:'ladera',x:source.streamed?-3650:275,z:source.streamed?-2420:-1310,dx:0,dz:-1}];
  await source.prepare(windowAt(base.x,base.z));
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
  const params=new URLSearchParams(location.search);
  let resolution=params.get('resolution')==='0.75'?.75:1;
  engine.maxFPS=30;engine.setHardwareScalingLevel(1/resolution);
  const scene=new Scene(engine);scene.clearColor=new Color4(.43,.67,.88,1);
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogColor=new Color3(.56,.71,.76);scene.fogDensity=.00065;
  const sun=new DirectionalLight('validation-sun',new Vector3(-.5,-1,.4),scene);sun.intensity=1.35;
  const eyeCamera=new FreeCamera('validation-eyes',Vector3.Zero(),scene);
  eyeCamera.inputs.removeByType('FreeCameraKeyboardMoveInput');
  const gameCamera=new ArcRotateCamera('validation-game-camera',THIRD_PERSON_CAMERA.alpha,THIRD_PERSON_CAMERA.beta,
    THIRD_PERSON_CAMERA.distance,Vector3.Zero(),scene);
  gameCamera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  gameCamera.lowerRadiusLimit=.25;gameCamera.upperRadiusLimit=THIRD_PERSON_CAMERA.maxDistance;
  gameCamera.lowerBetaLimit=.4;gameCamera.upperBetaLimit=1.95;gameCamera.panningSensibility=0;
  gameCamera.wheelPrecision=32;gameCamera.inertia=.42;
  for(const camera of [eyeCamera,gameCamera]){camera.minZ=.15;camera.maxZ=2400;camera.fov=THIRD_PERSON_CAMERA.fov;}
  let cameraMode:'game'|'walk'=params.get('camera')==='walk'?'walk':'game';
  let preferredRadius:number=THIRD_PERSON_CAMERA.distance,appliedRadius=preferredRadius;
  const terrain=new TerrainStream(scene,new TransformNode('authoritative-terrain',scene),{},source);
  const box=MeshBuilder.CreateBox('surface-placement-probe',{width:2,height:3,depth:2},scene);
  const boxMaterial=new StandardMaterial('placement-probe',scene);boxMaterial.diffuseColor=new Color3(.15,.5,.8);box.material=boxMaterial;
  const figure=MeshBuilder.CreateCapsule('human-scale-reference',{height:1.75,radius:.23,tessellation:12,subdivisions:2},scene);
  figure.material=boxMaterial;figure.isPickable=false;
  const keys=new Set<string>();let jump=false,busy=false,failure:string|null=null,view='sector',viewStart=started,firstReadyMs:number|null=null,startupReadyMs:number|null=null;
  const frames:number[]=[],render:number[]=[],gpu:number[]=[],generation:number[]=[];
  let last=0,lastGpuCount=0,lastUi=0;
  const instrumentation=new EngineInstrumentation(engine);instrumentation.captureGPUFrameTime=true;
  const traversal=geographicTraversal(surface,(x,z)=>{
    const b=source.bounds;
    return x>b[0]+12&&x<b[2]-12&&z>b[1]+12&&z<b[3]-12&&terrain.coverageAt(x,z)==='near'&&source.isReady([x-12,z-12,x+12,z+12]);
  });
  function placeProbe(x:number,z:number){
    const support=surface.footprintAt(x+12,z-12,Math.SQRT2);box.position.set(x+12,support.maxHeight+1.5,z-12);
  }
  function updateCamera(){
    const p=controller.position;
    eyeCamera.position.set(p.x,p.y+1.75,p.z);figure.position.set(p.x,p.y+.875,p.z);
    if(cameraMode==='game'){
      preferredRadius=Math.max(THIRD_PERSON_CAMERA.minDistance,Math.min(THIRD_PERSON_CAMERA.maxDistance,
        preferredRadius+gameCamera.radius-appliedRadius));
      const {alpha,beta}=gameCamera,target=new Vector3(p.x,p.y+THIRD_PERSON_CAMERA.targetHeight,p.z);
      const direction=new Vector3(Math.cos(alpha)*Math.sin(beta),Math.cos(beta),Math.sin(alpha)*Math.sin(beta));
      const safe=cameraTerrainView(target,direction,preferredRadius,(x,z)=>surface.heightAt(x,z),target.y);
      target.y=safe.targetY;gameCamera.setTarget(target,false,false,true);
      gameCamera.radius=appliedRadius=safe.maxRadius;
    }
  }
  function setCameraMode(mode:'game'|'walk'){
    const previous=scene.activeCamera;
    if(previous){
      const d=previous.getForwardRay().direction;
      if(mode==='walk')eyeCamera.setTarget(eyeCamera.position.add(d));
      else {gameCamera.alpha=Math.atan2(-d.z,-d.x);gameCamera.beta=THIRD_PERSON_CAMERA.beta;}
      previous.detachControl();
    }
    cameraMode=mode;scene.activeCamera=mode==='game'?gameCamera:eyeCamera;
    figure.setEnabled(mode==='game');scene.activeCamera.attachControl(canvas,true);
    cameraSelector.value=mode;params.set('camera',mode);syncUrl();
    updateCamera();
  }
  function syncUrl(){const url=new URL(location.href);url.search=params.toString();history.replaceState(null,'',url);}
  const cameraSelector=panel.querySelector<HTMLSelectElement>('#validation-camera')!;
  cameraSelector.onchange=()=>setCameraMode(cameraSelector.value==='walk'?'walk':'game');
  const resolutionSelector=panel.querySelector<HTMLSelectElement>('#validation-resolution')!;
  resolutionSelector.value=String(resolution);
  resolutionSelector.onchange=()=>{resolution=Number(resolutionSelector.value);engine.setHardwareScalingLevel(1/resolution);
    params.set('resolution',String(resolution));syncUrl();};
  async function go(id:string){
    const p=views.find(v=>v.id===id);if(!p||busy)return;
    busy=true;failure=null;view=id;viewSelector.value=id;viewStart=performance.now();firstReadyMs=null;loading.hidden=false;
    try{
      await source.prepare(windowAt(p.x,p.z));
      controller.teleport(p.x,surface.heightAt(p.x,p.z),p.z);
      eyeCamera.position.set(p.x,controller.position.y+1.75,p.z);
      eyeCamera.setTarget(new Vector3(p.x+p.dx*100,eyeCamera.position.y,p.z+p.dz*100));
      gameCamera.alpha=Math.atan2(-p.dz,-p.dx);gameCamera.beta=THIRD_PERSON_CAMERA.beta;
      preferredRadius=appliedRadius=gameCamera.radius=THIRD_PERSON_CAMERA.distance;
      updateCamera();
      terrain.update(p.x,p.z,p.dx,p.dz);placeProbe(p.x,p.z);
      frames.length=render.length=gpu.length=generation.length=0;last=0;
    }catch(error){failure=String(error);status.textContent=failure;throw error;}
    finally{busy=false;}
  }
  function snapshot(){
    const camera=scene.activeCamera!;
    const active=scene.getActiveMeshes(),visible=new Set(active.data.slice(0,active.length));
    const lod=Object.fromEntries(Object.entries(terrain.statistics).map(([name,s])=>[name,{...s,
      spacing:name==='near'?6:name==='mid'?18:36,
      visibleTriangles:scene.meshes.filter(m=>m.metadata?.terrainLod===name&&visible.has(m)).reduce((n,m)=>n+m.getTotalIndices()/3,0)}]));
    const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;
    return {schema:'auralia-geographic-validation-v1',source:source.id,view,timestamp:new Date().toISOString(),
      camera:camera.position.asArray(),cameraForward:camera.getForwardRay().direction.asArray(),viewport:[engine.getRenderWidth(),engine.getRenderHeight()],
      framing:{mode:cameraMode,fov:camera.fov,eyeHeight:camera.position.y-controller.position.y,
        orbitRadius:cameraMode==='game'?gameCamera.radius:null,resolution,referenceHeight:1.75},
      textureScale:{projection:'world metres; triplanar rock',layers:BIOME_MATERIALS.map(m=>({id:m.id,metresPerRepeat:1/m.scale}))},
      samples:frames.length,frameMs:{median:percentile(frames,.5),p95:percentile(frames,.95)},
      fps:engine.getFps(),cpuRenderMs:{median:percentile(render,.5),p95:percentile(render,.95)},
      gpuMs:{median:percentile(gpu,.5),p95:percentile(gpu,.95)},gpuSamples:gpu.length,
      generationMs:{median:percentile(generation,.5),p95:percentile(generation,.95),max:generation.length?Math.max(...generation):0},
      firstReadyMs,startupReadyMs,terrain:lod,geometryBytes:terrain.approxGeometryBytes,
      sourceData:source instanceof WorldStudioSource?source.stats:null,jsHeapBytes:memory?.usedJSHeapSize??null,
      graphics:engine.getGlInfo(),visibleSceneTriangles:scene.getActiveIndices()/3,
      controller:{mode:controller.mode,feetY:controller.position.y,surfaceY:source.isReady([controller.position.x-12,controller.position.z-12,controller.position.x+12,controller.position.z+12])?surface.heightAt(controller.position.x,controller.position.z):null},
      authorityCount:scene.transformNodes.filter(n=>n.name==='authoritative-terrain').length,
      pending:terrain.pendingCount,failure};
  }
  const viewSelector=panel.querySelector<HTMLSelectElement>('#validation-view')!;
  panel.querySelector<HTMLButtonElement>('#go')!.onclick=()=>{void go(viewSelector.value).catch(console.error);};
  panel.querySelector<HTMLButtonElement>('#measure')!.onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`auralia-${source.id}-${view}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches('select,input,button'))return;
    keys.add(e.key.toLowerCase());if(e.code==='Space'){if(!e.repeat)jump=true;e.preventDefault();}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
  window.addEventListener('resize',()=>engine.resize());
  await go('sector');setCameraMode(cameraMode);
  engine.runRenderLoop(()=>{
    const now=performance.now(),dt=Math.min(engine.getDeltaTime()/1000,.05),p=controller.position;
    if(!busy&&!failure&&!source.isReady(windowAt(p.x,p.z))){
      busy=true;loading.hidden=false;loading.textContent='Cargando sectores próximos…';
      void source.prepare(windowAt(p.x,p.z)).catch(e=>{failure=String(e);status.textContent=failure;}).finally(()=>{busy=false;});
    }
    if(!busy&&!failure){
      const forward=scene.activeCamera!.getForwardRay().direction,len=Math.hypot(forward.x,forward.z)||1;
      const fx=forward.x/len,fz=forward.z/len,vertical=Number(keys.has('w'))-Number(keys.has('s')),horizontal=Number(keys.has('d'))-Number(keys.has('a'));
      controller.step(dt,{moveX:fx*vertical+fz*horizontal,moveZ:fz*vertical-fx*horizontal,forwardX:fx,forwardZ:fz,
        horizontal,vertical,run:keys.has('shift'),sprint:false,jumpPressed:jump},traversal);jump=false;
      updateCamera();terrain.update(p.x,p.z,fx,fz);
      if(terrain.generationMs>0)generation.push(terrain.generationMs);
      if(generation.length>2000)generation.shift();
    }
    const renderStart=performance.now();scene.render();render.push(performance.now()-renderStart);
    if(last)frames.push(now-last);last=now;
    const counter=instrumentation.gpuFrameTimeCounter;
    if(counter.current>0&&counter.count!==lastGpuCount){lastGpuCount=counter.count;gpu.push(counter.current/1e6);}
    for(const values of [frames,render,gpu])if(values.length>300)values.shift();
    if(!busy&&!failure&&!terrain.pendingCount&&scene.isReady()){
      firstReadyMs??=now-viewStart;startupReadyMs??=now-started;loading.hidden=true;
    }
    if(now-lastUi>1000){lastUi=now;const m=snapshot();
      panel.querySelector('#metrics')!.textContent=`${source.id}\n${engine.getFps().toFixed(1)} FPS · ${Math.round(m.visibleSceneTriangles).toLocaleString('es-AR')} triángulos\nLOD: 6 / 18 / 36 m\nTerreno: ${(m.geometryBytes/1048576).toFixed(2)} MiB de buffers\nSectores R16: ${m.sourceData?.residentTiles??0} / 25\nGeneración p95: ${m.generationMs.p95?.toFixed(2)??'—'} ms`;
      coords.textContent=`X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)} · Y ${p.y.toFixed(2)}`;
      if(!failure)status.textContent=busy?'Cargando geografía…':`Terreno del juego · ${controller.mode} · ${terrain.pendingCount} chunks pendientes`;
    }
  });
  // Development harness: only this isolated validation scene, no save repository.
  Object.assign(window,{__geographicValidation:{source,surface,scene,engine,terrain,controller,go,views,snapshot,setCameraMode,
    ready:()=>!busy&&!failure&&terrain.pendingCount===0&&scene.isReady(),
    move:(key:string,pressed:boolean)=>pressed?keys.add(key):keys.delete(key)}});
}
