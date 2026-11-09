import './style.css';
import { AxisTranslationGizmo, type EditorAxis } from './AxisTranslationGizmo';
import { AbstractMesh, ArcRotateCamera, Color3, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { LinesMesh } from '@babylonjs/core';
import { MAINLAND, sampleMainlandHeight } from '../world/terrainData';
import { waterSurfaceAt } from '../world/geographicFeatures';
import { TerrainStream } from '../world/TerrainStream';
import { GeographyStream } from '../world/GeographyStream';
import { OceanWater } from '../world/water/OceanWater';
import { GrassSectorSystem } from '../world/grass/GrassSectorSystem';
import { bakeGrassSectorPatch } from '../world/grass/GrassSectorBake';
import { VegetationSystem } from '../world/VegetationSystem';
import { WorldPropSystem } from '../world/WorldPropSystem';
import { ASSET_CATALOG, type AssetId } from '../world/assetCatalog';
import { applyLandscapeAtmosphere } from '../world/LandscapeAtmosphere';
import { GameStore } from '../domain/GameStore';
import { LocalStorageSaveRepository } from '../persistence/SaveRepository';
import { AuthoredAssets } from '../world/editor/AuthoredAssets';
import { AuthoredWater } from '../world/editor/AuthoredWater';
import { loadFoliageForestAssets } from '../world/foliageForestData';
import { fallControlPoints, makeFallPreset, waterfallFootWidth, type FallPoint,
  type FallShape } from '../world/editor/WaterfallSpline';
import { WATER_PROFILES } from '../world/editor/AuraliaWaterProfiles';
import { canJoinWaterfallToRiver, joinWaterfallToRiver } from '../world/editor/WaterJoin';
import { appendGrassStroke, appendHeightStroke, appendSurfaceStroke, authoredAssetExclusions, emptyWorldDocument,
  setTerrainModule,terrainModuleAt,TERRAIN_MODULE_SIZE,
  getWorldDocument, parseWorldDocument, setWorldDocument, type WaterPlacement,
  type WaterKind, type SurfaceId, type PlacedAsset,
  type WaterPresetOverride } from '../world/editor/WorldEditState';

type Tool='module'|'select'|'raise'|'lower'|'smooth'|'flatten'|'surface'|'grass'|'placeAsset'|'placeWater'|'waterPath';
const $=<T extends HTMLElement=HTMLElement>(id:string):T=>{
  const el=document.getElementById(id);if(!el)throw new Error(`Falta #${id}`);return el as T;
};
const select=(id:string)=>$<HTMLSelectElement>(id);
const input=(id:string)=>$<HTMLInputElement>(id);
const canvas=$<HTMLCanvasElement>('world-canvas');
const engine=new Engine(canvas,true,{antialias:true,adaptToDeviceRatio:true});
engine.setHardwareScalingLevel(Math.min(1.5,Math.max(1,devicePixelRatio/1.7)));
const scene=new Scene(engine);
applyLandscapeAtmosphere(scene);
const hemi=new HemisphericLight('editor-ambient',new Vector3(0,1,0),scene);
hemi.intensity=.88;hemi.groundColor=new Color3(.48,.55,.62);
const sun=new DirectionalLight('editor-sun',new Vector3(-.5,-1.3,.55),scene);
sun.intensity=1.35;sun.diffuse=new Color3(1,.91,.76);
const camera=new ArcRotateCamera('world-editor-camera',-Math.PI/3,1.02,140,new Vector3(0,13,0),scene);
camera.lowerBetaLimit=.12;camera.upperBetaLimit=1.48;camera.lowerRadiusLimit=7;camera.upperRadiusLimit=850;
camera.wheelPrecision=25;camera.panningSensibility=90;camera.maxZ=2400;
camera.attachControl(canvas,true);
// Left click is reserved for the editor brush. Right click orbits; middle pans.
const pointers=camera.inputs.attached.pointers as unknown as {buttons:number[]}|undefined;
if(pointers)pointers.buttons=[1,2];
canvas.addEventListener('contextmenu',e=>e.preventDefault());

const root=new TransformNode('auralia-editor-world',scene);
const terrain=new TerrainStream(scene,root);
const geography=new GeographyStream(scene,root);
const ocean=new OceanWater(scene);
const store=new GameStore(new LocalStorageSaveRepository());
const exclusions=()=>authoredAssetExclusions();
const grass=new GrassSectorSystem(scene,root,exclusions);
const vegetation=new VegetationSystem(scene,root,exclusions);
const props=new WorldPropSystem(scene,root,store,exclusions);
const authoredAssets=new AuthoredAssets(scene,root);
const authoredWater=new AuthoredWater(scene,root,true);
void vegetation.load();
void props.load();

let activeTool:Tool='select';
let selectedModule:{cx:number;cz:number}|null=null;
let moduleBrushOnly=false;
let moduleGrid:LinesMesh|null=null;
let moduleOutline:LinesMesh|null=null;
let moduleGridKey='';
let strokeExtent:{minX:number;maxX:number;minZ:number;maxZ:number}|null=null;
// AURALIA_MODULES_GRASS_V6
let selectedId:string|null=null;
let selectedFallHandle=0;
// AURALIA_XYZ_GIZMO_V4: constrained, predictable translations.
type FallEditScope='point'|'body';
type GizmoEditDrag={waterId:string;scope:FallEditScope;handle:number;
  original:[FallPoint,FallPoint,FallPoint,FallPoint];rockX?:number;rockY?:number};
let fallEditScope:FallEditScope='point';
let gizmoEditDrag:GizmoEditDrag|null=null;
let axisSnap=.25;
const axisGizmo=new AxisTranslationGizmo(scene,canvas,camera);
let surfaceId:SurfaceId='grass';
let grassDensity=1;
let assetId:string='arbolito1';
let assetPart=0;
let assetScale=1;
let waterKind:WaterKind='pool';
let cursorX=0,cursorZ=0;
let isPainting=false;
let lastStamp:{x:number;z:number}|null=null;
let flattenAnchor:number|null=null;
let brushDirty=false;
let pendingRadius=0;
let pendingX=0,pendingZ=0;
let lastRebuild=0;
let vegetationOn=true,grassOn=true,legacyWaterOn=true;
let lastCenter='';
let lastStat=0;
let changed=false;
const undoStack:string[]=[];
const redoStack:string[]=[];
const MAX_HISTORY=30;
const palette:Record<SurfaceId,string>={grass:'#66864b',soil:'#8b7254',rock:'#8a8b8e',sand:'#d8b87d',snow:'#e8edf3',lava:'#e66425'};
const surfaceNames:Record<SurfaceId,string>={grass:'Pasto',soil:'Tierra',rock:'Roca',sand:'Arena',snow:'Nieve',lava:'Lava'};
const waterNames:Record<WaterKind,string>={ocean:'Océano',river:'Río',pool:'Laguna',fall:'Cascada'};
const radius=()=>Number(input('radius').value);
const strength=()=>Number(input('strength').value)/100;
function toast(message:string):void{
  const el=$('toast');el.textContent=message;el.classList.add('show');
  window.setTimeout(()=>{if(el.textContent===message)el.classList.remove('show');},2800);
}
function snapshot():string{return JSON.stringify(getWorldDocument());}
function beforeChange():void{
  if(undoStack.length>=MAX_HISTORY)undoStack.shift();
  undoStack.push(snapshot());redoStack.length=0;changed=true;
}
function setDirty():void{changed=true;$('draft').textContent='Guardar borrador ●';}
function applyDocument(next:unknown):void{
  setWorldDocument(next);
  if(getWorldDocument().grassMode!=='painted')getWorldDocument().grassMode='painted';
  if(getWorldDocument().grass.length>0&&getWorldDocument().grassBakes.length===0)
    queueGrassStrokes(getWorldDocument().grass);
  terrain.reloadEdits();
  grass.refreshBakedGrass();
  grass.setFocus(camera.getTarget().x,camera.getTarget().z);
  vegetation.refreshExclusions();
  authoredWater.sync();
  void authoredAssets.sync();
  lastCenter='';
  selectedId=null;selectedFallHandle=0;
  refreshModuleGrid(true);
  renderInspector();renderObjectList();setDirty();
}
function undo():void{
  const state=undoStack.pop();if(!state)return;
  redoStack.push(snapshot());applyDocument(JSON.parse(state));toast('Cambio deshecho');
}
function redo():void{
  const state=redoStack.pop();if(!state)return;
  undoStack.push(snapshot());applyDocument(JSON.parse(state));toast('Cambio rehecho');
}
$('undo').addEventListener('click',undo);
$('redo').addEventListener('click',redo);
window.addEventListener('keydown',e=>{
  const el=e.target as HTMLElement;
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(e.key==='Escape'){selectedId=null;selectTool('select');}
  if(/^[1-4]$/.test(e.key)){
    const selected=currentSelection();
    if(selected&&'profile' in selected&&selected.profile==='fall'){
      selectedFallHandle=Number(e.key)-1;fallEditScope='point';renderInspector();
    }
  }
  if(e.key.toLowerCase()==='f'){
    const selected=currentSelection();
    if(selected&&'profile' in selected&&selected.profile==='fall'){
      const points=fallControlPoints(selected);
      const mean=points.map(p=>new Vector3(p[0],p[1],p[2])).reduce((a,b)=>a.add(b),Vector3.Zero()).scale(.25);
      camera.setTarget(mean);camera.radius=Math.max(18,Math.min(145,selected.length*2.5));
    }
  }
});

function exportDocument():void{
  if(grassBakeBusy||grassBakeQueue.size){toast('Terminá de hornear el césped antes de exportar');return;}
  const json=JSON.stringify(getWorldDocument(),null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='auralia-world.json';a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Exportado: colocar en public/world/auralia-world.json');
}
$('export').addEventListener('click',exportDocument);
$('draft').addEventListener('click',()=>{
  if(grassBakeBusy||grassBakeQueue.size){toast('Esperá a que termine el horneado');return;}
  try{localStorage.setItem('auralia-world-editor-v1',snapshot());$('draft').textContent='Borrador guardado';changed=false;toast('Borrador guardado en este navegador');}
  catch(e){toast('No se pudo guardar: exportá el JSON');console.error(e);}
});
$('import').addEventListener('click',()=>input('import-file').click());
input('import-file').addEventListener('change',async()=>{
  const file=input('import-file').files?.[0];if(!file)return;
  try{
    const obj=JSON.parse(await file.text());
    if(obj?.schema==='auralia-water-lab/2'){
      beforeChange();
      const doc=getWorldDocument();
      for(const profile of ['ocean','river','pool','fall'] as const){
        const p=obj.profiles?.[profile];if(!p)continue;
        doc.waterPresets[profile]={vertex:p.vertexShader,fragment:p.fragmentShader,params:p.params} as WaterPresetOverride;
      }
      authoredWater.sync();renderInspector();setDirty();toast('Presets y shaders del Water Lab v4 importados');
    }else{
      beforeChange();applyDocument(parseWorldDocument(obj));toast('Mundo importado');
    }
  }catch(e){toast('Archivo inválido');console.error(e);}
  input('import-file').value='';
});

function updateCameraTarget(x:number,z:number):void{
  lastCenter='';
  const y=sampleMainlandHeight(x,z);
  camera.setTarget(new Vector3(x,y+10,z));
  camera.radius=Math.min(camera.radius,180);
  cursorX=x;cursorZ=z;
  terrain.update(x,z);
}
select('goto').addEventListener('change',()=>{
  const [x,z]=select('goto').value.split(',').map(Number);updateCameraTarget(x,z);
});
input('radius').addEventListener('input',()=>{$('radius-val').textContent=`${radius()} m`;});
input('strength').addEventListener('input',()=>{$('strength-val').textContent=`${input('strength').value}%`;});
input('showGrass').addEventListener('change',()=>{grassOn=input('showGrass').checked;grass.setEnabled(grassOn);});
input('showVegetation').addEventListener('change',()=>{
  vegetationOn=input('showVegetation').checked;
  for(const m of scene.meshes)if(m.metadata?.decorativeVegetation||m.metadata?.farVegetationProxy)m.isVisible=vegetationOn;
});
input('showLegacyWater').addEventListener('change',()=>{
  legacyWaterOn=input('showLegacyWater').checked;
});

const cursor=MeshBuilder.CreateTorus('brush-outline',{diameter:2,thickness:.035,tessellation:64},scene);
cursor.isPickable=false;cursor.isVisible=false;
const cursorMat=new StandardMaterial('editor-brush-ring',scene);
cursorMat.diffuseColor=new Color3(.72,1,.52);
cursorMat.emissiveColor=new Color3(.5,.84,.36);
cursorMat.disableLighting=true;
cursor.material=cursorMat;

function pickTerrain():Vector3|null{
  const hit=scene.pick(scene.pointerX,scene.pointerY,
    (mesh:AbstractMesh)=>mesh.metadata?.terrainChunk===true);
  return hit?.hit&&hit.pickedPoint?hit.pickedPoint:null;
}
function pickSelection():string|null{
  const hit=scene.pick(scene.pointerX,scene.pointerY,
    (mesh:AbstractMesh)=>mesh.metadata?.authoredAsset!==undefined);
  if(hit?.hit&&hit.pickedMesh instanceof Mesh){
    const i=hit.thinInstanceIndex??-1;
    return authoredAssets.idFromPick(hit.pickedMesh,i);
  }
  return null;
}
function pickWaterBody():string|null{
  const hit=scene.pick(scene.pointerX,scene.pointerY,
    (mesh:AbstractMesh)=>mesh.metadata?.authoredWater===true);
  return hit?.hit?String(hit.pickedMesh?.metadata?.waterId??'')||null:null;
}
function hitWaterHandle():{waterId:string;index:number}|null{
  const hit=scene.pick(scene.pointerX,scene.pointerY,
    (mesh:AbstractMesh)=>typeof mesh.metadata?.waterFallHandle==='number');
  if(!hit?.hit)return null;
  return {waterId:String(hit.pickedMesh!.metadata.waterId),
    index:Number(hit.pickedMesh!.metadata.waterFallHandle)};
}
/** The arrows display the point or the entire waterfall's origin. */
function syncAxisGizmo():void{
  const w=currentSelection();
  if(activeTool!=='select'||!w||!('profile' in w)||w.profile!=='fall'){
    axisGizmo.setAnchor(null);return;
  }
  const p=fallControlPoints(w)[fallEditScope==='body'?0:selectedFallHandle];
  axisGizmo.setAnchor(new Vector3(p[0],p[1],p[2]));
}
/** Constrain Y so intermediate handles cannot turn the waterfall upside down. */
function safeFallY(points:readonly FallPoint[],i:number,newY:number):number{
  const gap=.05;
  if(i===0)return Math.max(newY,points[1][1]+gap);
  if(i===3)return Math.min(newY,points[2][1]-gap);
  const upper=points[i-1][1]-gap,lower=points[i+1][1]+gap;
  return upper>=lower?Math.max(lower,Math.min(upper,newY)):points[i][1];
}
function setFallAnchor(w:WaterPlacement,index:number,point:FallPoint):void{
  const points=fallControlPoints(w);
  const p:[number,number,number]=[...point];
  if(Math.abs(p[1]-points[index][1])>1e-9)p[1]=safeFallY(points,index,p[1]);
  points[index]=p;
  w.fallControls=points;
  w.x=points[0][0];w.y=points[0][1];w.z=points[0][2];
  w.length=Math.max(1,points[0][1]-points[3][1]);
  authoredWater.refreshFall(w.id);
  syncAxisGizmo();
}
/** A general transform moves every handle, instead of leaving the ribbon behind. */
function changeWaterTransform(w:WaterPlacement,key:string,newVal:number):void{
  const oldValue=(w as unknown as Record<string,number>)[key];
  if(w.profile!=='fall'||!['x','y','z','rotation','length'].includes(key)){
    (w as unknown as Record<string,number>)[key]=newVal;return;
  }
  const points=fallControlPoints(w);
  if(key==='x'||key==='y'||key==='z'){
    const axis=key==='x'?0:key==='y'?1:2;
    for(const p of points)p[axis]+=newVal-oldValue;
  }else if(key==='rotation'){
    const delta=newVal-oldValue,c=Math.cos(delta),sin=Math.sin(delta),origin=points[0];
    for(const p of points){
      const dx=p[0]-origin[0],dz=p[2]-origin[2];
      p[0]=origin[0]+dx*c-dz*sin;p[2]=origin[2]+dx*sin+dz*c;
    }
  }else if(key==='length'){
    const scale=newVal/Math.max(1,oldValue),origin=points[0];
    for(const p of points){
      p[0]=origin[0]+(p[0]-origin[0])*scale;
      p[1]=origin[1]+(p[1]-origin[1])*scale;
      p[2]=origin[2]+(p[2]-origin[2])*scale;
    }
  }
  w.fallControls=points;
  (w as unknown as Record<string,number>)[key]=newVal;
}
function selectTool(tool:Tool):void{
  if(tool==='grass'&&getWorldDocument().grassMode!=='painted'){
    beforeChange();
    getWorldDocument().grassMode='painted';
    grass.refreshBakedGrass();
    grass.setFocus(camera.getTarget().x,camera.getTarget().z);
    setDirty();
    toast('Pintura de césped: las posiciones se guardan al hornear.');
  }
  activeTool=tool;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
    button.classList.toggle('active',button.dataset.tool===tool);
  cursor.isVisible=!['module','select','placeWater','placeAsset','waterPath'].includes(tool);
  refreshModuleGrid(true);
  $('brush-panel').hidden=!['raise','lower','smooth','flatten','surface','grass'].includes(tool);
  renderInspector();
}
// Modular tool is created programmatically to preserve customized HTML files.
const moduleButton=document.createElement('button');
moduleButton.className='tool';moduleButton.dataset.tool='module';
moduleButton.innerHTML='▦ <span>Módulos de terreno (72 m)</span>';
document.querySelector('[data-tool="raise"]')?.before(moduleButton);
const moduleOnlyControl=document.createElement('label');
moduleOnlyControl.className='toggle module-clip-control';
moduleOnlyControl.innerHTML='<input id="module-only" type="checkbox"> Pintar solo módulo seleccionado';
$('brush-panel').append(moduleOnlyControl);
input('module-only').addEventListener('change',()=>{
  moduleBrushOnly=input('module-only').checked;
  if(moduleBrushOnly&&!selectedModule){moduleBrushOnly=false;input('module-only').checked=false;
    toast('Elegí un módulo antes de restringir el pincel');}
});
function refreshModuleGrid(force=false):void{
  if(activeTool!=='module'){
    moduleGrid?.dispose(false,false);moduleOutline?.dispose(false,false);
    moduleGrid=null;moduleOutline=null;moduleGridKey='';return;
  }
  const focus=camera.getTarget();
  const cx=Math.floor(focus.x/TERRAIN_MODULE_SIZE),cz=Math.floor(focus.z/TERRAIN_MODULE_SIZE);
  const key=`${cx}:${cz}`;
  if(!force&&key===moduleGridKey)return;
  moduleGridKey=key;
  moduleGrid?.dispose(false,false);moduleOutline?.dispose(false,false);
  const lines:Vector3[][]=[];
  const size=TERRAIN_MODULE_SIZE;
  const xMin=(cx-2)*size,xMax=(cx+3)*size,zMin=(cz-2)*size,zMax=(cz+3)*size;
  const step=size/6;
  for(let ix=cx-2;ix<=cx+3;ix++){
    const x=ix*size,points:Vector3[]=[];
    for(let z=zMin;z<=zMax+.01;z+=step)points.push(new Vector3(x,sampleMainlandHeight(x,z)+.7,z));
    lines.push(points);
  }
  for(let iz=cz-2;iz<=cz+3;iz++){
    const z=iz*size,points:Vector3[]=[];
    for(let x=xMin;x<=xMax+.01;x+=step)points.push(new Vector3(x,sampleMainlandHeight(x,z)+.7,z));
    lines.push(points);
  }
  moduleGrid=MeshBuilder.CreateLineSystem('module-grid',{lines},scene);
  moduleGrid.color=new Color3(.4,.8,.69);moduleGrid.alpha=.8;moduleGrid.isPickable=false;
  if(selectedModule){
    const sx=selectedModule.cx*size,sz=selectedModule.cz*size;
    const border:Vector3[]=[];
    for(let i=0;i<=12;i++){
      const x=sx+i*size/12; border.push(new Vector3(x,sampleMainlandHeight(x,sz)+1.3,sz));
    }
    for(let i=1;i<=12;i++){
      const z=sz+i*size/12;border.push(new Vector3(sx+size,sampleMainlandHeight(sx+size,z)+1.3,z));
    }
    for(let i=1;i<=12;i++){
      const x=sx+size-i*size/12;border.push(new Vector3(x,sampleMainlandHeight(x,sz+size)+1.3,sz+size));
    }
    for(let i=1;i<=12;i++){
      const z=sz+size-i*size/12;border.push(new Vector3(sx,sampleMainlandHeight(sx,z)+1.3,z));
    }
    moduleOutline=MeshBuilder.CreateLines('selected-module',{points:border},scene);
    moduleOutline.color=new Color3(1,.78,.25);moduleOutline.isPickable=false;
  }
}
function chooseModule(cx:number,cz:number,focus=false):void{
  selectedModule={cx,cz};moduleGridKey='';
  if(focus){
    const x=(cx+.5)*TERRAIN_MODULE_SIZE,z=(cz+.5)*TERRAIN_MODULE_SIZE;
    updateCameraTarget(x,z);
  }
  refreshModuleGrid(true);renderInspector();
}
function commitModuleHeight(offset:number,blend:number):void{
  const cell=selectedModule;if(!cell)return;
  beforeChange();setTerrainModule(cell.cx,cell.cz,offset,blend);
  const x=(cell.cx+.5)*TERRAIN_MODULE_SIZE,z=(cell.cz+.5)*TERRAIN_MODULE_SIZE;
  terrain.invalidateRegion(x,z,TERRAIN_MODULE_SIZE*1.1);
  grass.refreshBakedGrass();
  queueGrassStrokes(getWorldDocument().grass.filter(stroke=>
    Math.hypot(stroke.x-x,stroke.z-z)<stroke.radius+TERRAIN_MODULE_SIZE));
  vegetation.refreshExclusions();
  const cells=terrain.activeCells;
  props.setActiveChunks([],x,z);props.setActiveChunks(cells,x,z);
  geography.setActiveChunks([],x,z);geography.setActiveChunks(cells,x,z);
  refreshModuleGrid(true);renderInspector();setDirty();
}

for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
  button.addEventListener('click',()=>selectTool(button.dataset.tool as Tool));

function markTerrain(x:number,z:number,r:number):void{
  brushDirty=true;pendingX=x;pendingZ=z;pendingRadius=Math.max(r,pendingRadius);
  if(performance.now()-lastRebuild>120)flushBrush(false);
}
function flushBrush(force:boolean):void{
  if(!brushDirty)return;
  if(!force&&performance.now()-lastRebuild<95)return;
  terrain.invalidateRegion(pendingX,pendingZ,pendingRadius+8);
  brushDirty=false;pendingRadius=0;lastRebuild=performance.now();
}
// Grass Authoring v1.1: generation is an EDITOR OPERATION, never a frame update.
let grassStrokeStart=0;
const grassBakeQueue=new Set<string>();
let grassBakeBusy=false;
function queueGrassStrokes(strokes:readonly {x:number;z:number;radius:number}[]):void{
  const patchSize=12;
  for(const stroke of strokes){
    const r=Math.max(0,stroke.radius);
    const minX=Math.floor((stroke.x-r-patchSize*.72)/patchSize);
    const maxX=Math.floor((stroke.x+r+patchSize*.72)/patchSize);
    const minZ=Math.floor((stroke.z-r-patchSize*.72)/patchSize);
    const maxZ=Math.floor((stroke.z+r+patchSize*.72)/patchSize);
    for(let px=minX;px<=maxX;px++)for(let pz=minZ;pz<=maxZ;pz++){
      if(Math.hypot((px+.5)*patchSize-stroke.x,(pz+.5)*patchSize-stroke.z)
        <=r+patchSize*.72)grassBakeQueue.add(`${px}:${pz}`);
    }
  }
  if(grassBakeQueue.size)void drainGrassBakes();
}
async function drainGrassBakes():Promise<void>{
  if(grassBakeBusy)return;
  grassBakeBusy=true;
  let completed=0;
  try{
    while(grassBakeQueue.size){
      // Limit work per event turn so Babylon can keep rendering during a Bake.
      for(let i=0;i<2&&grassBakeQueue.size;i++){
        const id=grassBakeQueue.values().next().value;
        if(id===undefined)break;
        grassBakeQueue.delete(id);
        const [px,pz]=id.split(':').map(Number);
        bakeGrassSectorPatch(px,pz);
        completed++;
      }
      await new Promise<void>(resolve=>window.setTimeout(resolve,0));
    }
    grass.refreshBakedGrass();
    grass.setFocus(camera.getTarget().x,camera.getTarget().z);
    setDirty();
    toast(`Césped horneado: ${completed} parches con posiciones fijas. Exportá el mundo.`);
  }catch(error){
    console.error('Grass bake falló:',error);
    toast('No se pudo hornear el césped. Consultá la consola.');
  }finally{
    grassBakeBusy=false;
    if(grassBakeQueue.size)void drainGrassBakes();
  }
}
function rebuildAllPaintedGrass():void{
  const world=getWorldDocument();
  if(world.grass.length===0){toast('No hay zonas pintadas para hornear');return;}
  beforeChange();
  world.grassMode='painted';
  // All existing bakes are re-authored against the current terrain/water.
  queueGrassStrokes(world.grass);
}
// AURALIA_GRASS_AUTHORING_V11

function finishStroke():void{
  if(!isPainting)return;
  isPainting=false;lastStamp=null;flattenAnchor=null;
  flushBrush(true);
  if(activeTool==='grass')
    queueGrassStrokes(getWorldDocument().grass.slice(grassStrokeStart));
  if(['raise','lower','smooth','flatten','surface','grass'].includes(activeTool)){
    if(strokeExtent&&activeTool!=='grass'){
      const b=strokeExtent,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2;
      const r=Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2;
      queueGrassStrokes(getWorldDocument().grass.filter(stroke=>
        Math.hypot(stroke.x-x,stroke.z-z)<stroke.radius+r+12));
    }
    grass.refreshBakedGrass();
    grass.setFocus(camera.getTarget().x,camera.getTarget().z);
    vegetation.refreshExclusions();
    if(['raise','lower','smooth','flatten'].includes(activeTool)){
      const focus=camera.getTarget();
      props.setActiveChunks([],focus.x,focus.z);
      props.setActiveChunks(terrain.activeCells,focus.x,focus.z);
      geography.setActiveChunks([],focus.x,focus.z);
      geography.setActiveChunks(terrain.activeCells,focus.x,focus.z);
    }
  }
  strokeExtent=null;setDirty();
}
function stroke(x:number,z:number):void{
  const r=radius();
  if(lastStamp&&Math.hypot(lastStamp.x-x,lastStamp.z-z)<Math.max(1,r*.24))return;
  lastStamp={x,z};
  if(moduleBrushOnly&&selectedModule&&
    (Math.floor(x/TERRAIN_MODULE_SIZE)!==selectedModule.cx||
      Math.floor(z/TERRAIN_MODULE_SIZE)!==selectedModule.cz))return;
  const base={x,z,radius:r,strength:strength(),
    ...(moduleBrushOnly&&selectedModule?{module:{...selectedModule}}:{})};
  const region=strokeExtent;
  strokeExtent=region?{minX:Math.min(region.minX,x-r),maxX:Math.max(region.maxX,x+r),
    minZ:Math.min(region.minZ,z-r),maxZ:Math.max(region.maxZ,z+r)}:
    {minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r};
  if(activeTool==='surface')appendSurfaceStroke({...base,material:surfaceId});
  else if(activeTool==='grass')appendGrassStroke({...base,density:grassDensity});
  else if(['raise','lower','flatten','smooth'].includes(activeTool)){
    let target=activeTool==='flatten'?(flattenAnchor??sampleMainlandHeight(x,z)):sampleMainlandHeight(x,z);
    if(activeTool==='smooth'){
      const d=Math.max(1,r*.55);
      target=([[-d,0],[d,0],[0,-d],[0,d],[-d,-d],[-d,d],[d,-d],[d,d]] as const)
        .reduce((sum,[dx,dz])=>sum+sampleMainlandHeight(x+dx,z+dz),0)/8;
    }
    appendHeightStroke({...base,mode:activeTool as 'raise'|'lower'|'flatten'|'smooth',targetHeight:target});
  }
  if(activeTool==='surface'||activeTool==='raise'||activeTool==='lower'||
     activeTool==='flatten'||activeTool==='smooth')markTerrain(x,z,r);
}
function uniqueId(prefix:string):string{return `${prefix}-${crypto.randomUUID()}`;}
function refreshAssetExclusions():void{
  grass.refreshExclusions();vegetation.refreshExclusions();
  const f=camera.getTarget();
  props.setActiveChunks([],f.x,f.z);
  props.setActiveChunks(terrain.activeCells,f.x,f.z);
}
function placeAt(p:Vector3):void{
  beforeChange();
  if(activeTool==='placeAsset'){
    const entry=(ASSET_CATALOG as Record<string,{instantiation?:string}>)[assetId]??getWorldDocument().models.find(m=>m.id===assetId);
    if(!entry){toast('El modelo no está registrado');return;}
    if(entry.instantiation==='individual'){toast('Los recursos interactivos requieren objetos individuales');return;}
    const category=(entry as {category?:string}).category;
    const defaultRadius=(entry as {collisionRadius?:number}).collisionRadius??
      (category==='cliffs'?5:category==='rocks'?2.3:
        category==='vegetation'?1.2:1);
    const placement:PlacedAsset={id:uniqueId('asset'),assetId,x:p.x,z:p.z,
      yOffset:0,yaw:Math.random()*Math.PI*2,scale:assetScale,collisionRadius:defaultRadius,
      ...(assetPart?{partIndex:assetPart}:{})};
    getWorldDocument().assets.push(placement);
    selectedId=placement.id;void authoredAssets.sync();
    authoredAssets.markDirty();refreshAssetExclusions();
  } else if(activeTool==='placeWater'){
    const y=waterKind==='ocean'?MAINLAND.waterLevel:
      waterKind==='fall'?sampleMainlandHeight(p.x,p.z)+12:sampleMainlandHeight(p.x,p.z)+.25;
    const w:WaterPlacement={id:uniqueId('water'),name:waterNames[waterKind],profile:waterKind,
      x:p.x,y,z:p.z,width:waterKind==='ocean'?380:waterKind==='river'?12:28,
      length:waterKind==='ocean'?380:waterKind==='fall'?14:waterKind==='river'?55:30,
      rotation:0,rockEnabled:false};
    if(waterKind==='river')w.points=[[p.x,p.z-22],[p.x,p.z+22]];
    if(waterKind==='fall'){
      w.fallWidthEnd=Math.max(1,w.width*.85);
      w.fallControls=makeFallPreset(w,'arc');
    }
    getWorldDocument().water.push(w);selectedId=w.id;authoredWater.sync();
    // A newly placed waterfall enters handle-edit mode immediately.
    if(waterKind==='fall')selectTool('select');
  }
  setDirty();renderInspector();renderObjectList();
}
function currentSelection():PlacedAsset|WaterPlacement|undefined{
  return getWorldDocument().assets.find(x=>x.id===selectedId)||
    getWorldDocument().water.find(x=>x.id===selectedId);
}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const point=pickTerrain();
  if(activeTool==='select'){
    const axis=axisGizmo.begin(e);
    if(axis){
      const w=currentSelection();
      if(w&&'profile' in w&&w.profile==='fall'){
        if(w.joinToLegacyRiver&&(fallEditScope==='body'||selectedFallHandle===0||selectedFallHandle===3)){
          toast('Extremos conectados: desconectá del río para mover la cascada completa o sus extremos.');
          axisGizmo.end();return;
        }
        beforeChange();
        gizmoEditDrag={waterId:w.id,scope:fallEditScope,handle:selectedFallHandle,
          original:fallControlPoints(w),rockX:w.rockX,rockY:w.rockY};
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      axisGizmo.end();
    }
    const handle=hitWaterHandle();
    if(handle){
      const w=getWorldDocument().water.find(x=>x.id===handle.waterId&&x.profile==='fall');
      if(w){
        selectedId=w.id;selectedFallHandle=handle.index;fallEditScope='point';
        authoredWater.setSelected(w.id);authoredWater.setSelectedHandle(selectedFallHandle);
        renderInspector();renderObjectList();return;
      }
    }
    selectedId=pickSelection()??pickWaterBody();
    selectedFallHandle=0;
    fallEditScope='point';
    renderInspector();renderObjectList();return;
  }
  if(activeTool==='module'){
    if(point)chooseModule(Math.floor(point.x/TERRAIN_MODULE_SIZE),
      Math.floor(point.z/TERRAIN_MODULE_SIZE));
    return;
  }
  if(!point){toast('Apuntá a un sector de terreno cercano');return;}
  cursorX=point.x;cursorZ=point.z;
  if(activeTool==='placeAsset'||activeTool==='placeWater'){placeAt(point);return;}
  if(activeTool==='waterPath'){
    const water=getWorldDocument().water.find(w=>w.id===selectedId&&w.profile==='river');
    if(!water){toast('Seleccioná un río existente desde la lista');return;}
    beforeChange();
    water.points??=[[water.x,water.z]];
    water.points.push([point.x,point.z]);
    water.x=water.points.reduce((n,p)=>n+p[0],0)/water.points.length;
    water.z=water.points.reduce((n,p)=>n+p[1],0)/water.points.length;
    authoredWater.sync();renderInspector();setDirty();return;
  }
  if(activeTool==='grass')grassStrokeStart=getWorldDocument().grass.length;
  beforeChange();isPainting=true;strokeExtent=null;flattenAnchor=sampleMainlandHeight(point.x,point.z);
  stroke(point.x,point.z);canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(gizmoEditDrag){
    const drag=gizmoEditDrag;
    const value=axisGizmo.move(e,axisSnap);
    if(!value)return;
    const w=getWorldDocument().water.find(x=>x.id===drag.waterId&&x.profile==='fall');
    if(!w)return;
    const axisIndex=({x:0,y:1,z:2} as Record<EditorAxis,number>)[value.axis];
    if(drag.scope==='body'){
      const points=drag.original.map(p=>[...p] as FallPoint) as
        [FallPoint,FallPoint,FallPoint,FallPoint];
      for(const p of points)p[axisIndex]+=value.delta;
      w.fallControls=points;
      w.x=points[0][0];w.y=points[0][1];w.z=points[0][2];
      // Explicit Water Lab v4 rock proxies travel with the whole waterfall.
      if(axisIndex===0&&drag.rockX!==undefined)w.rockX=drag.rockX+value.delta;
      if(axisIndex===1&&drag.rockY!==undefined)w.rockY=drag.rockY+value.delta;
      authoredWater.refreshFall(w.id);
      syncAxisGizmo();
    }else{
      const p:[number,number,number]=[...drag.original[drag.handle]];
      p[axisIndex]+=value.delta;
      setFallAnchor(w,drag.handle,p);
    }
    // Update visible XYZ fields WITHOUT rebuilding the inspector while dragging.
    const active=fallControlPoints(w)[drag.scope==='body'?0:drag.handle];
    const panel=$('tool-inspector');
    for(let i=0;i<3;i++){
      const key=drag.scope==='body'?(['x','y','z'][i]):`control.${drag.handle}.${i}`;
      const field=panel.querySelector<HTMLInputElement>(`input[data-field="${key}"]`);
      if(field)field.value=String(Number(active[i].toFixed(3)));
    }
    setDirty();return;
  }
  const point=pickTerrain();
  if(!point)return;
  cursorX=point.x;cursorZ=point.z;
  cursor.position.set(point.x,point.y+.3,point.z);
  cursor.scaling.set(radius(),radius(),radius());
  if(isPainting)stroke(point.x,point.z);
});
function finishPointer():void{
  if(gizmoEditDrag){
    gizmoEditDrag=null;
    axisGizmo.end();
    renderInspector();renderObjectList();setDirty();
    return;
  }
  finishStroke();
}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('pointercancel',finishPointer);
window.addEventListener('pointerup',finishPointer);

function htmlEscape(x:unknown):string{return String(x).replace(/[&<>"']/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}
function field(label:string,key:string,value:string|number,type='number',step='.1'):string{
  return `<div class="field"><label>${htmlEscape(label)}</label><input data-field="${key}" type="${type}" ${type==='number'?`step="${step}"`:''} value="${htmlEscape(value)}"></div>`;
}
function fieldSelect(label:string,key:string,value:string,options:readonly string[]):string{
  return `<div class="field"><label>${htmlEscape(label)}</label><select data-field="${key}">${options.map(v=>`<option value="${htmlEscape(v)}" ${v===value?'selected':''}>${htmlEscape(v)}</option>`).join('')}</select></div>`;
}
function renderInspector():void{
  const panel=$('tool-inspector');
  if(activeTool==='module'){
    if(!selectedModule){
      panel.innerHTML='<div class="inspector-subtitle">Módulos de terreno</div><p class="inspector-help">Elegí un sector con clic en el mundo. Cada módulo mide 72 × 72 m y puede editarse sin separar su malla del mapa.</p>';
      return;
    }
    const {cx,cz}=selectedModule;
    const m=terrainModuleAt(cx,cz);
    panel.innerHTML=`<div class="inspector-subtitle">Sector ${cx} : ${cz}</div>
      <p class="inspector-help">Origen X ${cx*TERRAIN_MODULE_SIZE} · Z ${cz*TERRAIN_MODULE_SIZE}. Los bordes se mezclan con el terreno vecino sin generar grietas.</p>
      <div class="module-two-cols">
        ${field('Sector CX','moduleCx',cx,'number','1')}
        ${field('Sector CZ','moduleCz',cz,'number','1')}
      </div>
      ${field('Desnivel del sector (metros)','moduleOffset',m?.offset??0,'number','.25')}
      ${field('Mezcla de bordes (m)','moduleBlend',m?.blend??8,'number','1')}
      <div class="inspector-actions">
        <button data-module-action="focus">Ir al sector</button>
        <button data-module-action="clear">Restablecer nivel</button>
      </div>
      <p class="inspector-help">Para pintar únicamente aquí, activá «Pintar solo módulo seleccionado» en el panel de pincel.</p>`;
    const cxInput=panel.querySelector<HTMLInputElement>('[data-field=moduleCx]')!;
    const czInput=panel.querySelector<HTMLInputElement>('[data-field=moduleCz]')!;
    const changeSector=()=>{
      const nextCx=Number(cxInput.value),nextCz=Number(czInput.value);
      if(Number.isInteger(nextCx)&&Number.isInteger(nextCz)&&Math.abs(nextCx)<400&&Math.abs(nextCz)<400)
        chooseModule(nextCx,nextCz,false);
      else toast('CX y CZ deben ser enteros válidos');
    };
    cxInput.addEventListener('change',changeSector);czInput.addEventListener('change',changeSector);
    const apply=()=>{
      const off=Number(panel.querySelector<HTMLInputElement>('[data-field=moduleOffset]')!.value);
      const blend=Number(panel.querySelector<HTMLInputElement>('[data-field=moduleBlend]')!.value);
      if(!Number.isFinite(off)||!Number.isFinite(blend)||blend<2||blend>30||Math.abs(off)>250){
        toast('Desnivel entre -250 y 250; mezcla de 2 a 30 metros');return;
      }
      commitModuleHeight(off,blend);
    };
    panel.querySelectorAll<HTMLInputElement>('[data-field=moduleOffset], [data-field=moduleBlend]')
      .forEach(el=>el.addEventListener('change',apply));
    panel.querySelector<HTMLButtonElement>('[data-module-action=focus]')?.addEventListener('click',
      ()=>chooseModule(cx,cz,true));
    panel.querySelector<HTMLButtonElement>('[data-module-action=clear]')?.addEventListener('click',
      ()=>commitModuleHeight(0,m?.blend??8));
    return;
  }
  const preserved=[...panel.querySelectorAll<HTMLDetailsElement>('details[open]')]
    .map(el=>el.dataset.panel);
  const selected=currentSelection();
  authoredWater.setSelected(selected&&'profile' in selected?selected.id:null);
  if(selected&&'profile' in selected&&selected.profile==='fall')
    authoredWater.setSelectedHandle(selectedFallHandle);
  syncAxisGizmo();
  $('interaction-tip').textContent=selected&&'profile' in selected&&selected.profile==='fall'
    ?'CASCADA · Flechas XYZ: X rojo · Y verde · Z azul · Shift: precisión · 1–4: punto · F: centrar'
    :'Botón izquierdo: seleccionar/pintar · Derecho: orbitar · Rueda: zoom · WASD: desplazar';
  if(selected){
    if('assetId' in selected){
      panel.innerHTML=`<div class="inspector-subtitle">Asset: ${htmlEscape(selected.assetId)}</div>
        ${field('X','x',selected.x)}${field('Z','z',selected.z)}
        ${field('Desplazamiento Y','yOffset',selected.yOffset)}
        ${field('Giro (radianes)','yaw',selected.yaw)}${field('Escala','scale',selected.scale)}
        ${field('Radio de colisión aproximado','collisionRadius',selected.collisionRadius??0)}
        <div class="inspector-actions"><button data-action="duplicate">Duplicar</button><button class="danger" data-action="delete">Eliminar</button></div>`;
    }else{
      const base=WATER_PROFILES[selected.profile].params as Record<string,number|string>;
      const preset=getWorldDocument().waterPresets[selected.profile]?.params??{};
      const effective={...base,...preset,...selected.params};
      if(selected.profile==='fall'){
        const path=fallControlPoints(selected);
        const handles=['Labio','Curva superior','Curva inferior','Impacto'];
        const sectionsForWater:Record<string,string[]>={
          motion:['uWaveAmp','uWaveFreq','uWaveSpeed','uChop','uNormalStrength','uDetail','uFlowSpeed'],
          foam:['uFoamWidth','uFoamIntensity','uFoamBreakup','uContactFoam','uFoamScale','uCrestFoam','uImpactFoam','uImpactWidth','uImpactRipples','uImpactTurbulence','uImpactSpray'],
          light:['uFresnel','uGloss','uSpecular','uOpacity','uCaustics','uDepthStrength','uCausticAnimMode','uCausticAnimSpeed','uCausticWarp','uCausticScale','uCausticSharpness'],
          color:['uShallowColor','uDeepColor','uFoamColor']
        };
        const sections:Record<string,[string,string[]]>={
          motion:['Movimiento y oleaje',['uWaveAmp','uWaveFreq','uWaveSpeed','uChop','uNormalStrength','uDetail','uFlowSpeed']],
          foam:['Espuma y turbulencia',['uFoamWidth','uFoamIntensity','uFoamBreakup','uContactFoam','uFoamScale','uCrestFoam','uImpactFoam','uImpactWidth','uImpactRipples','uImpactTurbulence','uImpactSpray']],
          light:['Reflejos y cáusticas',['uFresnel','uGloss','uSpecular','uOpacity','uCaustics','uDepthStrength','uCausticAnimMode','uCausticAnimSpeed','uCausticWarp','uCausticScale','uCausticSharpness']],
          color:['Colores',['uShallowColor','uDeepColor','uFoamColor']],
          other:['Parámetros extra',Object.keys(effective).filter(k=>!['uSunLevel','uRockX','uRockY','uRockRadius'].includes(k)&&
            !['motion','foam','light','color'].some(g=>sectionsForWater[g]?.includes(k)))]
        };
        panel.innerHTML=`<div class="inspector-subtitle">Cascada · Editor de curva 3D</div>
          <p class="inspector-help">Seleccioná un punto y arrastrá <b>solamente la flecha del eje</b> que querés cambiar. Las esferas de colores sirven para seleccionar, no para mover libremente.</p>
          <div class="fall-presets">
            <button data-fall-preset="straight">Cortina</button>
            <button data-fall-preset="arc">Arco</button>
            <button data-fall-preset="s">Curva S</button>
          </div>
          <div class="fall-axis-mode">
            <button data-fall-scope="point" class="${fallEditScope==='point'?'active':''}">Mover punto</button>
            <button data-fall-scope="body" class="${fallEditScope==='body'?'active':''}">Mover cascada completa</button>
          </div>
          <div class="fall-handles">${handles.map((label,i)=>
            `<button data-fall-handle="${i}" class="fall-handle fall-handle-${i} ${selectedFallHandle===i?'active':''}">
              <span>${i+1}</span>${label}</button>`).join('')}</div>
          <div class="fall-axis-hint">${fallEditScope==='body'?'Origen de la cascada (traslada todos los puntos)':'Punto '+(selectedFallHandle+1)+': '+handles[selectedFallHandle]}</div>
          <div class="fall-xyz-inputs">${['X','Y','Z'].map((name,i)=>field(name,
              fallEditScope==='body'?['x','y','z'][i]:`control.${selectedFallHandle}.${i}`,
              Number(path[fallEditScope==='body'?0:selectedFallHandle][i].toFixed(3)),
              'number','.1')).join('')}</div>
          <div class="fall-snap-row"><label for="axis-snap">Paso de las flechas</label>
            <select id="axis-snap">
              ${[[0,'Libre'],[.1,'0,1 m'],[.25,'0,25 m'],[.5,'0,5 m'],[1,'1 m'],[2,'2 m']].map(([v,label])=>
                `<option value="${v}" ${axisSnap===v?'selected':''}>${label}</option>`).join('')}
            </select></div>
          <p class="fall-axis-help"><b>X rojo</b> · <b>Y verde</b> · <b>Z azul</b>. Shift al arrastrar = precisión ×0,1. Los puntos mantienen el orden vertical.</p>
          <div class="fall-main-grid">
            ${field('Ancho inicio (m)','width',selected.width)}
            ${field('Ancho final (m)','fallWidthEnd',waterfallFootWidth(selected))}
          </div>
          <div class="fall-connection ${selected.joinToLegacyRiver?'connected':''}">
            <div class="fall-connection-title">Continuidad del agua</div>
            <p>${selected.joinToLegacyRiver?
              'Conectada al río procedural. Podés editar la curva interior; los extremos quedan bloqueados para evitar cortes. Desconectá para moverla entera.':
              'Esta malla es independiente de los tramos de río originales. Conectala sin acomodar las flechas XYZ.'}</p>
            <button class="fall-join-button" data-action="${selected.joinToLegacyRiver?'unjoinRiver':'joinRiver'}">
              ${selected.joinToLegacyRiver?'Desconectar del río':'Unir automáticamente con el río'}
            </button>
          </div>
          <div class="fall-quick-actions">
            <button class="fit-water" data-action="fitImpact">Impacto al agua/terreno</button>
            <button data-action="focus">Centrar vista</button>
          </div>
          <details data-panel="transform"><summary>Mover / girar la cascada completa</summary>
            ${field('Nombre','name',selected.name,'text')}
            <div class="fall-main-grid">${field('Inicio X','x',selected.x)}${field('Inicio Y','y',selected.y)}
            ${field('Inicio Z','z',selected.z)}${field('Altura total (m)','length',selected.length)}
            ${field('Giro (rad)','rotation',selected.rotation)}</div>
          </details>
          <details data-panel="collisions"><summary>Interacción con rocas (proxy v4)</summary>
            <p class="subtle">Máscara elíptica del shader original, calibrada manualmente; no es una colisión automática con mallas.</p>
            <label class="toggle"><input id="rockEnabled" type="checkbox" ${selected.rockEnabled?'checked':''}> Mostrar desvío de roca</label>
            ${field('Centro X','rockX',selected.rockX??selected.x)}
            ${field('Centro Y','rockY',selected.rockY??selected.y-selected.length*.4)}
            ${field('Radio','rockRadius',selected.rockRadius??2.3)}
          </details>
          <div class="water-v4-title">Water Lab v4 · Configuración visual</div>
          ${Object.entries(sections).filter(([,info])=>info[1].length).map(([id,[label,keys]])=>
            `<details data-panel="${id}"><summary>${label}</summary>
              <div class="fall-main-grid">${keys.filter(k=>k in effective).map(key=>{
                const v=effective[key];return field(key,`param.${key}`,v,
                  typeof v==='string'?'color':'number',typeof v==='number'?'.01':'.1');
              }).join('')}</div></details>`).join('')}
          <div class="inspector-actions"><button data-action="duplicate">Duplicar</button>
            <button class="danger" data-action="delete">Eliminar</button></div>`;
      }else{
        panel.innerHTML=`<div class="inspector-subtitle">Agua v4 · ${waterNames[selected.profile]}</div>
          ${field('Nombre','name',selected.name,'text')}
          ${fieldSelect('Perfil','profile',selected.profile,['ocean','river','pool','fall'])}
          <div class="fall-main-grid">${field('X','x',selected.x)}${field('Y','y',selected.y)}${field('Z','z',selected.z)}
          ${field('Ancho','width',selected.width)}${field('Longitud','length',selected.length)}
          ${field('Giro (rad)','rotation',selected.rotation)}</div>
          <details data-panel="shader"><summary>Shader Water Lab v4</summary>
          ${Object.entries(effective).filter(([k])=>k!=='uSunLevel').map(([key,v])=>
            field(key,`param.${key}`,v,typeof v==='string'?'color':'number',typeof v==='number'?'.01':'.1')).join('')}
          </details><div class="inspector-actions"><button data-action="duplicate">Duplicar</button>
          <button class="danger" data-action="delete">Eliminar</button></div>`;
      }
    }
    for(const element of panel.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]')){
      element.addEventListener('change',()=>{
        const current=currentSelection();if(!current)return;
        const key=element.dataset.field!;
        if('profile' in current&&current.profile==='fall'&&current.joinToLegacyRiver&&
          (['x','y','z','width','fallWidthEnd','rotation','length'].includes(key)||
            key.startsWith('control.0.')||key.startsWith('control.3.'))){
          toast('Desconectá del río antes de editar los extremos o el tamaño de la cascada.');
          renderInspector();return;
        }
        const newVal=element.type==='number'?Number(element.value):element.value;
        if(typeof newVal==='number'&&!Number.isFinite(newVal))return;
        if(typeof newVal==='number'&&['width','fallWidthEnd','length'].includes(key)&&newVal<=0){
          toast('El ancho y la caída deben ser mayores que cero');return;
        }
        beforeChange();
        if(key.startsWith('param.')&&'profile' in current){
          current.params??={};current.params[key.slice(6)]=newVal;
        }else if(key.startsWith('control.')&&'profile' in current&&current.profile==='fall'){
          const parts=key.split('.'),index=Number(parts[1]),axis=Number(parts[2]);
          const points=fallControlPoints(current);
          if(index>=0&&index<4&&axis>=0&&axis<=2&&typeof newVal==='number'){
            const p:[number,number,number]=[...points[index]];
            p[axis]=newVal;
            setFallAnchor(current,index,p);
          }
        }else if(key==='profile'&&'profile' in current){
          current.profile=newVal as WaterKind;current.params={};
        }else if('profile' in current&&typeof newVal==='number'){
          changeWaterTransform(current,key,newVal);
        }else{
          (current as unknown as Record<string,unknown>)[key]=newVal;
        }
        if('assetId' in current){authoredAssets.markDirty();refreshAssetExclusions();}else authoredWater.sync();
        setDirty();renderObjectList();renderInspector();
      });
    }
    for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-fall-handle]')){
      button.addEventListener('click',()=>{
        selectedFallHandle=Number(button.dataset.fallHandle);
        fallEditScope='point';
        authoredWater.setSelectedHandle(selectedFallHandle);
        renderInspector();
      });
    }
    for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-fall-scope]')){
      button.addEventListener('click',()=>{
        fallEditScope=button.dataset.fallScope==='body'?'body':'point';
        renderInspector();
      });
    }
    panel.querySelector<HTMLSelectElement>('#axis-snap')?.addEventListener('change',e=>{
      const newSnap=Number((e.target as HTMLSelectElement).value);
      if(Number.isFinite(newSnap)&&newSnap>=0)axisSnap=newSnap;
    });
    for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-fall-preset]')){
      button.addEventListener('click',()=>{
        const w=currentSelection();if(!w||!('profile' in w)||w.profile!=='fall')return;
        if(w.joinToLegacyRiver){toast('Desconectá del río antes de cambiar el preset completo.');return;}
        beforeChange();
        const p=fallControlPoints(w);
        const height=Math.max(1,p[0][1]-p[3][1]);
        w.fallControls=makeFallPreset({...w,x:p[0][0],y:p[0][1],z:p[0][2],length:height},
          button.dataset.fallPreset as FallShape);
        w.length=height;
        authoredWater.sync();setDirty();renderInspector();
      });
    }
    for(const detail of panel.querySelectorAll<HTMLDetailsElement>('details[data-panel]')){
      if(preserved.includes(detail.dataset.panel))detail.open=true;
    }
    const rock=panel.querySelector<HTMLInputElement>('#rockEnabled');
    rock?.addEventListener('change',()=>{
      const w=currentSelection();if(!w||!('profile' in w))return;
      beforeChange();w.rockEnabled=rock.checked;authoredWater.sync();setDirty();
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.action,old=currentSelection();if(!old)return;
      if(action==='focus'&&'profile' in old&&old.profile==='fall'){
        const points=fallControlPoints(old);
        const mid=points.map(p=>new Vector3(p[0],p[1],p[2]))
          .reduce((a,b)=>a.add(b),Vector3.Zero()).scale(.25);
        camera.setTarget(mid);camera.radius=Math.max(18,Math.min(145,old.length*2.5));
        return;
      }
      if(action==='fitImpact'&&'profile' in old&&old.profile==='fall'&&old.joinToLegacyRiver){
        toast('Los extremos del río están conectados; desconectá antes de modificar el impacto.');return;
      }
      if(action==='joinRiver'&&(!('profile' in old)||!canJoinWaterfallToRiver(old))){
        toast('La unión automática funciona en la Cascada del Valle, cerca del río existente.');return;
      }
      beforeChange();
      const doc=getWorldDocument();
      if(action==='joinRiver'&&'profile' in old&&old.profile==='fall'){
        const joined=joinWaterfallToRiver(old);
        if(joined){
          Object.assign(old,joined);
          // A connected waterfall fades into native river water on both sides.
          legacyWaterOn=true;input('showLegacyWater').checked=true;
          const focus=camera.getTarget();
          geography.setActiveChunks([],focus.x,focus.z);
          geography.setActiveChunks(terrain.activeCells,focus.x,focus.z);
          toast('Río y cascada unidos; se preservaron los cambios de terreno y el shader v4.');
        }
      }else if(action==='unjoinRiver'&&'profile' in old&&old.profile==='fall'){
        old.joinToLegacyRiver=false;
        const focus=camera.getTarget();
        geography.setActiveChunks([],focus.x,focus.z);
        geography.setActiveChunks(terrain.activeCells,focus.x,focus.z);
        toast('Cascada desacoplada. Podés volver a unirla cuando quieras.');
      }else if(action==='fitImpact'&&'profile' in old&&old.profile==='fall'){
        const points=fallControlPoints(old);
        const end=points[3];
        const surface=waterSurfaceAt(end[0],end[2]);
        end[1]=surface?.level??sampleMainlandHeight(end[0],end[2])+.12;
        old.fallControls=points;
        old.length=Math.max(1,points[0][1]-points[3][1]);
      }else if(action==='delete'){
        doc.assets=doc.assets.filter(x=>x.id!==selectedId);
        doc.water=doc.water.filter(x=>x.id!==selectedId);
        selectedId=null;
      }else{
        const clone={...old,id:uniqueId('copy'),x:old.x+5,z:old.z+5};
        if('assetId' in clone)doc.assets.push(clone);
        else{
          if(clone.profile==='fall')clone.fallControls=fallControlPoints(old as WaterPlacement)
            .map(p=>[p[0]+5,p[1],p[2]+5]);
          if(clone.points)clone.points=clone.points.map(p=>[p[0]+5,p[1]+5]);
          doc.water.push(clone);
        }
        selectedId=clone.id;
      }
      authoredWater.sync();void authoredAssets.sync();
      authoredAssets.markDirty();refreshAssetExclusions();renderInspector();renderObjectList();setDirty();
    }));
    return;
  }
  if(activeTool==='surface'){
    panel.innerHTML=`<div class="inspector-subtitle">Pintar materiales</div><p class="inspector-help">Se mezclan las seis capas en transiciones suaves. Los pastizales se hornean con el pincel de césped.</p>
      <div class="palette">${(Object.keys(palette) as SurfaceId[]).map(id=>
       `<button class="swatch ${surfaceId===id?'selected':''}" data-surface="${id}"><span class="swatch-color swatch-material" style="background-image:url('/assets/terrain/aw_${id}_albedo_rough_1k.webp')"></span>${surfaceNames[id]}</button>`).join('')}</div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-surface]').forEach(b=>b.addEventListener('click',()=>{
      surfaceId=b.dataset.surface as SurfaceId;renderInspector();
    }));
  }else if(activeTool==='grass'){
    panel.innerHTML=`<div class="inspector-subtitle">Pastizales GLB</div>
      <p class="inspector-help">Pintá sectores y horneá posiciones fijas. El juego reutiliza cuatro mallas GLB mediante thin instances.</p>
      ${field('Multiplicador de densidad (0 a 3)','grassDensity',grassDensity)}`;
    const bakeControl=document.createElement('button');
    bakeControl.textContent='Hornear / actualizar todas las zonas pintadas';
    bakeControl.style.cssText='width:100%;margin-top:12px;padding:9px';
    bakeControl.addEventListener('click',rebuildAllPaintedGrass);
    panel.appendChild(bakeControl);
    const fixedNote=document.createElement('p');
    fixedNote.className='inspector-help';
    fixedNote.textContent=`Pastizales guardados: ${getWorldDocument().grassBakes.length} parches. `+
      'Sin generación durante el movimiento de cámara. Rehorneá al editar el relieve o el agua.';
    panel.appendChild(fixedNote);
    panel.querySelector<HTMLInputElement>('[data-field]')?.addEventListener('change',e=>{
      grassDensity=Math.min(3,Math.max(0,Number((e.target as HTMLInputElement).value)));
    });
  }else if(activeTool==='placeAsset'){
    const ids=[...(Object.keys(ASSET_CATALOG) as AssetId[]).filter(id=>ASSET_CATALOG[id].instantiation==='thin'),
      ...getWorldDocument().models.map(m=>m.id)];
    panel.innerHTML=`<div class="inspector-subtitle">Colocar GLB</div>
      <p class="inspector-help">Instancias agrupadas por malla y material del catálogo. Los recursos interactivos se gestionan por separado.</p>
      ${fieldSelect('Modelo','assetId',assetId,ids)}
      ${field('Escala relativa','assetScale',assetScale)}${field('Índice de pieza (packs)','assetPart',assetPart)}
      <h3>REGISTRAR GLB NUEVO</h3>
      <p class="subtle">Primero copiá el GLB a public/assets. Después registrá aquí la ruta dentro de /assets/. Es persistente en el JSON del mundo.</p>
      ${field('Nombre (ID)','modelName','nuevo-modelo','text')}
      ${field('Ruta /assets/...glb','modelPath','/assets/world/mi-modelo.glb','text')}
      ${field('Escala de referencia','modelScale',1)}
      <div class="inspector-actions"><button id="register-glb">Registrar GLB</button></div>`;
    panel.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]').forEach(el=>el.addEventListener('change',()=>{
      assetId=panel.querySelector<HTMLSelectElement>('[data-field=assetId]')!.value;
      assetScale=Math.max(.01,Number(panel.querySelector<HTMLInputElement>('[data-field=assetScale]')!.value));
      assetPart=Math.max(0,Math.floor(Number(panel.querySelector<HTMLInputElement>('[data-field=assetPart]')!.value)));
    }));
    panel.querySelector<HTMLButtonElement>('#register-glb')?.addEventListener('click',()=>{
      const name=panel.querySelector<HTMLInputElement>('[data-field=modelName]')!.value.trim();
      const path=panel.querySelector<HTMLInputElement>('[data-field=modelPath]')!.value.trim();
      const scale=Number(panel.querySelector<HTMLInputElement>('[data-field=modelScale]')!.value);
      if(!/^[A-Za-z0-9_-]{2,70}$/.test(name)||
        !/^\/assets\/[A-Za-z0-9_./-]+\.glb$/i.test(path)||path.includes('..')||
        !Number.isFinite(scale)||scale<=0){toast('ID, ruta GLB o escala inválidos');return;}
      if((ASSET_CATALOG as Record<string,unknown>)[name]||getWorldDocument().models.some(m=>m.id===name)){
        toast('Ese identificador ya existe');return;
      }
      beforeChange();getWorldDocument().models.push({id:name,path,referenceScale:scale});
      assetId=name;renderInspector();setDirty();toast('GLB registrado; ya podés colocarlo');
    });
  }else if(activeTool==='placeWater'){
    panel.innerHTML=`<div class="inspector-subtitle">Crear superficie de agua v4</div>
      ${fieldSelect('Perfil','waterKind',waterKind,['ocean','river','pool','fall'])}
      <p class="inspector-help">Los parámetros y shaders iniciales vienen de tu Water Lab v4. Podés editar cada superficie después de colocarla.</p>
      <p class="subtle">Cascada: la colisión con roca es una máscara SDF calibrada, no simulación física.</p>`;
    panel.querySelector<HTMLSelectElement>('[data-field]')?.addEventListener('change',e=>{
      waterKind=(e.target as HTMLSelectElement).value as WaterKind;
    });
  }else if(activeTool==='waterPath'){
    panel.innerHTML=`<div class="inspector-subtitle">Extender un río</div>
      <p class="inspector-help">Seleccioná un río en la lista de objetos y hacé clic para añadir puntos al cauce. El editor genera su ribbon.</p>`;
  }else{
    const descriptions:Record<string,string>={select:'Clic sobre un asset para seleccionarlo; el agua se selecciona desde la lista.',
      raise:'Pinta elevaciones en el terreno.',lower:'Crea depresiones.',
      smooth:'Interpola el terreno hacia el promedio de sus alrededores.',
      flatten:'Usa la altura del primer punto para nivelar progresivamente.'};
    panel.innerHTML=`<div class="inspector-subtitle">${htmlEscape(activeTool)}</div><p class="inspector-help">${descriptions[activeTool]??''}</p>`;
  }
}
function renderObjectList():void{
  const container=$('world-objects');
  const d=getWorldDocument();
  container.innerHTML=[...d.assets.map(x=>({id:x.id,label:x.assetId,x:x.x,z:x.z})),
    ...d.water.map(x=>({id:x.id,label:waterNames[x.profile],x:x.x,z:x.z}))]
    .map(x=>`<div class="object-row ${x.id===selectedId?'selected':''}" data-select-id="${htmlEscape(x.id)}"><span>${htmlEscape(x.label)}<small> · ${Math.round(x.x)}, ${Math.round(x.z)}</small></span><span>✎</span></div>`).join('')||'<p class="subtle">Sin objetos colocados.</p>';
  container.querySelectorAll<HTMLElement>('[data-select-id]').forEach(el=>el.addEventListener('click',()=>{
    selectedId=el.dataset.selectId??null;
    selectedFallHandle=0;
    selectTool('select');renderObjectList();
    const item=currentSelection();if(item)updateCameraTarget(item.x,item.z);
  }));
}

const keys=new Set<string>();
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;
  if(['w','a','s','d','shift'].includes(e.key.toLowerCase())){
    keys.add(e.key.toLowerCase());e.preventDefault();
  }
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
function pan(dt:number):void{
  const alpha=camera.alpha;
  const speed=dt*(keys.has('shift')?140:48)*(camera.radius/140);
  const forward=new Vector3(-Math.cos(alpha),0,-Math.sin(alpha));
  const right=new Vector3(-forward.z,0,forward.x);
  const v=new Vector3(0,0,0);
  if(keys.has('w'))v.addInPlace(forward);
  if(keys.has('s'))v.subtractInPlace(forward);
  if(keys.has('d'))v.addInPlace(right);
  if(keys.has('a'))v.subtractInPlace(right);
  if(v.lengthSquared()===0)return;
  v.normalize().scaleInPlace(speed);
  const t=camera.getTarget().add(v);
  camera.setTarget(t);
}

async function boot():Promise<void>{
  try{
    const local=localStorage.getItem('auralia-world-editor-v1');
    const response=await fetch('/world/auralia-world.json',{cache:'no-store'});
    if(local){setWorldDocument(JSON.parse(local));toast('Borrador local cargado (podés exportarlo)');}
    else if(response.ok)setWorldDocument(await response.json());
    else setWorldDocument(emptyWorldDocument());
  }catch(e){console.warn('No se pudo cargar el mundo editable:',e);setWorldDocument(emptyWorldDocument());}
  try { await loadFoliageForestAssets(); }
  catch(e) { console.warn('No se pudo cargar el Bosque Ilustrado:',e); }
  if(getWorldDocument().grassMode!=='painted'){
    getWorldDocument().grassMode='painted';
    setDirty();
    toast('Modo natural desactivado: el césped solo se genera al pintar y hornear.');
  }
  if(getWorldDocument().grass.length>0&&getWorldDocument().grassBakes.length===0)
    queueGrassStrokes(getWorldDocument().grass);
  terrain.reloadEdits();
  authoredWater.sync();
  void authoredAssets.sync();
  renderInspector();renderObjectList();
  updateCameraTarget(0,0);
  selectTool('select');
}
void boot();

let disposed=false;
engine.runRenderLoop(()=>{
  if(disposed)return;
  const dt=Math.min(engine.getDeltaTime()/1000,.055);
  pan(dt);
  const focus=camera.getTarget();
  const x=focus.x,z=focus.z;
  const view=focus.subtract(camera.position);
  const terrainChanged=terrain.update(x,z,view.x,view.z);
  const center=`${Math.floor(x/MAINLAND.chunkSize)}:${Math.floor(z/MAINLAND.chunkSize)}`;
  if(terrainChanged||center!==lastCenter){
    lastCenter=center;
    const cells=terrain.activeCells;
    vegetation.setActiveChunks(cells,x,z);
    props.setActiveChunks(cells,x,z);
    geography.setActiveChunks(cells,x,z);
  }
  if(activeTool==='module')refreshModuleGrid();
  grass.setFocus(x,z);
  if(grassOn)grass.update();
  if(vegetationOn)vegetation.update();
  props.update(dt);
  geography.update(dt);
  ocean.update(dt,new Vector3(x,0,z));
  authoredAssets.update(x,z);
  authoredWater.update(dt);
  axisGizmo.updateScale();
  // Do not change the canonical legacy water geometry while previews are loaded.
  // Water meshes use metadata, ocean surfaces have stable names.
  const nativeFallReplaced=getWorldDocument().water.some(w=>
    w.profile==='fall'&&w.joinToLegacyRiver===true);
  for(const mesh of scene.meshes){
    if(mesh.metadata?.inlandWater===true||mesh.name.startsWith('auralia-ocean-')){
      mesh.isVisible=legacyWaterOn&&!(nativeFallReplaced&&mesh.metadata?.waterfall===true);
    }
    if(mesh.metadata?.decorativeVegetation||mesh.metadata?.farVegetationProxy){
      if(!vegetationOn)mesh.isVisible=false;
    }
  }
  flushBrush(false);
  scene.render();
  if(performance.now()-lastStat>350){
    lastStat=performance.now();
    $('coords').textContent=`X ${Math.round(cursorX)} · Z ${Math.round(cursorZ)} · Foco ${Math.round(x)},${Math.round(z)}`;
    $('fps').textContent=`${Math.round(engine.getFps())} FPS`;
    const d=getWorldDocument();
    $('world-stats').textContent=`Terreno ${terrain.activeCount} chunks · Césped ${grass.instanceCount} · Assets ${d.assets.length} · Agua v4 ${authoredWater.count}`;
  }
});
window.addEventListener('resize',()=>engine.resize());
window.addEventListener('beforeunload',e=>{if(!changed)return;e.preventDefault();});
// The engine owns the renderloop until navigation; disposal is only needed if this page is embedded.
window.addEventListener('pagehide',()=>{
  disposed=true;
  engine.stopRenderLoop();
  axisGizmo.dispose();
  authoredAssets.dispose();authoredWater.dispose();props.dispose();vegetation.dispose();
  moduleGrid?.dispose(false,false);moduleOutline?.dispose(false,false);
  grass.dispose();geography.dispose();ocean.dispose();terrain.dispose();scene.dispose();engine.dispose();
});

// AURALIA_GRASS_STABILITY_V7: control de viento persistido en JSON.

// AURALIA_GRASS_WORLD_LOCK_V9: pintar activa la máscara persistente, nunca el modo natural implícito.
