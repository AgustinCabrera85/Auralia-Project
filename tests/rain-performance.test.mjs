import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,Ray} from '@babylonjs/core';
const dir=resolve('.test-build/rain-performance');mkdirSync(dir,{recursive:true});
for(const file of ['src/world/StaticVerticalIndex.ts','src/world/climate/RainAudio.ts','src/world/climate/Precipitation.ts']){
 const name=file.split('/').pop().replace('.ts','.mjs');
 writeFileSync(resolve(dir,name),ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'./RainFX.js'","'./RainFX.mjs'").replace("'./RainAudio'","'./RainAudio.mjs'"));
}
writeFileSync(resolve(dir,'RainFX.mjs'),readFileSync('src/world/climate/RainFX.js','utf8'));
const {RainFX}=await import(pathToFileURL(resolve(dir,'RainFX.mjs')));
const {StaticVerticalIndex}=await import(pathToFileURL(resolve(dir,'StaticVerticalIndex.mjs')));
const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('rain-test',new Vector3(0,3,0),scene);
camera.getViewMatrix(true);let queries=0;
const fx=new RainFX(scene,{quality:'medium',intensity:1,surfaceBudget:32,surfaceTimeBudgetMs:4,
 getSurfaceAt:(x,z)=>{queries++;return {height:x>=0&&x<=8&&z>=0&&z<=8?5:0,kind:'ground'};}});
const fill=()=>{for(let i=0;i<1000;i++){fx.update(1/60,camera);if(!fx._pending)return;}assert.fail('cache did not finish');};
fill();assert.equal(queries,65*65);
assert.equal(fx.getStats().drawCalls,2);
const initial=queries;
camera.position.x=4;camera.getViewMatrix(true);fill();
assert.equal(queries-initial,4*65,'4 m movement reuses 61 columns instead of resampling the entire map');
for(let i=0;i<fx._known.length;i++){
 const x=fx._frontOrigin.x+i%65,z=fx._frontOrigin.z+Math.floor(i/65);
 const h=-256+(fx._bytes[i*4]*256+fx._bytes[i*4+1])/65535*1024;
 assert.ok(Math.abs(h-(x>=0&&x<=8&&z>=0&&z<=8?5:0))<.016,'shift preserves exact receiver coordinates');
}
const stationary=queries;for(let i=0;i<120;i++)fx.update(1/60,camera);assert.equal(queries,stationary);
fx.invalidateSurfaces();fill();assert.equal(queries-stationary,65*65);
fx.setIntensity(0,.2);for(let i=0;i<30;i++)fx.update(1/60,camera);
const dry=queries,uploads=fx.getStats().surfaceUploads,clock=fx.clock;
for(let i=0;i<600;i++){camera.position.x+=1;camera.getViewMatrix(true);fx.update(1/60,camera);}
assert.equal(queries,dry);assert.equal(fx.getStats().surfaceUploads,uploads);assert.equal(fx.getStats().drawCalls,0);assert.equal(fx.clock,clock);
fx.setIntensity(1,0);fx.setPaused(true);fx.update(.1,camera);assert.equal(queries,dry);
fx.setPaused(false);fill();assert.equal(fx.getStats().drawCalls,2);
const counts=[scene.meshes.length,scene.materials.length,scene.textures.length];
for(let i=0;i<20;i++){fx.reset();fx.update(.1,camera);}
assert.deepEqual([scene.meshes.length,scene.materials.length,scene.textures.length],counts);
fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.textures.length,0);
let slowCalls=0;
const slow=new RainFX(scene,{intensity:1,surfaceBudget:128,surfaceTimeBudgetMs:.5,getSurfaceAt:()=>{
 slowCalls++;const end=performance.now()+1;while(performance.now()<end){}return 0;
}});
slow.update(.016,camera);assert.ok(slowCalls<=1,'soft time budget stops after one expensive indivisible query');slow.dispose();
let loaded=false;
const loading=new RainFX(scene,{intensity:1,surfaceBudget:4096,surfaceTimeBudgetMs:4,getSurfaceAt:()=>loaded?3:null});
for(let i=0;i<100;i++)loading.update(.1,camera);
loaded=true;for(let i=0;i<100;i++)loading.update(.1,camera);
assert.ok(loading._bytes[3]===255,'unloaded cells retry without invalidating valid surroundings');loading.dispose();

