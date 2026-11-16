const assert=require('node:assert/strict');
const {NullEngine,Scene,Vector3,Ray,HemisphericLight,TransformNode,MeshBuilder,PBRMaterial}=require('@babylonjs/core');
const {VolcanicCaveSystem}=require('../.test-build/world/VolcanicCaveSystem.js');
const {CAVE_NODES,CAVE_ROUTES,VOLCANIC_CAVE,caveWorldPoint}=require('../.test-build/world/volcanicCaveData.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const engine=new NullEngine(),scene=new Scene(engine),sun=new HemisphericLight('test-sun',Vector3.Up(),scene);
const cave=new VolcanicCaveSystem(scene,()=>1120,true,false);
cave.syncExterior(VOLCANIC_CAVE.entrance.x,VOLCANIC_CAVE.entrance.z);assert(cave.ready);
const exteriorMeshes=cave.exterior.getChildMeshes(false).filter(m=>m.isVisible);
assert.equal(exteriorMeshes.length,2,'entrance uses only its rock shell and recessed back');
assert(exteriorMeshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)<100,'small exterior geometry budget');
assert.equal(cave.nearestAction(new Vector3(VOLCANIC_CAVE.entrance.x,1120,VOLCANIC_CAVE.entrance.z)),'enter');
const originalMeshes=scene.meshes.length,originalLights=scene.lights.length;
const spawn=cave.enter(),world=cave.traversalWorld();
const hanging=new CharacterTraversalController();let caught=false;
for(let z=-23;z<-16&&!caught;z+=.15){
 hanging.teleport(0,-397.4,z);hanging.mode='airborne';
 hanging.step(1/60,{moveX:0,moveZ:0,forwardX:0,forwardZ:1,horizontal:0,vertical:0,run:false,sprint:false,jumpPressed:false},world);
 caught=hanging.mode==='hanging';
}
assert(caught,'the tapered bridge has a grabbable straight edge');
const edge=hanging.climbContact;
const edgeTop=world.ground(edge.pointX-edge.normalX*.03,edge.pointZ-edge.normalZ*.03,edge.pointY+.15,.3,0);
assert(edgeTop&&Math.abs(edgeTop.height-edge.pointY)<.03,'hands anchor to the real lip rather than the tapered side below it');
hanging.step(1/60,{moveX:0,moveZ:0,forwardX:0,forwardZ:1,horizontal:0,vertical:1,run:false,sprint:false,jumpPressed:false},world);
assert.equal(hanging.mode,'mantling','W climbs the real cave edge');
assert(!sun.isEnabled(),'exterior lights suspended inside');
assert.equal(cave.nearestAction(spawn),'exit');
assert(cave.status.triangles<100000,'geometry budget');
console.log('Interior:',cave.status);
// Real triangle collisions at all routes, including two different floors at the crossing.
for(const [id,n] of Object.entries(CAVE_NODES)){
  const p=caveWorldPoint(n),h=world.ground(p.x,p.z,p.y+1,3,.33);
  assert(h&&Math.abs(h.height-p.y)<.4,`${id}: support on the rendered path (${h?.height})`);
  assert(world.headroom(p.x,h.height+.1,p.z,3.8),`${id}: full character clearance`);
}
const top=world.ground(0,-14,-392,4,0),bottom=world.ground(0,-14,-405,5,0);
assert(top&&bottom&&top.height-bottom.height>11,'independent upper bridge and lower passage');
assert(!world.headroom(0,-405,-14,10),'bridge underside blocks an upward jump');
const obstruction=cave.colliders.queryCameraObstruction(new Vector3(0,-390,0),new Vector3(90,-390,0),.5);
assert(obstruction!==null&&obstruction<90,'camera sees cavern wall triangles');
// Picking acceleration must give the same result as unpartitioned visible geometry.
const structure=scene.meshes.filter(m=>m.isVisible&&/^crisol-(cavidad|cornisa|columna|tunel-de-salida|salida-cielo)/.test(m.name));
for(const n of Object.values(CAVE_NODES))for(const offset of [-.4,0,.4]){
  const point=caveWorldPoint(n),p=new Vector3(point.x+offset,point.y+.2,point.z+offset);
  const hit=new Ray(p,Vector3.Up(),40).intersectsMeshes(structure,false).find(h=>h.distance>.015&&(h.getNormal(true)?.y??0)<-.15);
  const fast=cave.colliders.queryCeiling(p.x,p.y,p.z,40),exact=hit?.pickedPoint?.y??null;
  assert(exact===null?fast===null:fast!==null&&Math.abs(fast-exact)<1e-5,'accelerated ceiling matches rendered triangles');
}
// Walk every authored segment in both directions without jumping or teleporting at joints.
const input=(dx,dz)=>({moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,horizontal:0,vertical:1,run:false,sprint:false,jumpPressed:false});
let walked=0;
for(const route of CAVE_ROUTES)for(const ids of [route,[...route].reverse()]){
  const controller=new CharacterTraversalController(),p=caveWorldPoint(CAVE_NODES[ids[0]]);
  controller.teleport(p.x,p.y+.1,p.z);
  for(const id of ids.slice(1)){
    const target=caveWorldPoint(CAVE_NODES[id]);let reached=false,stationary=0,lastDistance=Infinity;
    for(let frame=0;frame<1800;frame++){
      const p=controller.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
      if(d<.8){reached=true;break;}
      stationary=Math.abs(lastDistance-d)<.0001?stationary+1:0;lastDistance=d;if(stationary>60)break;
      controller.step(1/30,input(dx/d,dz/d),world);
      assert(p.y>VOLCANIC_CAVE.recoveryY,`${ids.join(' → ')}: fell before ${id}`);
    }
    assert(reached,`${ids.join(' → ')}: blocked toward ${id} at ${JSON.stringify(controller.position)}`);walked++;
  }
}
const actor=new TransformNode('actor',scene),body=MeshBuilder.CreateBox('body',{},scene);body.parent=actor;body.material=new PBRMaterial('actor-material',scene);
cave.update(.5,new Vector3(13,-395,-63),[actor],true);
assert(scene.lights.some(l=>l.name.startsWith('crisol-personajes')&&l.isEnabled()&&l.includedOnlyMeshes.includes(body)),'PBR actor receives local light');
assert(!sun.isEnabled(),'outside sun does not leak onto interior characters');
const candidates=scene.getActiveMeshCandidates();
assert(candidates.data.includes(body)&&candidates.length<60,'interior rendering evaluates actors and cave only');
assert(candidates.data.every(m=>!m.name.startsWith('collider-')),'collision proxies are not render candidates');
const exteriorCandidates=cave.exteriorCandidates;
let lightResyncs=0;const restoreLights=[];
for(const light of scene.lights){const fn=light._resyncMeshes;light._resyncMeshes=function(){lightResyncs++;return fn.call(this);};restoreLights.push(()=>light._resyncMeshes=fn);}
for(let i=0;i<120;i++){cave.restoreAtmosphere();cave.update(1/60,new Vector3(13,-395,-63),[actor],true);}
assert.equal(lightResyncs,0,'stable cave lighting never rescans all exterior meshes');
const equipment=MeshBuilder.CreateBox('late-equipment',{},scene);equipment.parent=actor;equipment.material=body.material;
cave.restoreAtmosphere();cave.update(.5,new Vector3(13,-395,-63),[actor],true);
assert(lightResyncs>0&&scene.lights.some(l=>l.name.startsWith('crisol-personajes')&&l.includedOnlyMeshes.includes(equipment)),'late-loaded equipment updates receivers');
assert(scene.getActiveMeshCandidates().data.includes(equipment),'late-loaded equipment is rendered');
for(const restore of restoreLights)restore();
cave.restoreAtmosphere();const recovered=cave.update(.1,new Vector3(10,-425,10),[actor],false);
assert(recovered&&recovered.y>-419,'fall recovers to reachable checkpoint');
actor.dispose(false,true);cave.leave();
assert.equal(scene.getActiveMeshCandidates,exteriorCandidates,'outside mesh selection restored on exit');
assert(sun.isEnabled(),'exterior light restored');assert.equal(scene.meshes.length,originalMeshes);assert.equal(scene.lights.length,originalLights);
for(let i=0;i<3;i++){cave.enter(true,true);assert.equal(cave.nearestAction(new Vector3(13,-395,-63)),null);cave.leave();}
assert.equal(scene.meshes.length,originalMeshes);assert.equal(scene.lights.length,originalLights);
let saved=newGame(),saves=0;const repo={load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);saves++;},clear(){}};
const store=new GameStore(repo);assert(store.claimDiscoveryReward(VOLCANIC_CAVE.rewardId,'fireCrystal',5));assert.equal(saves,1);
const reloaded=new GameStore(repo);assert(!reloaded.claimDiscoveryReward(VOLCANIC_CAVE.rewardId,'fireCrystal',5));assert.equal(reloaded.state.inventory.fireCrystal,5);
assert(reloaded.claimDiscoveryReward(VOLCANIC_CAVE.secretId,'spark',3));
cave.dispose();engine.dispose();console.log(`Cave OK: ${walked} route segments walked; multilevel collision, camera, recovery, lights, repeat visits and persistent rewards.`);
