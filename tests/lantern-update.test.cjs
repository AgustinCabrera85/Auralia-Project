const assert=require('node:assert/strict');
const {NullEngine,Scene,MeshBuilder,TransformNode,PointLight,Vector3}=require('@babylonjs/core');
const {BrisaliaEntranceLanterns}=require('../.test-build/world/BrisaliaEntranceLanterns.js');
const {WayfindingSystem}=require('../.test-build/world/WayfindingSystem.js');

(async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('village',scene);
  const facade=MeshBuilder.CreateBox('facade',{},scene);
  const entrances=new BrisaliaEntranceLanterns(scene);
  entrances.add('test',root,[facade],{x:0,y:2,z:0,front:-1,doorMin:[0,0,0],doorMax:[1,2,0]});
  const signs=new WayfindingSystem(scene,root,[],()=>0);await signs.ready;
  const guideRoot=new TransformNode('guide',scene);guideRoot.parent=root;
  const light=new PointLight('guide-light',Vector3.Zero(),scene);
  const characterLight=new PointLight('guide-character-light',Vector3.Zero(),scene);
  light.parent=guideRoot;characterLight.parent=guideRoot;
  // Asset loading is irrelevant to the steady-state update: inject its loaded lamp record.
  signs.lamps.push({root:guideRoot,light,characterLight,furniture:[facade]});
  let resyncs=0;
  const original=facade._resyncLightSource.bind(facade);
  facade._resyncLightSource=(...args)=>{resyncs++;return original(...args)};
  const near={x:0,z:0},far={x:1000,z:1000};
  const update=(night,at=near)=>{entrances.update(night,at,undefined,1/60);signs.update(night,at,1/60)};
  try{
    // Allow the initial half-second receiver registration to complete.
    for(let i=0;i<35;i++)update(1);resyncs=0;
    for(let i=0;i<120;i++)update(1);
    assert.equal(resyncs,0,'stationary night must not rescan the scene for unchanged lights');
    const entrance=[...entrances.lamps.values()][0].light;
    assert.ok(entrance.isEnabled()&&light.isEnabled());
    assert.equal(characterLight.isEnabled(),false,'an empty inclusion list must not light the whole scene');
    update(0);assert.ok(resyncs>0,'day transition still updates light receivers');
    assert.equal(entrance.isEnabled(),false);assert.equal(light.isEnabled(),false);
    resyncs=0;for(let i=0;i<120;i++)update(0);
    assert.equal(resyncs,0,'stationary day must not rescan disabled lights');
    update(1);update(1,far);
    assert.equal(entrance.isEnabled(),false);assert.equal(light.isEnabled(),false);
    update(1);root.setEnabled(false);
    assert.equal(entrance.isEnabled(),false);assert.equal(light.isEnabled(),false);
    root.setEnabled(true);update(1);
    assert.ok(entrance.isEnabled()&&light.isEnabled(),'parent visibility changes still propagate');
    console.log('Lantern updates: no steady-state scene scans; day, distance and parent transitions preserved.');
  }finally{signs.dispose();entrances.dispose();scene.dispose();engine.dispose()}
})().catch(error=>{console.error(error);process.exitCode=1});
