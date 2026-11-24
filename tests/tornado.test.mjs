import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const runtime=resolve('.test-build/tornado-runtime');mkdirSync(runtime,{recursive:true});
for(const name of ['ClimateModel','TornadoSchedule','RareTornadoes']){
 const source=readFileSync(`src/world/climate/${name}.ts`,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replaceAll("'./ClimateModel'","'./ClimateModel.mjs'").replaceAll("'./TornadoSchedule'","'./TornadoSchedule.mjs'");
 writeFileSync(resolve(runtime,name+'.mjs'),js);
}
const {sampleClimate}=await import(pathToFileURL(resolve(runtime,'ClimateModel.mjs')));
const {tornadoWindow,tornadoBiome,TORNADO_RULES}=await import(pathToFileURL(resolve(runtime,'TornadoSchedule.mjs')));
const {RareTornadoes}=await import(pathToFileURL(resolve(runtime,'RareTornadoes.mjs')));
const windows=new Map();
for(let i=0;i<24*120*20;i++){
 const frame=sampleClimate(i/20),window=tornadoWindow(frame);
 assert.deepEqual(tornadoWindow(frame),window,'schedule stable across reloads');
 if(window){windows.set(window.slot,frame);assert.ok(window.remaining<=75&&window.remaining>8);}
}
assert.ok(windows.size>3&&windows.size<120*.4,`rare weather opportunities: ${windows.size}/120 days`);
const frame=[...windows.values()][0],window=tornadoWindow(frame);
assert.equal(tornadoWindow({...frame,weatherMix:sampleClimate(12,'clear').weatherMix}),null);
assert.equal(tornadoWindow({...frame,weatherMix:sampleClimate(12,'snow').weatherMix}),null);
const habitat={height:40,waterLevel:0,desert:0,valley:.7,coast:0,mountain:0,trees:.2,protected:false,roadClearance:100};
assert.equal(tornadoBiome(habitat),'plains');assert.equal(tornadoBiome({...habitat,desert:.8,trees:0}),'desert');
assert.equal(tornadoBiome({...habitat,height:460,desert:1,mountain:.6}),'desert','high desert plateaus use slope, not altitude');
for(const patch of [{protected:true},{height:1},{roadClearance:20},{trees:1},{coast:.3},{mountain:.4}])
 assert.equal(tornadoBiome({...habitat,...patch}),null,JSON.stringify(patch));
const ground={height:0,slopeX:0,slopeZ:0,biome:'plains'},player={x:0,y:0,z:0},camera={};
function fake(){return {active:false,disposed:false,paused:false,plays:0,ticks:0,
 play(o){this.active=true;this.plays++;this.duration=o.duration;return true;},setSize(){},
 setPosition(p){this.position={...p};},setGroundNormal(){},setLighting(){},setLOD(){},setPaused(p){this.paused=p;},
 stop(){this.active=false;},reset(){this.active=false;},update(dt){if(!this.paused)this.ticks+=dt;},
 getStats(){return {active:this.active,ready:true};},dispose(){this.disposed=true;}};}
let loads=0,probes=0,valid=true;const fx=fake();
const system=new RareTornadoes({},()=>{probes++;return valid?ground:null;},async()=>{loads++;return fx;});
const tick=(f=frame,paused=false,enabled=true)=>system.update(.1,f,player,camera,enabled,paused);
for(let i=0;i<200;i++)tick(sampleClimate(12,'clear'));
assert.equal(loads,0);assert.equal(probes,0,'idle weather does no terrain work');
tick();await new Promise(r=>setTimeout(r,0));tick();assert.equal(fx.plays,1);assert.equal(loads,1);
assert.ok(Math.hypot(fx.position.x,fx.position.z)>=120&&Math.hypot(fx.position.x,fx.position.z)<=220);
assert.equal(fx.duration,window.remaining,'late arrival uses only remaining event time');
const position={...fx.position},ticks=fx.ticks;
for(let i=0;i<30;i++)tick(frame,true);
assert.deepEqual(fx.position,position);assert.equal(fx.ticks,ticks,'pause freezes animation and travel');
for(let i=0;i<8;i++)tick();assert.ok(Math.hypot(fx.position.x-position.x,fx.position.z-position.z)>.1);
valid=false;for(let i=0;i<8;i++)tick();assert.equal(fx.active,false,'fade when route loses support');
system.reset();tick();assert.equal(fx.plays,1,'travel cannot restart same event');
valid=true;
const next=[...windows.values()].find(f=>f.elapsedHours>window.endHour+TORNADO_RULES.cooldownHours);
tick(next);assert.equal(fx.plays,2);assert.equal(loads,1,'reuse loaded effect');
tick(next,false,false);assert.equal(fx.active,false,'interior removes event');
system.dispose();assert.equal(fx.disposed,true);

// A travel or dispose while the atlas loads must never spawn in the next scene.
for(const dispose of [false,true]){
 let resolveLoad;const late=fake();const pending=new RareTornadoes({},()=>ground,()=>new Promise(r=>{resolveLoad=r;}));
 pending.update(.1,frame,player,camera,true,false);dispose?pending.dispose():pending.reset();
 resolveLoad(late);await new Promise(r=>setTimeout(r,0));
 pending.update(.1,frame,player,camera,true,false);assert.equal(late.plays,0);
 if(dispose)assert.equal(late.disposed,true);else pending.dispose();
}
for(const bad of [null,{...ground,slopeX:.4}]){
 const invalidFx=fake(),invalid=new RareTornadoes({},()=>bad,async()=>invalidFx);
 invalid.update(.1,frame,player,camera,true,false);await new Promise(r=>setTimeout(r,0));
 invalid.update(.1,frame,player,camera,true,false);assert.equal(invalidFx.plays,0);invalid.dispose();
}
console.log(`Tornado: ${windows.size} opportunities/120 game days; biome, pause, drift, cooldown, cache and travel lifecycle passed.`);
