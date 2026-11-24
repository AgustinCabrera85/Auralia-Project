const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {TERRAIN_LOD_CONFIG:C}=require('../.test-build/world/terrainLod.js');

(async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('horizon',scene);
  let ready=true,readyProbes=Infinity,clock=0,yields=0;
  const original=Object.getOwnPropertyDescriptor(performance,'now');
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  const source={id:'horizon-fixture',streamed:true,bounds:[-7000,-7000,7000,7000],seaLevel:0,meshSpacing:3,
    heightAt(x,z){clock+=.002;return 80+Math.sin(x/800)*30+Math.cos(z/600)*20;},
    weightsAt(){clock+=.002;return [1,0,0,0,0,0];},preserveDetail:()=>false,
    isReady:()=>ready&&readyProbes-->0,prepare:async()=>{}};
  const terrain=new TerrainStream(scene,root,{},source);
  const covered=(x,z)=>{
    for(let r=0;r<C.farRadius;r+=144)for(let i=0;i<48;i++){
      const a=i*Math.PI/24;
      assert.ok(terrain.coverageAt(x+Math.cos(a)*r,z+Math.sin(a)*r),
        `visible land cannot become ocean: ${x},${z}, radius ${r}, heading ${i}`);
    }
  };
  try{
    terrain.update(10,10,0,0,0);
    assert.equal(terrain.hasHorizonAt(10,10),false,'local ground is not a complete horizon');
    const old=scene.getMeshByName('terreno-near-0-0');assert.ok(old?.isEnabled());
    await terrain.prepareHorizon(10,10,async()=>{
      yields++;assert.ok(old.isEnabled(),'preparation keeps the current view intact');
    });
    assert.ok(yields>10,'preparation yields instead of one long main-thread job');
    assert.ok(terrain.hasHorizonAt(10,10));terrain.update(10,10,0,0,0);covered(10,10);
    const identity=[...scene.meshes],vertices=identity.map(m=>m.getTotalVertices());
    for(let i=0;i<36;i++){
      const a=i*Math.PI/18;terrain.update(10,10,Math.cos(a)*27,Math.sin(a)*27,0);covered(10,10);
    }
    assert.deepEqual(scene.meshes,identity,'turning cannot rebuild or replace the mountain silhouette');
    assert.deepEqual(identity.map(m=>m.getTotalVertices()),vertices);

    // Reproduce a retirement hole: detailed siblings exist but their far parent
    // does not. Crossing the mid radius must retain those siblings until ready.
    const parent=terrain.far.get('0:0');parent.mesh.dispose(false,false);terrain.far.delete('0:0');
    terrain.update(1080,10,27,0,0);
    assert.equal(terrain.coverageAt(10,10),'mid','keep old detailed coverage while the far tile is missing');
    let steps=0;
    while(!terrain.far.has('0:0')){
      terrain.update(1080,10,27,0,12);assert.ok(terrain.coverageAt(10,10));
      assert.ok(++steps<2000);
    }
    assert.equal(terrain.coverageAt(10,10),'far');
    assert.ok(!terrain.fallbackMid.has('0:0'),'temporary fallback is released after replacement');

    const before=terrain.coverageAt(1080,10);
    await terrain.prepareHorizon(-2600,-2200,async()=>{
      assert.equal(terrain.coverageAt(1080,10),before,'travel preparation cannot erase the old destination');
    });
    terrain.update(-2600,-2200,0,0,0);covered(-2600,-2200);
    const meshesBeforeFailure=scene.meshes.length;
    readyProbes=3;
    await assert.rejects(terrain.prepareHorizon(4000,4000,async()=>{}),/not ready/);
    assert.equal(scene.meshes.length,meshesBeforeFailure,'failed partial preparation releases staged meshes');
    covered(-2600,-2200);
    ready=false;
    assert.equal(terrain.canTraverse(-2600,-2200),false,'visual coverage cannot bypass unavailable collision data');
    ready=true;readyProbes=Infinity;
    await assert.rejects(terrain.prepareHorizon(4000,4000,async()=>terrain.dispose()),/cancelled/);
    assert.equal(scene.meshes.length,0,'disposing during preparation cannot publish orphan meshes');
    console.log(`Terrain horizon: complete 360-degree coverage, ${yields} cooperative yields, stable geometry, atomic LOD/travel and failed-load retention passed.`);
  }finally{
    if(!terrain.disposed)terrain.dispose();assert.equal(scene.meshes.length,0,'all prepared meshes are released');
    if(original)Object.defineProperty(performance,'now',original);else delete performance.now;
    scene.dispose();engine.dispose();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
