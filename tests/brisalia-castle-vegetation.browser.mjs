import './brisalia-ivy.browser.mjs';
import { Matrix, Ray, Vector3 } from '@babylonjs/core';
import { VegetationSystem } from '../src/world/VegetationSystem.ts';
import { castleBorderCandidates, castleExteriorDistance, castlePlantsForChunk } from '../src/world/BrisaliaCastlePlanting.ts';
import { BRISALIA_BUILDINGS, BRISALIA_SCALE } from '../src/world/brisaliaLayout.ts';
import { chunkOf } from '../src/world/terrainData.ts';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
const {scene,village,camera,setSeason}=window.ivyReview;
const castle=village.buildings.get('B28'),definition=BRISALIA_BUILDINGS.find(b=>b.id==='B28');
const source=castleBorderCandidates(),exclusions=BRISALIA_BUILDINGS.map(b=>({
  x:b.x,z:b.z+b.footprintOffsetZ,radius:Math.hypot(b.width,b.depth)/2+2,buildingId:b.id}));
const chunks=new Map(),placements=[];
for(let z=-7;z<=-1;z++)for(let x=2;x<=7;x++){
  const values=castlePlantsForChunk(x,z,{x:0,z:0},exclusions,()=>0);
  chunks.set(`${x}:${z}`,values);placements.push(...values);
}
check(placements.length>350&&placements.length<1100,`Bounded planted border: ${placements.length}`);
check(new Set(placements.map(p=>`${p.x}:${p.z}`)).size===placements.length,'No duplicate plants across chunks');
check(placements.length===source.length,'Castle tree-clearance mask does not erase the planted border');
const sides={left:0,right:0,front:0,rear:0},species={};
let maxRootDistance=0,maxStoneDistance=0;
const stoneMeshes=new Set(castle.meshes),castleMatrix=castle.root.getWorldMatrix();
for(const p of placements){
  // B28's authored yaw is 180 degrees.
  const x=(definition.x-p.x)/BRISALIA_SCALE,z=(definition.z-p.z)/BRISALIA_SCALE;
  const radius=(p.kind==='brisaliaMatorral'?.52:.45)*p.scale;
  const rootDistance=castleExteriorDistance(x,z)*BRISALIA_SCALE;
  check(rootDistance>.1&&rootDistance<=radius*.51,'Roots outside, foliage touching the wall');
  maxRootDistance=Math.max(maxRootDistance,rootDistance);
  // Check the real castle geometry as well as the placement outline.
  const nx=castleExteriorDistance(x+.001,z)-castleExteriorDistance(x-.001,z);
  const nz=castleExteriorDistance(x,z+.001)-castleExteriorDistance(x,z-.001);
  const direction=Vector3.TransformNormal(new Vector3(-nx,0,-nz).normalize(),castleMatrix).normalize();
  const origin=Vector3.TransformCoordinates(new Vector3(p.x,.45,p.z),village.parent.getWorldMatrix());
  const hit=scene.pickWithRay(new Ray(origin,direction,2),m=>stoneMeshes.has(m));
  check(hit?.hit&&hit.distance<.85,`Plants meet actual masonry: ${hit?.distance}`);
  maxStoneDistance=Math.max(maxStoneDistance,hit.distance);
  check(!(z<-24&&Math.abs(x)<8.8),'Entrance and steps remain clear');
  check(Math.abs(p.y+.035)<1e-8,'Roots meet the terrain');
  check(!p.obstacleRadius,'Decorative plants do not block traversal');
  if(x<-30)sides.left++;if(x>30)sides.right++;if(z<-26)sides.front++;if(z>26)sides.rear++;
  species[p.kind]=(species[p.kind]??0)+1;
}
check(Object.values(sides).every(n=>n>60),`All exterior sides planted: ${JSON.stringify(sides)}`);
const blocked=placements[0],cell=chunkOf(blocked.x,blocked.z);
const clear=castlePlantsForChunk(cell.cx,cell.cz,{x:0,z:0},[...exclusions,{x:blocked.x,z:blocked.z,radius:4}],()=>0);
check(clear.every(p=>Math.hypot(p.x-blocked.x,p.z-blocked.z)>4),'Player structures override decorative planting');
check(castlePlantsForChunk(cell.cx,cell.cz,{x:0,z:0},[],(x,z)=>x*2+z).length===0,'Reject unsupported steep terrain');
const shifted=castlePlantsForChunk(cell.cx+1,cell.cz-1,{x:72,z:-72},exclusions.map(e=>({...e,x:e.x+72,z:e.z-72})),()=>10);
const original=chunks.get(`${cell.cx}:${cell.cz}`);
check(shifted.length===original.length&&shifted.every((p,i)=>Math.abs(p.x-original[i].x-72)<1e-7&&Math.abs(p.z-original[i].z+72)<1e-7&&Math.abs(p.y-9.965)<1e-7),'Town translation retains planting and ground support');

scene.getMeshByName('review-ground').position.y=0;
const plants=new VegetationSystem(scene,village.parent,()=>exclusions);
await plants.load();
// Use production buffers/LODs, with only the authored border in this isolated scene.
plants.chunks=chunks;
setSeason('summer');
const matrix=castle.root.getWorldMatrix();
const views={side:{target:[30.6,2.1,0],eye:[37,3.8,-14]},
  entrance:{target:[0,3,-27],eye:[4,5,-52]},rear:{target:[-28,3,26],eye:[-45,5,43]}};
function setView(name){
  const view=views[name];check(!!view,`Unknown view ${name}`);
  camera.setTarget(Vector3.TransformCoordinates(Vector3.FromArray(view.target),matrix));
  const eye=Vector3.TransformCoordinates(Vector3.FromArray(view.eye),matrix);camera.setPosition(eye);
  const local=Vector3.TransformCoordinates(eye,Matrix.Invert(village.parent.getWorldMatrix()));
  plants.visualFocus={x:local.x,z:local.z};plants.center=chunkOf(local.x,local.z);plants.refreshBuffers();
  document.getElementById('status').textContent='Brisalia · vegetación al pie del castillo';
}
setView('side');await scene.whenReadyAsync();scene.render();
check(plants.instanceCount>100,'Actual shared plant instances render at the castle');
window.castleGardenReview={ready:true,plants,setView,report:{placements:placements.length,species,sides,
  wallContact:'pass',maxRootDistance,maxStoneDistance,entranceClearance:'pass',terrainSupport:'pass',translatedTown:'pass',
  structureExclusion:'pass',visibleInstances:plants.instanceCount}};
