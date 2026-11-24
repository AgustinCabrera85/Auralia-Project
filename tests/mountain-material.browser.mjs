import {Color3,Color4,DirectionalLight,Engine,EngineInstrumentation,FreeCamera,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {TerrainStream} from '../src/world/TerrainStream.ts';
import {PlayableWorld} from '../src/world/geography/PlayableWorld.ts';
import {setActiveGeography} from '../src/world/geography/ActiveGeography.ts';

// Isolated production terrain/material. No game save, player, or time simulation.
const params=new URLSearchParams(location.search),night=params.has('night');
const x=Number(params.get('x')??-1182),z=Number(params.get('z')??-2691);
const engine=new Engine(document.querySelector('canvas'),false,{preserveDrawingBuffer:true});
engine.setHardwareScalingLevel(1);
const scene=new Scene(engine),status=document.querySelector('#status');
scene.clearColor=night?new Color4(.025,.04,.065,1):new Color4(.48,.64,.77,1);
scene.fogMode=Scene.FOGMODE_EXP2;scene.fogColor=night?new Color3(.035,.05,.075):new Color3(.57,.66,.72);scene.fogDensity=.00024;
const sun=new DirectionalLight('review-sun',new Vector3(-.6,-.8,.15),scene);sun.intensity=night?.08:1.35;
sun.diffuse=night?new Color3(.52,.65,.9):new Color3(1,.93,.81);
const camera=new FreeCamera('review-camera',Vector3.Zero(),scene);camera.minZ=.2;camera.maxZ=3500;camera.fov=1.05;
const instrumentation=new EngineInstrumentation(engine);instrumentation.captureGPUFrameTime=true;
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const percentile=(rows,p)=>[...rows].sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*p))]??null;
const frame=()=>new Promise(r=>requestAnimationFrame(r));
const render=()=>{engine._drawCalls.fetchNewFrame();engine.beginFrame();scene.render();engine.endFrame();};
try{
 const world=await PlayableWorld.load();setActiveGeography(world);await world.prepareAround(x,z);
 const y=world.surface.heightAt(x,z)+6;camera.position.set(x,y,z);
 camera.setTarget(new Vector3(x-1400,y+360,z-380));
 const terrain=new TerrainStream(scene,new TransformNode('mountain-review',scene),{},world);
 await terrain.prepareHorizon(x,z,frame);
 terrain.update(x,z,-.966,-.259);
 for(let i=0;i<4000&&terrain.pendingCount;i++){terrain.update(x,z,-.966,-.259);render();if(i%8===0)await frame();}
 const material=scene.getMaterialByName('auralia-biome-terrain');
 if(!material)throw Error('WebGL2 production material unavailable');
 // The full game binds a shadow map. This isolated scene has no casters, but
 // WebGL still requires a 2D binding distinct from the albedo texture array.
 material.setTexture('characterShadowMap',scene.textures.find(t=>t.name.includes('caustics-refractive')));
 for(let i=0;i<1800&&material.metadata.biomeMaterials.status==='loading';i++){render();await frame();}
 if(material.metadata.biomeMaterials.status!=='ready')throw Error('Terrain textures failed to load');
 await scene.whenReadyAsync();
 while(engine._gl.getError()!==engine._gl.NO_ERROR){} // discard startup draws before the fixture's shadow binding
 const shaderErrors=()=>scene.meshes.map(m=>m.subMeshes?.[0]?.effect?.getCompilationError?.()||m.material?.getEffect()?.getCompilationError()).filter(Boolean);
 for(let i=0;i<60;i++){render();await frame();}
 const cpu=[],gpu=[];let previousGpu=instrumentation.gpuFrameTimeCounter.count;
 for(let i=0;i<180;i++){
  const start=performance.now();render();cpu.push(performance.now()-start);await frame();
  const counter=instrumentation.gpuFrameTimeCounter;
  if(counter.count>previousGpu&&counter.current>0){gpu.push(counter.current/1e6);previousGpu=counter.count;}
 }
 const pixels=await engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight()),colors=new Set();
 for(let i=0;i<pixels.length;i+=256)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
 const result={night,position:[x,y,z],viewport:[engine.getRenderWidth(),engine.getRenderHeight()],
  graphics:engine.getGlInfo(),cpuMs:{median:percentile(cpu,.5),p95:percentile(cpu,.95)},
  gpuMs:{samples:gpu.length,median:percentile(gpu,.5),p95:percentile(gpu,.95)},
  triangles:scene.getActiveIndices()/3,drawCalls:engine._drawCalls.current,
  textureBytes:material.metadata.biomeMaterials.gpuBytes,errors:[...errors,...shaderErrors()],glError:engine._gl.getError(),pending:terrain.pendingCount,
  sampledColors:colors.size,direction:camera.getForwardRay().direction.asArray(),target:camera.getTarget().asArray()};
 status.textContent=`Sierras · ${night?'noche':'día'} · material verificado`;
 window.mountainReview={result,scene,engine,terrain,world};
 engine.runRenderLoop(()=>scene.render());document.body.dataset.ready='true';
}catch(error){status.textContent=String(error);window.mountainFailure=String(error);document.body.dataset.ready='error';}
