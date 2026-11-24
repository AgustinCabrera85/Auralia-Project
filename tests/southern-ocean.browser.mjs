import {Color3,Color4,DirectionalLight,Engine,EngineInstrumentation,FreeCamera,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {TerrainStream} from '../src/world/TerrainStream.ts';
import {PlayableWorld} from '../src/world/geography/PlayableWorld.ts';
import {setActiveGeography} from '../src/world/geography/ActiveGeography.ts';
import {OceanWater} from '../src/world/water/OceanWater.ts';
import {SpeedMotionBlur} from '../src/game/SpeedMotionBlur.ts';

// Production geography, ocean and underwater optics, with no save or gameplay.
const view=new URLSearchParams(location.search).get('view')??'shore';
const engine=new Engine(document.querySelector('canvas'),false,{preserveDrawingBuffer:true});
engine.setHardwareScalingLevel(1);
const scene=new Scene(engine),status=document.querySelector('#status');
scene.clearColor=new Color4(.53,.71,.86,1);scene.fogMode=Scene.FOGMODE_EXP2;
scene.fogColor=new Color3(.57,.71,.82);scene.fogDensity=.00017;
const sun=new DirectionalLight('south-sun',new Vector3(-.6,-.8,.15),scene);sun.intensity=1.35;sun.diffuse=new Color3(1,.96,.88);
const camera=new FreeCamera('south-camera',Vector3.Zero(),scene);camera.minZ=.15;camera.maxZ=6000;camera.fov=1.05;
const instrument=new EngineInstrumentation(engine);instrument.captureGPUFrameTime=true;
const frame=()=>new Promise(r=>requestAnimationFrame(r)),errors=[];
window.addEventListener('error',e=>errors.push(e.message));
try{
 const world=await PlayableWorld.load();setActiveGeography(world);
 const coast=view.startsWith('coast');
 const location=coast?(view==='coast-water'?[2074,4440]:[1704,4134]):view==='overview'?[0,4400]:view==='beach'?[1600,5430]:view==='underwater'?[1600,5280]:[786,4473];
 const [x,z]=location;await world.prepareAround(x,z);
 const y=view==='overview'?2200:view==='coast-water'?world.seaLevel+2.5:view==='underwater'?world.seaLevel-8:world.surface.heightAt(x,z)+4;
 camera.position.set(x,y,z);
 camera.setTarget(Vector3.FromArray(coast?(view==='coast-water'?[2300,3,4190]:view==='coast-sea'?[1700,1,4500]:[1450,3,3970]):view==='overview'?[0,0,5700]:view==='beach'?[700,1,5000]:view==='underwater'?[1600,-15,5420]:[600,6,5750]));
 const terrain=new TerrainStream(scene,new TransformNode('south-terrain',scene),{},world);
 await terrain.prepareHorizon(x,z,frame);
 const direction=camera.getForwardRay().direction;
 const material=scene.getMaterialByName('auralia-biome-terrain');
 material.setTexture('characterShadowMap',scene.textures.find(t=>t.name.includes('caustics-refractive')));
 const ocean=new OceanWater(scene),optics=new SpeedMotionBlur(camera,engine);
 const render=()=>{
   ocean.update(1/60,camera.position);optics.update(1/60,false);
   optics.updateWaterSurface(1/60,view==='underwater'||view==='coast-water'?world.seaLevel:null);
   engine._drawCalls.fetchNewFrame();engine.beginFrame();scene.render();engine.endFrame();
 };
 terrain.update(x,z,direction.x,direction.z);
 for(let i=0;i<4000&&terrain.pendingCount;i++){terrain.update(x,z,direction.x,direction.z);if(i%8===0){render();await frame();}}
 for(let i=0;i<1800&&(material.metadata.biomeMaterials.status==='loading'||ocean.pendingPatch);i++){render();await frame();}
 if(material.metadata.biomeMaterials.status!=='ready')throw Error('Terrain textures failed');
 await scene.whenReadyAsync();while(engine._gl.getError()!==engine._gl.NO_ERROR){}
 for(let i=0;i<60;i++){render();await frame();}
 const cpu=[],gpu=[];let previous=instrument.gpuFrameTimeCounter.count;
 for(let i=0;i<120;i++){
   const start=performance.now();render();cpu.push(performance.now()-start);await frame();
   const c=instrument.gpuFrameTimeCounter;if(c.count>previous&&c.current>0){gpu.push(c.current/1e6);previous=c.count;}
 }
 const percentile=(rows,p)=>[...rows].sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*p))]??null;
 const pixels=await engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight()),colors=new Set();
 for(let i=0;i<pixels.length;i+=256)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
 const shaderErrors=scene.meshes.flatMap(m=>m.subMeshes??[]).map(s=>s.effect?.getCompilationError?.()).filter(Boolean);
 const result={view,eye:camera.position.asArray(),bed:world.surface.heightAt(x,z),seaLevel:world.seaLevel,
   cpu:{median:percentile(cpu,.5),p95:percentile(cpu,.95)},gpu:{samples:gpu.length,median:percentile(gpu,.5),p95:percentile(gpu,.95)},
   triangles:scene.getActiveIndices()/3,drawCalls:engine._drawCalls.current,errors:[...errors,...shaderErrors],glError:engine._gl.getError(),pending:terrain.pendingCount,
   sampledColors:colors.size,residentTiles:world.stats.residentTiles};
 window.oceanReview={result,world,terrain,ocean,optics,scene,engine};status.textContent=`Islas del sur · ${view}`;
 document.body.dataset.ready='true';engine.runRenderLoop(render);
}catch(error){status.textContent=String(error);window.oceanFailure=String(error);document.body.dataset.ready='error';}
