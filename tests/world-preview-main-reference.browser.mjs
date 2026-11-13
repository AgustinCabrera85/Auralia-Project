// Reuse the existing reference fixture's in-memory save adapter. No player saves.
import './landscape-review.browser.mjs';
import { EngineInstrumentation, SceneInstrumentation } from '@babylonjs/core';
import { waterSurfaceAt } from '../src/world/geographicFeatures.ts';
const {world,height}=window.review,scene=world.scene,engine=world.engine;
// Eye-height reference cameras share the player's streaming position. The avatar
// must not occlude the lens; keep its transform and traversal simulation intact.
world.player.setEnabled(false);
engine.maxFPS=30;engine.setHardwareScalingLevel(1/.75);engine.resize();
const gpuTimer=new EngineInstrumentation(engine),cpuTimer=new SceneInstrumentation(scene);
gpuTimer.captureGPUFrameTime=true;cpuTimer.captureFrameTime=true;
const frames=[],cpu=[],gpu=[];let last=0,gpuCount=0,view='';
const views=[
  {id:'costa',x:-630,z:185,dx:1,dz:0,height:1.75},
  {id:'isla',x:350,z:-236,dx:0,dz:-1,height:1.75},
  {id:'ladera',x:-700,z:-1350,dx:-1,dz:0,height:1.75},
  {id:'vegetacion',x:0,z:10,dx:0,dz:-1,height:1.75},
  {id:'nacimiento',x:474,z:-1800,dx:0,dz:1,height:4},
  {id:'desembocadura',x:150,z:250,dx:0,dz:1,height:4}
];
scene.onAfterRenderObservable.add(()=>{
  const now=performance.now();if(last)frames.push(now-last);last=now;
  cpu.push(cpuTimer.frameTimeCounter.current);
  if(gpuTimer.gpuFrameTimeCounter.count!==gpuCount){gpuCount=gpuTimer.gpuFrameTimeCounter.count;gpu.push(gpuTimer.gpuFrameTimeCounter.current/1e6);}
  for(const list of [frames,cpu,gpu])if(list.length>300)list.shift();
});
const pct=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]:null;
window.mainReference={views,go(id){
  const p=views.find(v=>v.id===id);if(!p)throw new Error('Unknown reference view');
  window.review.place(p.x,p.z);const y=Math.max(height(p.x,p.z),waterSurfaceAt(p.x,p.z)?.level??-.15)+p.height;
  window.review.overview(p.x,p.z,y,p.x+p.dx*100,p.z+p.dz*100,y);
  frames.length=cpu.length=gpu.length=0;last=0;view=id;
},ready:()=>world.mainland.pendingCount===0&&scene.isReady(),snapshot(){
  const active=scene.getActiveMeshes(),visible=new Set(active.data.slice(0,active.length)),terrain={};
  for(const [lod,spacing]of [['near',6],['mid',18],['far',36]]){
    const meshes=scene.meshes.filter(m=>m.metadata?.terrainLod===lod),seen=meshes.filter(m=>visible.has(m));
    terrain[lod]={spacing,resident:meshes.length,visible:seen.length,vertices:meshes.reduce((s,m)=>s+m.getTotalVertices(),0),triangles:meshes.reduce((s,m)=>s+m.getTotalIndices()/3,0),visibleTriangles:seen.reduce((s,m)=>s+m.getTotalIndices()/3,0)};
  }
  return {mode:'main isolated reference',view,camera:scene.activeCamera.position.asArray(),cameraForward:scene.activeCamera.getForwardRay().direction.asArray(),eyeHeight:views.find(v=>v.id===view)?.height,avatarHidden:!world.player.isEnabled(),viewport:[engine.getRenderWidth(),engine.getRenderHeight()],samples:frames.length,gpuSamples:gpu.length,
    frameMs:{median:pct(frames,.5),p95:pct(frames,.95)},cpuRenderMs:{median:pct(cpu,.5),p95:pct(cpu,.95)},gpuMs:{median:pct(gpu,.5),p95:pct(gpu,.95)},jsHeapBytes:performance.memory?.usedJSHeapSize??null,graphics:engine.getGlInfo(),visibleSceneTriangles:scene.getActiveIndices()/3,terrain};
}};
