import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { NullEngine,Scene,FreeCamera,Vector3,TransformNode,LoadAssetContainerAsync,MeshBuilder } from '@babylonjs/core';

const runtime=resolve('.test-build/birds-runtime');mkdirSync(runtime,{recursive:true});
for(const name of ['BirdCatalog','BirdFlightPath','BirdSimulation','BirdHabitat','BirdFlockSystem']){
  let code=ts.transpileModule(readFileSync(`src/world/wildlife/${name}.ts`,'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  code=code.replace(/from '(\.\/Bird\w+)'/g,"from '$1.mjs'")
    .replace("import { loadGpuAssetContainerAsync } from '../GpuAssets';","import { LoadAssetContainerAsync as loadGpuAssetContainerAsync } from '@babylonjs/core';");
  writeFileSync(resolve(runtime,`${name}.mjs`),code);
}
const {BirdSimulation}=await import(pathToFileURL(resolve(runtime,'BirdSimulation.mjs')));
const {planBirdFlight,sampleBirdFlight}=await import(pathToFileURL(resolve(runtime,'BirdFlightPath.mjs')));
const {BirdHabitatScanner,treePerchGeometry}=await import(pathToFileURL(resolve(runtime,'BirdHabitat.mjs')));
const {BirdFlockSystem}=await import(pathToFileURL(resolve(runtime,'BirdFlockSystem.mjs')));
const {BIRD_CLIPS}=await import(pathToFileURL(resolve(runtime,'BirdCatalog.mjs')));
const sites=[];
for(let i=0;i<12;i++){
  sites.push({id:`food:${i}`,kind:'food',x:20+i*.8,y:0,z:18});
  sites.push({id:`tree:${i}`,kind:'tree',x:17+i,y:6,z:10});
  sites.push({id:`shore:${i}`,kind:'shore',x:40,y:0,z:i+12,heading:Math.PI/2});
  sites.push({id:`water:${i}`,kind:'water',x:48,y:.18,z:i+12,heading:0});
}
const habitat={sites,obstacles:[{id:'tree',minX:16,maxX:30,minZ:9,maxZ:11,top:6}],
  ground:(x)=>x>40?-1:0,water:(x)=>x>40?0:null};
const context={threats:[],night:0,rain:0};
// Descents need horizontal room, continuous tangents and a level touchdown.
{
  const flat={ground:()=>0,water:()=>null,obstacles:[]};
  for(const end of [{x:0,y:0,z:0},{x:2,y:4,z:1},{x:30,y:0,z:10}])for(const side of [-1,1]){
    const start={x:0,y:12,z:0};
    const path=planBirdFlight(start,end,{x:5,y:0,z:0},Math.PI/2,flat,{side});
    let previous=sampleBirdFlight(path,0),horizontalTravel=0;
    assert.deepEqual(previous.point,start);
    assert.ok(previous.tangent.x>.999,'retains incoming direction');
    for(let distance=.1;distance<path.length;distance+=.1){
      const current=sampleBirdFlight(path,distance),t=current.tangent;
      horizontalTravel+=Math.hypot(current.point.x-previous.point.x,current.point.z-previous.point.z);
      assert.ok(current.point.y>=-.001,'descent stays above ground');
      assert.ok(Math.hypot(t.x,t.z)>.8,'descent never becomes a vertical drop');
      const dot=t.x*previous.tangent.x+t.y*previous.tangent.y+t.z*previous.tangent.z;
      assert.ok(dot>.998,'turns and joined segments have continuous directions');
      assert.ok(Math.hypot(current.point.x-previous.point.x,current.point.y-previous.point.y,current.point.z-previous.point.z)<.102,
        'arc-length sampling does not jump');
      previous=current;
    }
    const arrival=sampleBirdFlight(path,path.length);
    assert.deepEqual(arrival.point,end);
    assert.ok(Math.abs(arrival.tangent.y)<.001,'arrival levels off');
    assert.ok(horizontalTravel>25,'nearby high destinations get room to descend');
  }
  const obstacle={minX:18,maxX:22,minZ:-4,maxZ:4,top:8};
  const path=planBirdFlight({x:0,y:6,z:0},{x:40,y:0,z:0},{x:5,y:0,z:0},Math.PI/2,
    {...flat,obstacles:[obstacle]},{side:1});
  let crossed=false;
  for(let distance=0;distance<path.length;distance+=.1){
    const {point:p}=sampleBirdFlight(path,distance);
    if(p.x>=18&&p.x<=22&&Math.abs(p.z)<=4){crossed=true;assert.ok(p.y>=8,'curved corridor clears obstacle');}
  }
  assert.ok(crossed,'obstacle test actually crosses the obstacle');
  const skim=planBirdFlight({x:48,y:.18,z:10},{x:48,y:.18,z:15.5},{x:0,y:0,z:6.8},0,
    {ground:()=>-1,water:()=>0,obstacles:[]},{heading:0,side:1});
  assert.ok(Math.abs(skim.length-5.5)<.001,'drinking pass keeps its forward course');
  for(let distance=0;distance<skim.length;distance+=.1)
    assert.ok(Math.abs(sampleBirdFlight(skim,distance).point.y-.18)<.001,'drinking pass remains at water level');
}
// A full landing brakes to near rest, including at the lowest supported frame rate.
for(const hz of [30,60,144]){
  const ground={sites:[{id:'food',kind:'food',x:25,y:0,z:18},
    {id:'canopy',kind:'tree',x:20,y:6,z:18}],obstacles:[],ground:()=>0,water:()=>null};
  const sim=new BirdSimulation();sim.reset({x:0,y:0,z:0},ground,{canary:1,swallow:0});
  const b=sim.birds[0];let speed=0,landed=false;
  // This test starts in flight; normal population now starts perched in a tree.
  Object.assign(b,{position:{x:0,y:6,z:0},landed:false,state:'fly',clip:'Volar',target:null});
  for(let i=0;i<hz*40;i++){
    sim.step(1/hz,ground,context);
    if(b.landed){assert.ok(speed<.08,`touchdown brakes smoothly at ${hz} Hz (${speed})`);landed=true;break;}
    const next=Math.hypot(b.velocity.x,b.velocity.y,b.velocity.z);
    assert.ok(Math.abs(next-speed)*hz<3.6,'acceleration and deceleration stay bounded');speed=next;
  }
  assert.ok(landed,'smooth approach still reaches its destination');
}
const summary={};
for(const hz of [30,60,144]){
  const sim=new BirdSimulation();sim.reset({x:0,y:0,z:0},habitat,{canary:7,swallow:4});
  const seen={canary:new Set(),swallow:new Set()};let ate=false,drank=false,skimmed=false;
  for(let i=0;i<hz*240;i++){
    sim.step(1/hz,habitat,context);
    for(const b of sim.birds){
      seen[b.species].add(b.state);
      assert.ok([b.position.x,b.position.y,b.position.z,b.heading,b.bank].every(Number.isFinite));
      assert.ok(b.position.y>=habitat.ground(b.position.x,b.position.z)-.02,'above ground');
      if(b.species==='canary'&&b.landed)assert.ok(b.position.x<=40,'canary never lands in deep water');
      if(b.species==='swallow')assert.ok(!['forage','hop','drink'].includes(b.state),'swallows feed and drink on the wing');
      ate||=b.species==='canary'&&b.hunger<.3;
      drank||=b.species==='canary'&&b.thirst<.2;
      skimmed||=b.species==='swallow'&&b.thirst<.2;
    }
  }
  summary[hz]=Object.fromEntries(Object.entries(seen).map(([s,states])=>[s,[...states]]));
  assert.ok(ate,`canaries actually eat at ${hz} Hz: ${JSON.stringify(summary[hz])}`);
  assert.ok(drank,`canaries actually drink at ${hz} Hz: ${JSON.stringify(summary[hz])}`);
  assert.ok(skimmed,`swallows actually drink at ${hz} Hz: ${JSON.stringify(summary[hz])}`);
  assert.ok(seen.canary.has('perch')&&seen.swallow.has('perch'),'both species perch');
  const before=structuredClone(sim.birds);sim.step(0,habitat,context);sim.step(NaN,habitat,context);assert.deepEqual(sim.birds,before);
  for(let i=0;i<hz*60;i++)sim.step(1/hz,habitat,{...context,night:1});
  assert.ok(sim.birds.filter(b=>b.roosting).length>=8,'night gathers birds on perches');
  const resting=sim.birds.find(b=>b.roosting);assert.ok(resting);
  const restingPosition={...resting.position};sim.step(1/hz,habitat,{...context,night:1,threats:[restingPosition]});
  assert.equal(resting.state,'alert');
  for(let i=0;i<hz*2;i++)sim.step(1/hz,habitat,context);
  assert.ok(resting.position.y>restingPosition.y+.5,'startle releases perch and takes off');
}
// No trees means no population, even if food, roofs or water are present.
{
  const sim=new BirdSimulation(),empty={...habitat,sites:[],obstacles:[]};sim.reset({x:0,y:0,z:0},empty,{canary:3,swallow:2});
  sim.step(1,empty,context);assert.equal(sim.birds.length,0);
  sim.reset({x:0,y:0,z:0},{...habitat,sites:sites.filter(s=>s.kind!=='tree')},{canary:3,swallow:2});
  assert.equal(sim.birds.length,0,'resources cannot replace a real spawn tree');
  sim.reset({x:0,y:0,z:0},habitat,{canary:3,swallow:2});
  for(let i=0;i<180;i++)sim.step(1/30,habitat,context);
  const p={...sim.birds[0].position};sim.step(120,empty,context);
  assert.ok(Math.hypot(sim.birds[0].position.x-p.x,sim.birds[0].position.y-p.y,sim.birds[0].position.z-p.z)<2,'bounded suspended-tab delta');
}
const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('qa',new Vector3(0,8,-15),scene);
// Canonical triangle interpolation stays continuous and reuses grid vertices.
{
  let queries=0;
  const cached=new BirdHabitatScanner(scene,{groundSpacing:3,
    ground:(x,z)=>{queries++;return x*.2+z*.1;},water:()=>null,trees:()=>[],foodAllowed:()=>true});
  for(const [x,z] of [[.1,.1],[.2,.1],[1,1],[2.8,2.7],[-.1,-.1]])
    assert.ok(Math.abs(cached.ground(x,z)-(x*.2+z*.1))<1e-9,'ground cache preserves the terrain plane');
  const before=queries;cached.ground(.12,.13);cached.ground(.23,.24);
  assert.equal(queries,before,'nearby flight samples reuse the canonical vertices');
  const sim=new BirdSimulation();sim.reset({x:0,y:0,z:0},habitat,{canary:3,swallow:2});
  for(const b of sim.birds)Object.assign(b,{landed:false,state:'fly',clip:'Volar',target:null});
  let previous=0;
  for(let i=0;i<5;i++){
    sim.step(1/60,habitat,context,1);
    const planned=sim.birds.filter(b=>b.flight).length;
    assert.equal(planned,previous+1,'only one new corridor is planned per rendered frame');previous=planned;
  }
  const waiting=sim.birds[4],path=waiting.flight,travel=path.travel;
  waiting.target={id:'air',kind:'perch',x:waiting.position.x+8,y:waiting.position.y+3,z:waiting.position.z+6};
  sim.step(1/60,habitat,context,0);
  assert.equal(waiting.flight,path,'queued replanning retains the old safe corridor');
  assert.ok(waiting.flight.travel>travel,'flight continues smoothly while a new corridor is queued');
}
const tree=MeshBuilder.CreateBox('tree-surface',{width:4,depth:4,height:8},scene);
const geometry=treePerchGeometry(tree);assert.equal(geometry.points.length,5);assert.ok(geometry.points.every(p=>Math.abs(p.y-4)<1e-6));tree.dispose();
const world={ground:habitat.ground,water:habitat.water,trees:()=>[],foodAllowed:()=>true};
const scanner=new BirdHabitatScanner(scene,world);
for(let i=0;i<30;i++)scanner.update(1/60,{x:20,y:0,z:10});
assert.ok(scanner.sites.some(s=>s.kind==='water'));assert.ok(scanner.sites.some(s=>s.kind==='shore'));
assert.ok(scanner.sites.filter(s=>s.kind==='shore').every(s=>s.x<=40));
// A refresh with no usable habitat must publish the empty result, not retain old perches.
world.foodAllowed=()=>false;world.water=()=>null;world.ground=()=>-200;
for(let i=0;i<60;i++)scanner.update(.2,{x:20,y:0,z:10});
assert.equal(scanner.sites.length,0,'removed habitat invalidates previous resources');
world.foodAllowed=()=>true;world.water=habitat.water;world.ground=habitat.ground;
const importer=async(url,scene,options)=>{
  const bytes=readFileSync('public'+url);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.deepEqual(gltf.animations.map(a=>a.name).sort(),[...BIRD_CLIPS].sort());
  assert.ok(gltf.animations.every(a=>a.channels.some(c=>c.target.path==='weights')),'wing correctives in all ten clips');
  return LoadAssetContainerAsync('data:application/octet-stream;base64,'+bytes.toString('base64'),scene,options);
};
const parent=new TransformNode('world',scene),baseline={meshes:scene.meshes.length,skeletons:scene.skeletons.length,morphs:scene.morphTargetManagers.length};
world.trees=(x,z)=>[{id:`canopy:${x}:${z}`,perches:Array.from({length:12},(_,i)=>({x:x+20+i,y:6,z:z+18})),
  obstacle:{id:'canopy',minX:x+19,maxX:x+32,minZ:z+17,maxZ:z+19,top:6}}];
const system=new BirdFlockSystem(scene,parent,world,true,importer);await system.ready;
assert.deepEqual(system.failures,[]);
const frame={focus:{x:0,y:0,z:0},threats:[],night:0,rain:0,active:true,paused:false};
for(let i=0;i<60;i++){system.update(1/60,frame);scene.render();}
assert.equal(system.status.count,6);assert.ok(system.status.birds.every(b=>b.clips.length===10));
const bodies=scene.meshes.filter(m=>m.metadata?.wildlife&&m.skeleton);
assert.ok(bodies.every(m=>m.isEnabled()),'loaded bird meshes must be enabled through the entire cloned hierarchy');
assert.equal(system.status.visible,6,'plain BirdPoint focus keeps nearby birds visible');
assert.ok(bodies.every(m=>Number.isFinite(m.visibility)&&m.visibility>0),'distance fade must never be NaN');
const activeBirds=scene.getActiveMeshes();
assert.ok(bodies.every(m=>activeBirds.data.slice(0,activeBirds.length).includes(m)),
  'every nearby bird must enter the render list, not merely exist in scene.meshes');
assert.equal(bodies.length,6);assert.equal(new Set(bodies.map(m=>m.skeleton)).size,6,'independent skeletons');
assert.equal(new Set(bodies.map(m=>m.morphTargetManager)).size,6,'independent folded-wing morphs');
for(const species of ['canary','swallow']){
  const meshes=bodies.filter(m=>m.metadata.species===species);
  assert.equal(new Set(meshes.map(m=>m.geometry)).size,1,'geometry is shared');
}
const first=system.simulation.birds[0],originalPosition={...first.position};
first.position.x=200;system.update(0,frame);scene.render();
assert.equal(system.status.visible,5,'distance culling still hides a far bird');
Object.assign(first.position,originalPosition);system.update(0,frame);scene.render();
assert.equal(system.status.visible,6,'a bird returning within range becomes visible again');
assert.ok(bodies.every(m=>m.isEnabled()));
const p=structuredClone(system.status.birds.map(b=>b.position));
system.update(1,{...frame,paused:true});assert.deepEqual(system.status.birds.map(b=>b.position),p);
system.update(1/60,{...frame,active:false});assert.equal(system.status.visible,0);
system.update(1/60,{...frame,focus:{x:500,y:0,z:500}});assert.equal(system.status.count,0,'travel evicts old flock');
// Repeated travel reuses the same bounded rigs; it must not leak morph managers.
world.ground=()=>0;world.water=()=>null;
const residentMorphs=scene.morphTargetManagers.length,rigs=new Set(bodies.map(m=>m.skeleton));
for(let trip=0;trip<6;trip++){
  for(let i=0;i<40;i++){system.update(1/60,{...frame,focus:{x:800+trip*130,y:0,z:0}});scene.render();}
  assert.equal(scene.morphTargetManagers.length,residentMorphs,'travel must retain only one bounded flock');
  assert.ok(scene.meshes.filter(m=>m.metadata?.wildlife&&m.skeleton).every(m=>rigs.has(m.skeleton)),'travel reuses the original rigs');
}
system.dispose();system.dispose();assert.equal(scene.meshes.length,baseline.meshes);assert.equal(scene.skeletons.length,baseline.skeletons);
assert.equal(scene.morphTargetManagers.length,baseline.morphs,'dispose releases independently cloned morph managers');
const late=new BirdFlockSystem(scene,parent,world,true,importer);late.dispose();await late.ready;
assert.equal(scene.meshes.length,baseline.meshes,'dispose during loading leaves no meshes');
scene.dispose();engine.dispose();
console.log('Birds: smooth flight/landing, behavior at 30/60/144 Hz, habitat, assets, rigs, morphs, pause, travel and disposal OK',summary);
