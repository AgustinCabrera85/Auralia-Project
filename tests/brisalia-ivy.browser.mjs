import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix,
  MeshBuilder, PBRMaterial, Ray, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { BrisaliaVillage } from '../src/world/BrisaliaVillage.ts';
import { BRISALIA_BUILDINGS, BRISALIA_SCALE } from '../src/world/brisaliaLayout.ts';
import { EnvironmentSystem } from '../src/world/climate/EnvironmentSystem.ts';
import { DAYS_PER_SEASON, SEASONS } from '../src/world/climate/ClimateModel.ts';
import { getSeasonalIvyState, IVY_SEASONS } from '../src/world/materials/SeasonalIvyMaterial.ts';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
const engine=new Engine(document.getElementById('view'),true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.65,.76,.83,1);
scene.metadata={bakeIvy:new URLSearchParams(location.search).has('bakeIvy')};
const camera=new ArcRotateCamera('review',.3,1.24,185,Vector3.Zero(),scene);
camera.minZ=.1;camera.maxZ=4000;camera.attachControl();
const sun=new DirectionalLight('sun',new Vector3(-1,-2,-1),scene);sun.intensity=2;
const hemi=new HemisphericLight('hemi',Vector3.Up(),scene);hemi.intensity=.9;
const environment=new EnvironmentSystem(scene,camera,sun,hemi,9);
const ground=MeshBuilder.CreateGround('review-ground',{width:1600,height:1600},scene);
const groundMaterial=new StandardMaterial('review-ground',scene);groundMaterial.diffuseColor=new Color3(.24,.31,.16);ground.material=groundMaterial;ground.position.y=-4;
const parent=new TransformNode('village',scene);
// A nonzero parent translation verifies that projection follows world placement.
parent.position.set(12,0,-9);
const village=new BrisaliaVillage(scene,parent,{x:0,z:0},()=>0);
const castle=BRISALIA_BUILDINGS.find(b=>b.id==='B28');
camera.setTarget(new Vector3(castle.x+12,26,castle.z-9));
// setTarget preserves the old eye position; move the review into the detail LOD.
camera.alpha=.3;camera.beta=1.24;camera.radius=185;
engine.runRenderLoop(()=>scene.render());
window.addEventListener('resize',()=>engine.resize());
function setSeason(season){
  environment.forcedWeather='clear';
  environment.setElapsedHours(SEASONS.indexOf(season)*DAYS_PER_SEASON*24+9);
  // Keep review lighting fixed; only the material season changes in comparisons.
  sun.direction.set(-.7,-1,-.45);sun.intensity=2;sun.diffuse.set(1,.95,.87);hemi.intensity=.9;
  scene.fogDensity=0;
  document.getElementById('status').textContent=`Castillo de Brisalia · ${season}`;
}
window.ivyReview={scene,village,environment,camera,setSeason,ready:false};
await village.ready;
check(village.errors.length===0,JSON.stringify(village.errors));
const placed=village.buildings.get('B28');
const ivyVolume=village.castleIvy.volume;
check(ivyVolume.meshes.length===24,'Eight surfaces, fine wood and two leaf layers');
check(ivyVolume.stats.patches>20000&&ivyVolume.stats.patches<42000,'Dense bounded foliage in two layers');
check(ivyVolume.stats.roots>400&&ivyVolume.stats.twigs>16000,'Dense main stems and secondary twigs');
check(ivyVolume.stats.maxStemRadius<.016,'Fine stems rather than thick poles');
check(ivyVolume.stats.triangles<700000,'Bounded decorative triangle budget');
check(scene.metadata.bakeIvy||ivyVolume.stats.attachmentCacheUsed,'Uses the validated stone attachment cache');
check(ivyVolume.meshes.every(m=>!m.isPickable&&!m.checkCollisions),'Decorative volume does not obstruct movement or picking');
let minLayerGap=Infinity,minWoodClearance=Infinity,maxWallLeafDistance=0;
for(const inner of ivyVolume.meshes.filter(m=>m.metadata.ivyLayer===0)){
  const domain=inner.name.split('leaves:0:')[1];
  const outer=ivyVolume.meshes.find(m=>m.name.endsWith(`leaves:1:${domain}`));
  const wood=ivyVolume.meshes.find(m=>m.name.endsWith(`wood:${domain}`));
  const a=inner.getVerticesData('position'),b=outer.getVerticesData('position'),normals=inner.getVerticesData('normal');
  const w=wood.getVerticesData('position'),wall=domain.startsWith('wall:');
  const [,cx,cz]=domain.split(':').map(Number);
  const depth=(x,z)=>wall?Math.abs(x):Math.hypot(x-cx,z-cz);
  const envelope=new Map();
  for(let k=0;k<w.length;k+=3){const bin=Math.floor(w[k+1]/.1);envelope.set(bin,Math.max(envelope.get(bin)??0,depth(w[k],w[k+2])));}
  for(let i=0;i<a.length;i+=18){
    const n=Vector3.FromArray(normals,i+6);
    let back=-Infinity,front=Infinity,minY=Infinity,maxY=-Infinity,leafDepth=Infinity;
    for(let j=0;j<18;j+=3){
      back=Math.max(back,Vector3.Dot(Vector3.FromArray(a,i+j),n));
      front=Math.min(front,Vector3.Dot(Vector3.FromArray(b,i+j),n));
      minY=Math.min(minY,a[i+j+1]);maxY=Math.max(maxY,a[i+j+1]);
      leafDepth=Math.min(leafDepth,depth(a[i+j],a[i+j+2]));
    }
    minLayerGap=Math.min(minLayerGap,front-back);
    let branchDepth=0;
    for(let bin=Math.floor(minY/.1);bin<=Math.floor(maxY/.1);bin++)branchDepth=Math.max(branchDepth,envelope.get(bin)??0);
    minWoodClearance=Math.min(minWoodClearance,leafDepth-branchDepth);
    // The lower curtain has no projecting coping. Both layers must stay close
    // to its actual source plane, including the folds and card edges.
    if(wall&&minY>1&&maxY<12)for(let j=0;j<18;j+=3){
      maxWallLeafDistance=Math.max(maxWallLeafDistance,Math.abs(a[i+j])-30.48,Math.abs(b[i+j])-30.48);
    }
  }
  check(inner.material.albedoTexture.url.endsWith('Auralia_Leaf_green_mid_512.png'),'Same leaf atlas as the V4 trees');
}
check(minLayerGap>.025,`Separated leaf layers with room for flutter: ${minLayerGap}`);
check(minWoodClearance>.015,`Leaves in front of all branches: ${minWoodClearance}`);
check(maxWallLeafDistance<.10,`Ivy hugs the wall: ${maxWallLeafDistance}`);
const allMaterials=meshes=>[...new Set(meshes.flatMap(m=>m.material?.subMaterials??[m.material]).filter(Boolean))];
const materials=allMaterials(placed.meshes);
const ivyMaterials=materials.filter(m=>m.pluginManager?.getPlugin('AuraliaSeasonalIvy'));
check(ivyMaterials.length>=2,'Wall and tower ivy materials loaded after batching');
check(ivyMaterials.every(m=>m instanceof PBRMaterial&&m.bumpTexture&&m.metallicTexture),'Original stone normal and roughness retained');
check([...village.buildings].filter(([id])=>id!=='B28').every(([,b])=>allMaterials(b.meshes).every(m=>!m.pluginManager?.getPlugin('AuraliaSeasonalIvy'))),'Other buildings unchanged');
let coverageProbes=0;
const probeDetails=[];
const castleMeshes=new Set(placed.meshes),matrix=placed.root.computeWorldMatrix(true);
function probe(point,direction,label){
  const ray=new Ray(Vector3.TransformCoordinates(point,matrix),
    Vector3.TransformNormal(direction,matrix).normalize(),12*BRISALIA_SCALE);
  const hit=scene.pickWithRay(ray,m=>castleMeshes.has(m));
  check(hit?.hit,`${label}: masonry hit`);
  const material=hit.pickedMesh.subMeshes[hit.subMeshId].getMaterial();
  check(!!material.pluginManager?.getPlugin('AuraliaSeasonalIvy'),`${label}: ivy material (${material.name})`);
  if(label==='side -1, 8, 0'||label==='side 1, 8, 0')probeDetails.push({label,
    point:Vector3.TransformCoordinates(hit.pickedPoint,Matrix.Invert(matrix)).asArray(),
    normal:Vector3.TransformNormal(hit.getNormal(true),Matrix.Invert(matrix)).normalize().asArray(),
    tower:material.pluginManager.getPlugin('AuraliaSeasonalIvy').tower});
  coverageProbes++;
}
for(const sign of [-1,1])for(const z of [-18,-9,0,9,18])for(const y of [1,4,8,12,13.3]){
  probe(new Vector3(sign*40,y,z),new Vector3(-sign,0,0),`side ${sign}, ${y}, ${z}`);
}
const towerCenters=[[-30,-26],[-30,26],[30,-26],[30,26],[-11.4,-27],[11.4,-27]];
for(const [x,z] of towerCenters)for(const y of [2,7,12,17,22])for(let i=0;i<8;i++){
  const dx=Math.cos(i*Math.PI/4),dz=Math.sin(i*Math.PI/4);
  // Gatehouse masonry occludes the inner half of each gate tower.
  if(Math.abs(x)<20&&(dz>-.1||dx*x<-.1))continue;
  probe(new Vector3(x+dx*8,y,z+dz*8),new Vector3(-dx,0,-dz),`tower ${x},${z}, ${y}, ${i}`);
}
for(const season of SEASONS){
  setSeason(season);
  scene.render();
  const leafMeshes=ivyVolume.meshes.filter(m=>m.metadata.ivyLeaves);
  check(season==='winter'?leafMeshes.every(m=>!m.isEnabled()):leafMeshes.some(m=>m.isEnabled()),`${season}: physical foliage follows calendar`);
  const state=getSeasonalIvyState(scene);
  for(const key of ['leaves','flowers','autumn'])check(state[key]===IVY_SEASONS[season][key],`${season}/${key} calendar state`);
}
// Late winter joins early spring continuously rather than popping on day 48.
environment.setElapsedHours(48*24-.001);const before={...getSeasonalIvyState(scene)};
environment.setElapsedHours(48*24);const after=getSeasonalIvyState(scene);
check(Math.abs(before.leaves-after.leaves)<.0001,'Year wrap is continuous');
setSeason('summer');
await scene.whenReadyAsync();
for(const mesh of ivyVolume.meshes)await mesh.material.forceCompilationAsync(mesh);
for(const mesh of placed.meshes){
  for(const sub of mesh.subMeshes??[]){
    const mat=sub.getMaterial();
    if(mat?.pluginManager?.getPlugin('AuraliaSeasonalIvy'))await mat.forceCompilationAsync(mesh);
  }
}
// A fixed masonry area, independent of camera distance, tolerates natural gaps
// and still catches a wall that has lost its foliage material.
scene.render();
const viewport=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
const visibleSide=Math.sign(Vector3.TransformCoordinates(camera.position,Matrix.Invert(matrix)).x);
let greenWallRegions=0;
for(const y of [4,8,12])for(const z of [-9,0,9]){
  const worldPoint=Vector3.TransformCoordinates(new Vector3(visibleSide*30.48,y,z),matrix);
  const pixel=Vector3.Project(worldPoint,Matrix.Identity(),scene.getTransformMatrix(),viewport);
  const top=Vector3.Project(Vector3.TransformCoordinates(new Vector3(visibleSide*30.48,y+.9,z),matrix),
    Matrix.Identity(),scene.getTransformMatrix(),viewport);
  const radius=Math.max(4,Math.ceil(Math.abs(top.y-pixel.y))),size=radius*2+1;
  const rgba=await engine.readPixels(Math.round(pixel.x)-radius,engine.getRenderHeight()-Math.round(pixel.y)-radius,size,size);
  let green=0;
  for(let i=0;i<rgba.length;i+=4)if(rgba[i+1]>rgba[i]*1.2&&rgba[i+1]>rgba[i+2]*1.2)green++;
  if(green>=size*size*.35)greenWallRegions++;
}
check(greenWallRegions>=7,`Summer ivy across the wall: ${greenWallRegions}/9 regions`);
window.ivyReview.report={ivyMaterials:ivyMaterials.map(m=>m.name),batches:placed.meshes.length,
  volume:{...ivyVolume.stats,meshes:ivyVolume.meshes.length,minLayerGap,minWoodClearance,maxWallLeafDistance},
  sourceMeshes:placed.sourceMeshes,scale:BRISALIA_SCALE,coverageProbes,greenWallRegions,probeDetails,
  seasons:SEASONS,calendar:'pass',shaderCompile:'pass'};
window.ivyReview.ready=true;
window.ivyReview.setView=name=>{
  const views={tower:{target:[30,9,-26],eye:[42,5,-40]},wall:{target:[30,7,0],eye:[45,7,0]},
    grazing:{target:[30.6,5,0],eye:[33,5,-8]}};
  const view=views[name];check(!!view,`Unknown review view ${name}`);
  camera.setTarget(Vector3.TransformCoordinates(Vector3.FromArray(view.target),matrix));
  camera.setPosition(Vector3.TransformCoordinates(Vector3.FromArray(view.eye),matrix));
};
