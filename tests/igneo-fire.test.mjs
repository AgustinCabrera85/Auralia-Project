import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
const dir=resolve('.test-build/igneo-fire');mkdirSync(dir,{recursive:true});
for(const name of ['types','catalog','conditions','forestRoots','progress','AbilityManager','igneoFire']){
 const code=ts.transpileModule(readFileSync(`src/domain/abilities/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
 writeFileSync(resolve(dir,name+'.mjs'),code);
}
writeFileSync(resolve(dir,'FlameSurfaceAdapter.mjs'),ts.transpileModule(readFileSync('src/game/abilities/FlameSurfaceAdapter.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
writeFileSync(resolve(dir,'FlameJetFX.mjs'),readFileSync('src/game/abilities/FlameJetFX.js','utf8'));
const imp=name=>import(pathToFileURL(resolve(dir,name+'.mjs')));
const {AbilityManager}=await imp('AbilityManager'),{ABILITIES}=await imp('catalog'),{AbilityTargets}=await imp('forestRoots');
const {IgneoFireBehavior}=await imp('igneoFire'),{normalizeAbilityProgress}=await imp('progress');
const {FlameSurfaceAdapter}=await imp('FlameSurfaceAdapter'),{FlameJetFX}=await imp('FlameJetFX');
const fire=ABILITIES.find(d=>d.id==='igneo_fire');
assert.equal(normalizeAbilityProgress(null,{inventory:{sword:0,fireCrystal:99},discoveredPlaces:[]}).unlocked.includes('igneo_fire'),false);
assert.equal(normalizeAbilityProgress(null,{inventory:{sword:0},discoveredPlaces:['reino-igneo-cristal']}).selected,'igneo_fire');
function run(dt,interrupt=false){
 const context={unlocked:[],swordLevel:4,levels:{},equipment:'unarmed',playerState:'grounded',position:{x:0,y:0,z:0},scope:'test',blocked:null,actionBusy:false,facts:{}};
 const hits=[],targets=new AbilityTargets(),world={emitter:()=>({origin:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}}),trace:()=>null};
 for(const [id,x,y,z] of [['front',0,1.5,4],['behind',0,1.5,-2],['side',4,1.5,2],['high',0,5,2]])
  targets.register({id,position:{x,y,z},radius:.25,valid:()=>true,receive:h=>hits.push({id,...h})});
 const manager=new AbilityManager(ABILITIES,()=>context,{prepare(){},ready:()=>({ok:true}),start:()=>true,fx(){},update(){},end(){},dispose(){}});
 manager.register('igneo_fire',new IgneoFireBehavior(world,targets));
 assert.equal(manager.request('igneo_fire').ok,false);context.unlocked=['igneo_fire'];
 context.playerState='swimming';assert.equal(manager.request('igneo_fire').ok,false);context.playerState='grounded';
 assert.equal(manager.request('igneo_fire').ok,true);assert.equal(manager.execution.profile.level,1,'sword level never upgrades fire');
 manager.update(.2);manager.update(1,true);assert.equal(manager.execution.elapsed,.2);
 if(interrupt){manager.cancel();assert.equal(manager.status('igneo_fire').cooldown,0);assert.equal(hits.length,0);return;}
 while(manager.execution)manager.update(dt);
 assert.ok(hits.every(h=>h.id==='front'));assert.equal(manager.status('igneo_fire').cooldown,5);
 assert.equal(manager.request('igneo_fire').ok,false);manager.update(5);assert.equal(manager.request('igneo_fire').ok,true);
 manager.update(.5);context.scope='travel';manager.update(.1);assert.equal(manager.execution,null);
 return hits.reduce((n,h)=>n+h.damage,0);
}
assert.equal(run(1/30),run(1/144));run(1/60,true);
// Central wall truncates visuals; per-target LOS also blocks off-axis hits.
const targets=new AbilityTargets();let damage=0;
targets.register({id:'wall-back',position:{x:0,y:1.5,z:4},radius:.3,valid:()=>true,receive:()=>damage++});
const behavior=new IgneoFireBehavior({emitter:()=>({origin:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}}),trace:()=>({distance:2})},targets);
behavior.impact({definition:fire,profile:fire.profiles[0],timeline:fire.timeline,hits:new Set(),id:'test'},4);assert.equal(damage,0);
let wallCalls=0;
const adapter=new FlameSurfaceAdapter(()=>({wall:(x,y,z,dx,dz,reach)=>{wallCalls++;return reach>=2?{distance:2,normalX:0,normalY:0,normalZ:-1}:null;},ground:()=>null,headroom:()=>true,waterLevel:()=>null}),()=>({x:100,y:20,z:-80}));
assert.equal(adapter.trace({x:100,y:22,z:-80},{x:0,y:0,z:1},5.8).distance,2);assert.equal(wallCalls,1);
const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('view',new Vector3(0,3,-4),scene);camera.getViewMatrix(true);
const fx=new FlameJetFX(scene,{quality:'low',createLights:false,resolveHit:()=>({distance:2,normal:{x:0,y:0,z:-1}})});
fx.setEmitter({x:12,y:2,z:-4},{x:0,y:0,z:2});fx.setActive(true);
for(let i=0;i<60;i++)fx.update(1/60,camera);
assert.deepEqual(fx.origin.asArray(),[12,2,-4]);assert.deepEqual(fx.direction.asArray(),[0,0,1]);
assert.equal(fx.getState().visibleLength,2);assert.ok(fx._hitNormal.asArray().every(Number.isFinite));
assert.ok(fx.getState().queries<=21);assert.equal(scene.lights.length,0);
fx.setEmitter({x:12,y:2,z:-3.5},{x:0,y:0,z:1});fx.update(0,camera);
assert.ok(Math.abs(fx.getState().visibleLength-1.5)<1e-6,'cached impact stays on the wall when the hand advances');
const counts=[scene.meshes.length,scene.materials.length,scene.textures.length];
for(let i=0;i<30;i++){fx.reset();fx.setActive(true);fx.update(.1,camera);}
assert.deepEqual([scene.meshes.length,scene.materials.length,scene.textures.length],counts);
fx.setActive(false);for(let i=0;i<120;i++)fx.update(1/60,camera);assert.equal(fx.getState().enabledMeshes,0);
const queries=fx.getState().queries;for(let i=0;i<120;i++)fx.update(1/60,camera);assert.equal(fx.getState().queries,queries);
fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);assert.equal(scene.textures.length,0);
scene.dispose();engine.dispose();console.log('OK fire unlock, independent progression, FPS-independent damage, obstacles, cancellation, pool and idle');
