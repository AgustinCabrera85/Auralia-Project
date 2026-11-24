import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,TransformNode,MeshBuilder,AssetContainer,AnimationGroup} from '@babylonjs/core';

const runtime=resolve('.test-build/bird-spawn-runtime');mkdirSync(runtime,{recursive:true});
for(const name of ['BirdCatalog','BirdFlightPath','BirdSimulation','BirdHabitat','BirdFlockSystem','BirdHabitatRules']){
  const code=ts.transpileModule(readFileSync(`src/world/wildlife/${name}.ts`,'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace(/from '(\.\/Bird\w+)'/g,"from '$1.mjs'")
    .replace("import { loadGpuAssetContainerAsync } from '../GpuAssets';","import { LoadAssetContainerAsync as loadGpuAssetContainerAsync } from '@babylonjs/core';");
  writeFileSync(resolve(runtime,`${name}.mjs`),code);
}
const load=name=>import(pathToFileURL(resolve(runtime,`${name}.mjs`)));
const {BirdSimulation}=await load('BirdSimulation');
const {BirdHabitatScanner}=await load('BirdHabitat');
const {BirdFlockSystem}=await load('BirdFlockSystem');
const {woodlandBirdHabitatAllowed}=await load('BirdHabitatRules');
const {BIRD_CLIPS}=await load('BirdCatalog');
const focus={x:0,y:0,z:0},counts={canary:7,swallow:4};
const perches=Array.from({length:14},(_,i)=>({id:`oak:${i}`,kind:'tree',x:25+i*1.2,y:8+i*.04,z:20}));
const habitat={sites:perches,obstacles:[],ground:()=>0,water:()=>null,allowed:(x)=>x<100};
const sim=new BirdSimulation();sim.reset(focus,habitat,counts);
assert.equal(sim.birds.length,11);
assert.equal(new Set(sim.birds.map(b=>b.target.id)).size,11);
for(const b of sim.birds){
  assert.equal(b.state,'perch');assert.equal(b.clip,'Reposo');assert.ok(b.landed);
  const site=perches.find(s=>s.id===b.target.id);
  assert.deepEqual(b.position,{x:site.x,y:site.y,z:site.z},'feet start on a sampled canopy surface');
  assert.deepEqual(b.velocity,{x:0,y:0,z:0});
}
const initial=new Map(sim.birds.map(b=>[b.id,{...b.position}])),takeoffs=new Map();
const feeding={...habitat,sites:[...perches,{id:'food',kind:'food',x:40,y:0,z:0}]};
for(let frame=1;frame<=360;frame++){
  sim.step(1/60,feeding,{threats:[],night:0,rain:0},1);
  for(const b of sim.birds)if(!takeoffs.has(b.id)){
    if(!b.landed)takeoffs.set(b.id,frame);
    else assert.deepEqual(b.position,initial.get(b.id),'wait on the branch before departing');
  }
}
assert.equal(takeoffs.size,11);assert.ok(new Set(takeoffs.values()).size>=5,'staggered departure');
assert.ok(Math.min(...takeoffs.values())>=90,'no immediate mid-air appearance');
for(const sites of [[],[{id:'food',kind:'food',x:25,y:0,z:20}],
  [{id:'roof',kind:'perch',x:25,y:8,z:20}],perches.map(s=>({...s,canopy:false})),
  perches.map(s=>({...s,x:s.x+100})),perches.map(s=>({...s,y:1}))]){
  sim.reset(focus,{...habitat,sites},counts);assert.equal(sim.birds.length,0,'no invented or unsuitable canopy');
}
sim.reset(focus,{...habitat,sites:perches.slice(0,2)},counts);
assert.deepEqual(sim.birds.map(b=>b.species),['canary','swallow'],'small canopies limit population without stacking');
const survivors=[...sim.birds];sim.populate(focus,habitat,counts);
assert.ok(survivors.every(b=>sim.birds.includes(b)),'streaming adds birds without resetting the existing flock');
assert.equal(new Set(sim.birds.map(b=>b.id)).size,11);
const atlas=JSON.parse(readFileSync('public/auralia-preview/data/reinos_v3_7.json','utf8'));
const regions=atlas.kingdoms.map(r=>({id:r.id,x:r.centroRegionalXZ_m[0],z:r.centroRegionalXZ_m[1]}));
for(const r of regions)assert.equal(woodlandBirdHabitatAllowed(r.x,r.z,0,regions),!['DES','CRI','ALB','MAL'].includes(r.id));
assert.equal(woodlandBirdHabitatAllowed(-1250,1600,.001,regions),false,'the complete desert transition overrides regional labels');

const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('birds',scene);
let treeQueries=0,allowed=true;
const world={ground:()=>0,water:()=>null,foodAllowed:()=>true,habitatAllowed:(x)=>allowed&&x<100,
  trees:()=>{treeQueries++;return [{id:'oak',perches,obstacle:{id:'oak',minX:24,maxX:42,minZ:19,maxZ:21,top:9}}];}};
const scanner=new BirdHabitatScanner(scene,{...world,habitatAllowed:()=>false});
for(let i=0;i<30;i++)scanner.update(1/60,focus);
assert.equal(scanner.sites.length,0,'blocked regions supply neither food nor spawn perches');
let releaseSecond,secondRequested;
const gate=new Promise(resolve=>releaseSecond=resolve),requested=new Promise(resolve=>secondRequested=resolve);
const importer=async url=>{
  if(url.includes('swallow')){secondRequested();await gate;}
  const asset=new AssetContainer(scene);asset.meshes.push(MeshBuilder.CreateBox('bird-template',{size:.3},scene));
  for(const name of BIRD_CLIPS)asset.animationGroups.push(new AnimationGroup(name,scene));
  asset.removeAllFromScene();return asset;
};
const system=new BirdFlockSystem(scene,parent,world,true,importer);await requested;
const frame={focus,threats:[],night:0,rain:0,active:true,paused:false};
for(let i=0;i<45;i++)system.update(1/60,frame);
assert.equal(system.status.count,4);
const canaries=[...system.simulation.birds],positions=canaries.map(b=>({...b.position}));
releaseSecond();await system.ready;system.update(0,frame);system.update(0,frame);
assert.equal(system.status.count,6);assert.equal(system.status.visible,6);
assert.ok(canaries.every(b=>system.simulation.birds.includes(b)));
assert.deepEqual(canaries.map(b=>b.position),positions,'late swallow template never teleports/reset canaries');
const visualCount=scene.meshes.length;
allowed=false;system.update(1/60,frame);
assert.equal(system.status.count,0);assert.equal(system.status.visible,0);
const before=treeQueries;for(let i=0;i<60;i++)system.update(1/60,frame);
assert.equal(treeQueries,before,'no habitat scanning while inside an excluded region');
allowed=true;for(let i=0;i<45;i++)system.update(1/60,frame);
assert.equal(system.status.count,6);assert.equal(scene.meshes.length,visualCount,'reuse bounded visual pool after returning to forest');
system.dispose();scene.dispose();engine.dispose();
console.log('PASS bird spawn: region exclusions, real canopies, limited capacity, staggered takeoff, delayed assets and pooled return.');
