import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {NullEngine,Scene,LoadAssetContainerAsync,TransformNode,FreeCamera,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
fs.mkdirSync('.test-build',{recursive:true});
fs.writeFileSync('.test-build/feet-runtime.mjs',ts.transpileModule(fs.readFileSync('src/game/GroundFootPlacement.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {GroundFootPlacement}=await import('../.test-build/feet-runtime.mjs');
const models=[
  ['santi/Santi_NLA_SK_Opt.glb','Santi_Mesh_primitive0',3.8,.55,
    [['mixamorig:LeftUpLeg','mixamorig:LeftLeg','mixamorig:LeftFoot'],['mixamorig:RightUpLeg','mixamorig:RightLeg','mixamorig:RightFoot']]],
  ['dogo/Dogo_Auralia.glb','Dogo_primitive0',1.35,.32,
    [['front_upper.L','front_forearm.L','front_paw.L'],['front_upper.R','front_forearm.R','front_paw.R'],
     ['hind_thigh.L','hind_shin.L','hind_paw.L'],['hind_thigh.R','hind_shin.R','hind_paw.R']]]
];
const results=[];
for(const [file,bodyName,height,adjust,chains] of models){
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.activeCamera=new FreeCamera('qa',new Vector3(0,3,-8),scene);
  const asset=await LoadAssetContainerAsync('data:application/octet-stream;base64,'+
    fs.readFileSync('public/assets/characters/'+file).toString('base64'),scene);
  asset.animationGroups.forEach(g=>g.stop());asset.addAllToScene();
  const model=asset.meshes[0],body=asset.meshes.find(m=>m.name===bodyName);
  body.computeWorldMatrix(true);model.scaling.scaleInPlace(height/(body.getBoundingInfo().boundingBox.extendSizeWorld.y*2));
  const root=new TransformNode('actor',scene),visual=new TransformNode('support',scene);
  visual.parent=root;model.parent=visual;
  const solver=new GroundFootPlacement(scene,root,visual,asset.transformNodes,chains,adjust);
  const poses=asset.transformNodes.map(n=>[n,n.rotationQuaternion?.clone(),n.position.clone()]);
  const restore=()=>{for(const [n,q,p] of poses){if(q)n.rotationQuaternion.copyFrom(q);n.position.copyFrom(p);}};
  const footNodes=chains.map(c=>asset.transformNodes.find(n=>n.name===c[2]));
  const runs=[];
  for(const hz of [30,60,144])for(const [sx,sz,step] of [[0,0,0],[.55,0,0],[0,.35,0],[0,-.35,0],[0,0,.16]]){
    if(height<2)root.rotation.set(-Math.atan(sz),0,Math.atan(sx));
    const world={ground:(x,z)=>({height:sx*x+sz*z+(x>0?step:0),normalY:1/Math.hypot(1,sx,sz)})};
    for(let i=0;i<hz;i++){solver.update(1/hz,true,world,{x:0,z:0});scene.render();}
    const status=solver.status;
    assert.equal(status.feet.length,chains.length);
    assert.ok(status.feet.every(f=>Math.abs(f.error)<.035),JSON.stringify({file,sx,sz,step,status}));
    assert.ok(Math.abs(status.pelvis)<=adjust+.001);
    runs.push({hz,sx,sz,step,maxError:Math.max(...status.feet.map(f=>Math.abs(f.error)))});
  }
  // A lifted foot remains lifted. Correcting the support cannot freeze the gait.
  solver.update(1/60,false,{ground:()=>null},{x:0,z:0});scene.render();restore();
  const foot=footNodes[0];foot.computeWorldMatrix(true);const before=foot.absolutePosition.y;
  const knee=asset.transformNodes.find(n=>n.name===chains[0][1]);
  knee.rotationQuaternion.multiplyInPlace((await import('@babylonjs/core')).Quaternion.RotationAxis(new Vector3(1,0,0),.45));
  const floor={ground:()=>({height:0,normalY:1})};
  for(let i=0;i<60;i++){solver.update(1/60,true,floor,{x:0,z:0});scene.render();}
  assert.ok(solver.status.feet.some(f=>f.lift>.01),'keeps relative NLA swing lift');
  // Disabling support fully releases joints and pelvis (airborne/water/action).
  solver.update(1/60,false,floor,{x:0,z:0});scene.render();
  assert.equal(visual.position.y,0);assert.deepEqual(solver.status.feet,[]);
  restore();foot.computeWorldMatrix(true);assert.ok(Math.abs(foot.absolutePosition.y-before)<.001);
  // Large world coordinates / realm offset use local collision queries.
  root.rotation.set(0,0,0);root.position.set(4000,20,-5000);
  const offsetWorld={ground:(x,z)=>{assert.ok(Math.abs(x)<2&&Math.abs(z)<2);return {height:20,normalY:1};}};
  for(let i=0;i<60;i++){solver.update(1/60,true,offsetWorld,{x:4000,z:-5000});scene.render();}
  assert.ok(solver.status.feet.every(f=>Math.abs(f.error)<.035));
  results.push({model:file,runs});solver.dispose();scene.dispose();engine.dispose();
}
fs.mkdirSync('artifacts/dogo',{recursive:true});
fs.writeFileSync('artifacts/dogo/foot-contact-tests.json',JSON.stringify(results,null,2));
console.log('Foot support: both actual rigs, flat/uphill/downhill/cross-slope/steps, 30/60/144 Hz, swing lift, release and realm offsets OK');