// Same triangles and transforms as Babylon, including reversed GLB scale.
const ground=MeshBuilder.CreateGround('roof',{width:40,height:40,subdivisions:100},scene);
ground.position.set(-886,12,1756);ground.rotation.set(.16,.53,-.09);ground.scaling.z=-1.3;
ground.computeWorldMatrix(true);const startBuild=performance.now(),index=new StaticVerticalIndex(ground),buildMs=performance.now()-startBuild;
const rays=Array.from({length:80},(_,i)=>new Ray(new Vector3(-904+(i%10)*3.8,50,1737+Math.floor(i/10)*4.8),new Vector3(0,-1,0),100));
let started=performance.now();const old=rays.map(ray=>ray.intersectsMesh(ground,false));const oldMs=performance.now()-started;
started=performance.now();const hits=rays.map(ray=>index.hit(ray.origin.x,ray.origin.z,ray.origin.y,ray.length));const indexMs=performance.now()-started;
for(let i=0;i<rays.length;i++){
 assert.equal(!!hits[i],old[i].hit);if(!hits[i])continue;
 assert.ok(Math.abs(hits[i].height-old[i].pickedPoint.y)<.0005);
 assert.ok(Math.abs(hits[i].normalY-Math.abs(old[i].getNormal(true).y))<.0005);
 assert.ok(Math.abs(index.hit(rays[i].origin.x,rays[i].origin.z,-40,100,true).height-hits[i].height)<.0005);
 assert.equal(index.hit(rays[i].origin.x,rays[i].origin.z,50,1),null);
}
console.log(JSON.stringify({cacheMove:{before:4225,after:260,reductionPercent:93.85},dry:{queries:0,uploads:0,drawCalls:0},vertical80Rays:{oldMs,indexMs,buildMs}}));
scene.dispose();engine.dispose();

const handlers=new Map();globalThis.window={addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
let contexts=0,automation=0,suspends=0;
class AudioContextMock {
 constructor(){contexts++;this.state='suspended';this.sampleRate=8000;this.currentTime=0;this.destination={};}
 createBuffer(){return {getChannelData:()=>new Float32Array(24000)};}
 createBufferSource(){return {connect(node){return node;},start(){},stop(){}};}
 createBiquadFilter(){return {type:'',frequency:{value:0},connect(node){return node;}};}
 createGain(){return {gain:{value:0,cancelScheduledValues(){},setTargetAtTime(){automation++;}},connect(node){return node;}};}
 async resume(){this.state='running';}async suspend(){this.state='suspended';suspends++;}async close(){}
}
globalThis.AudioContext=AudioContextMock;
const {RainAudio}=await import(pathToFileURL(resolve(dir,'RainAudio.mjs')));
const audio=new RainAudio();handlers.get('keydown')();for(let i=0;i<600;i++)audio.update(0,false);assert.equal(contexts,0);
audio.update(1,false);for(let i=0;i<600;i++)audio.update(1,false);assert.equal(contexts,1);assert.equal(automation,1);
audio.update(0,false);await new Promise(resolve=>setTimeout(resolve,400));assert.equal(suspends,1);
for(let i=0;i<600;i++)audio.update(0,false);assert.equal(automation,2);
audio.update(1,false);assert.equal(contexts,1);audio.dispose();assert.equal(handlers.size,0);
// Exercise the real climate adapter: the final blend is smaller than its old
// target-change deadband, but must not keep an invisible rain field alive.
globalThis.OffscreenCanvas=class {constructor(w,h){this.width=w;this.height=h;}getContext(){return {clearRect(){},beginPath(){},arc(){},fill(){}};}};
const {Precipitation}=await import(pathToFileURL(resolve(dir,'Precipitation.mjs')));
const climateEngine=new NullEngine(),climateScene=new Scene(climateEngine),climateCamera=new FreeCamera('climate',new Vector3(0,3,0),climateScene);
climateCamera.getViewMatrix(true);const precipitation=new Precipitation(climateScene,climateCamera);let climateQueries=0;
precipitation.configureRain(()=>{climateQueries++;return {height:0};},'medium');
for(const rain of [1,.005,.0008,0])for(let i=0;i<100;i++)precipitation.update({weatherMix:{rain,snow:0},dayLight:1},false,.1);
assert.equal(precipitation.rainStats.intensity,0);assert.equal(precipitation.rainStats.drawCalls,0);
const dryQueries=climateQueries;
for(let i=0;i<120;i++){climateCamera.position.x+=.5;climateCamera.getViewMatrix(true);precipitation.update({weatherMix:{rain:0,snow:0},dayLight:1},false,1/60);}
assert.equal(climateQueries,dryQueries);precipitation.dispose();climateScene.dispose();climateEngine.dispose();
console.log('OK rain cache, dry idle, time budget, loaded receivers, pool, exact building rays and audio sleep');
