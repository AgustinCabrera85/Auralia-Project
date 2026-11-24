import {Color3,Color4,DirectionalLight,Engine,FreeCamera,HemisphericLight,MeshBuilder,Scene,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {AuthoredAssets} from '../src/world/editor/AuthoredAssets.ts';
import {emptyWorldDocument,setWorldDocument} from '../src/world/editor/WorldEditState.ts';
import {setActiveGeography} from '../src/world/geography/ActiveGeography.ts';
import {BRISALIA_CHERRIES,installBrisaliaCherryTrees} from '../src/world/BrisaliaCherryTrees.ts';
import {PlayableWorld} from '../src/world/geography/PlayableWorld.ts';
import {BrisaliaVillage} from '../src/world/BrisaliaVillage.ts';
import {BRISALIA_BUILDINGS} from '../src/world/brisaliaLayout.ts';
const engine=new Engine(document.querySelector('canvas'),true,{preserveDrawingBuffer:true});
const scene=new Scene(engine),errors=[];scene.clearColor=new Color4(.65,.77,.85,1);
const camera=new FreeCamera('cherries',new Vector3(0,18,-70),scene);camera.minZ=.1;camera.maxZ=3000;
camera.setTarget(new Vector3(0,7,0));camera.fov=.85;
const sun=new DirectionalLight('sun',new Vector3(-.6,-1,.4),scene);sun.intensity=1.6;
const hemi=new HemisphericLight('ambient',Vector3.Up(),scene);hemi.intensity=.75;
const ground=MeshBuilder.CreateGround('ground',{width:200,height:200},scene),mat=new StandardMaterial('ground',scene);
mat.diffuseColor=new Color3(.3,.4,.22);ground.material=mat;
window.addEventListener('error',e=>errors.push(e.message));
try{
 const view=new URLSearchParams(location.search).get('view'),city=view?.startsWith('city');let focus={x:0,z:0},planted=3;
 setWorldDocument(emptyWorldDocument());
 if(city){
  const world=await PlayableWorld.load();setActiveGeography(world);focus=world.town;
  planted=installBrisaliaCherryTrees(world,[{x:focus.x-29,z:focus.z+18,radius:28},
   ...BRISALIA_BUILDINGS.map(b=>({x:focus.x+b.x,z:focus.z+b.z+b.footprintOffsetZ,radius:Math.hypot(b.width,b.depth)/2+2,buildingId:b.id}))]);
  ground.dispose();const terrain=MeshBuilder.CreateGround('city-ground',{width:1700,height:1400,subdivisions:140,updatable:true},scene);
  const p=terrain.getVerticesData('position');for(let i=0;i<p.length;i+=3){p[i]+=focus.x;p[i+2]+=focus.z-100;p[i+1]=world.surface.heightAt(p[i],p[i+2]);}terrain.updateVerticesData('position',p);terrain.refreshBoundingInfo();terrain.material=mat;
  const y=world.surface.heightAt(focus.x,focus.z);
  if(view==='city-street'){camera.position.set(focus.x-160,y+17,focus.z+65);camera.setTarget(new Vector3(focus.x-140,y+9,focus.z-155));}
  else{camera.position.set(focus.x+180,y+300,focus.z+520);camera.setTarget(new Vector3(focus.x+40,y+6,focus.z-180));}
  const village=new BrisaliaVillage(scene,new TransformNode('city',scene),focus,(x,z)=>world.surface.heightAt(x,z));
  await village.ready;errors.push(...village.errors);
 }else{
  setActiveGeography({source:{id:'review',seaLevel:-10,heightAt:()=>0,meshSpacing:3},waterAt:()=>null});
  const doc=emptyWorldDocument();doc.assets=BRISALIA_CHERRIES.map((assetId,i)=>({id:`tree-${i}`,assetId,x:(i-1)*26,z:0,scale:1,yaw:.4,yOffset:0}));setWorldDocument(doc);
  if(view==='lod')focus={x:0,z:180};
 }
 const assets=new AuthoredAssets(scene,new TransformNode('trees',scene));await assets.sync(focus.x,focus.z);assets.update(focus.x,focus.z);
 const frame=()=>{assets.update(focus.x,focus.z);engine.beginFrame();scene.render();engine.endFrame();};
 frame();await scene.whenReadyAsync();for(let i=0;i<45;i++){frame();await new Promise(r=>requestAnimationFrame(r));}
 if(assets.errors.length)throw Error(assets.errors.join('\n'));
 if(engine._gl.getError())throw Error('WebGL error');
 window.biomeTreesReview={result:{planted,drawn:assets.drawnCount,errors},scene,camera,assets};
 document.querySelector('#status').textContent='Brisalia · rosado / blanco / tronco doble';document.body.dataset.ready='true';
}catch(e){document.body.dataset.ready='false';window.biomeTreesFailure=String(e);throw e;}
