import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,TransformNode,Vector3,ImportMeshAsync} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
const dir=resolve('.test-build/flame-hand-pose');mkdirSync(dir,{recursive:true});
for(const [name,file] of [['pose','src/game/SantiFlamePose.ts'],['catalog','src/domain/abilities/catalog.ts']])
 writeFileSync(resolve(dir,name+'.mjs'),ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {SantiFlamePose}=await import(pathToFileURL(resolve(dir,'pose.mjs')));
const {ABILITIES}=await import(pathToFileURL(resolve(dir,'catalog.mjs')));
const binding=ABILITIES.find(d=>d.id==='igneo_fire').animation;
assert.ok(binding.handCast&&binding.clip==='Idle (1)');
const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('actor',scene);
const rig=await ImportMeshAsync(new Uint8Array(readFileSync('public/assets/characters/santi/Santi_NLA_SK_Opt.glb')),scene,
 {pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
const root=rig.meshes.find(m=>m.name==='__root__'),body=rig.meshes.find(m=>m.name==='Santi_Mesh_primitive0');
body.computeWorldMatrix(true);const box=body.getBoundingInfo().boundingBox;
root.parent=actor;root.scaling.scaleInPlace(3.8/(box.maximumWorld.y-box.minimumWorld.y));
const pose=new SantiFlamePose(scene,actor,rig.transformNodes);assert.equal(pose.ready,true);
const idle=rig.animationGroups.find(g=>g.name===binding.clip);idle.start(true);idle.pause();
const node=name=>rig.transformNodes.find(n=>n.name==='mixamorig:'+name);
const position=name=>{const n=node(name);n.computeWorldMatrix(true);return n.absolutePosition.clone();};
const origin=new Vector3(),direction=new Vector3();
const frame=(time,yaw)=>{
 pose.restore();actor.rotation.y=yaw;actor.computeWorldMatrix(true);idle.goToFrame(idle.from,true);
 pose.setTime(binding.handCast,time);scene.onBeforeAnimationsObservable.notifyObservers(scene);pose.apply();
 assert.equal(pose.sampleEmitter(origin,direction),true);
 assert.ok([...origin.asArray(),...direction.asArray()].every(Number.isFinite));
};
for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 frame(0,yaw);const start=position('LeftHand'),shoulder=position('LeftArm');
 const upperLength=Vector3.Distance(shoulder,position('LeftForeArm')),lowerLength=Vector3.Distance(position('LeftForeArm'),start);
 const right=node('RightArm').rotationQuaternion.clone(),forward=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
 let previous=Vector3.Dot(start.subtract(shoulder),forward);
 for(const time of [.07,.14,.21,.28,.35,.42]){
  frame(time,yaw);const wrist=position('LeftHand'),reach=Vector3.Dot(wrist.subtract(position('LeftArm')),forward);
  assert.ok(reach>=previous-1e-5,'hand extends smoothly forward');previous=reach;
  assert.ok(Math.abs(Vector3.Distance(position('LeftArm'),position('LeftForeArm'))-upperLength)<1e-5,'upper arm does not stretch');
  assert.ok(Math.abs(Vector3.Distance(position('LeftForeArm'),wrist)-lowerLength)<1e-5,'forearm does not stretch');
 }
 assert.ok(Vector3.Dot(direction,forward)>.999,'flame follows the open palm in every heading');
 assert.ok(Vector3.Dot(position('LeftHand').subtract(start),forward)>(upperLength+lowerLength)*.5,'hand advances visibly from its resting position');
 assert.ok(previous>(upperLength+lowerLength)*.9,'arm reaches forward nearly to its full length');
 const fingers=position('LeftHandMiddle1').subtract(position('LeftHand')).normalize();
 assert.ok(fingers.y>.98,'open fingers face upward while palm faces forward');
 assert.ok(node('RightArm').rotationQuaternion.equalsWithEpsilon(right,1e-6),'weapon arm remains untouched');
 const held=origin.clone();
 for(let i=0;i<120;i++){scene.onBeforeAnimationsObservable.notifyObservers(scene);pose.apply();pose.sampleEmitter(origin,direction);}
 assert.ok(Vector3.Distance(origin,held)<1e-5,'paused/manual sampling never accumulates pose drift');
 frame(binding.handCast.end,yaw);assert.ok(Vector3.Distance(position('LeftHand'),start)<1e-5,'retraction returns to authored idle');
 frame(1,yaw);pose.reset();assert.ok(Vector3.Distance(position('LeftHand'),start)<1e-5,'cancelling restores the arm immediately');
}
const observers=scene.onBeforeAnimationsObservable.observers.length;pose.dispose();
await new Promise(resolve=>setTimeout(resolve,0)); // Babylon defers observable removal.
assert.equal(scene.onBeforeAnimationsObservable.observers.length,observers-1);
scene.dispose();engine.dispose();console.log('OK real Santi rig: forward reach, open palm, four headings, rigid bones, pause, retraction and cancellation');
