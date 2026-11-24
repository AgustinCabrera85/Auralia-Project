const fs=require('node:fs');
const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {LANDSCAPE_ATMOSPHERE_CONFIG}=require('../.test-build/world/LandscapeAtmosphere.js');
const read=name=>JSON.parse(fs.readFileSync('public/auralia-preview/data/'+name+'.json','utf8'));
(async()=>{
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology);
  let samples=0;const height=world.heightAt.bind(world);world.heightAt=(x,z)=>{samples++;return height(x,z);};
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('cache-benchmark',scene);
  const terrain=new TerrainStream(scene,root,{},world),runs=[];
  for(const [name,x,z] of [['cold',1767,-1461],['outbound',2055,-1461],['return',1767,-1461]]){
    await world.prepareAround(x,z);const before=samples,start=performance.now();let updates=0;
    do{terrain.update(x,z,0,0,4);if(++updates>30000)throw Error('terrain did not finish');}while(terrain.pendingCount);
    if(name==='cold'){
      const eyeY=world.surface.heightAt(x,z)+6;
      let range=0;const oldCuts=[0,0,0];
      for(const mesh of scene.meshes){
        if(!mesh.metadata?.terrainLod||!mesh.isEnabled())continue;
        const p=mesh.getVerticesData('position');
        for(let i=0;i<p.length;i+=3){
          const dx=p[i]+mesh.position.x-x,dy=p[i+1]-eyeY,dz=p[i+2]+mesh.position.z-z;
          range=Math.max(range,Math.hypot(dx,dy,dz));
          [12,27,49].forEach((degrees,k)=>{
            const yaw=degrees*Math.PI/180,pitch=.3;
            const depth=(dx*Math.sin(yaw)-dz*Math.cos(yaw))*Math.cos(pitch)+dy*Math.sin(pitch);
            if(depth>1900)oldCuts[k]++;
          });
        }
      }
      assert.ok(range+64<LANDSCAPE_ATMOSPHERE_CONFIG.cameraFar,'all loaded summits fit behind the far plane at every camera heading');
      console.log(JSON.stringify({horizonMaximumDistance:range,oldFarPlaneCutsAt12_27_49Degrees:oldCuts,
        cameraFar:LANDSCAPE_ATMOSPHERE_CONFIG.cameraFar}));
    }
    runs.push({name,ms:+(performance.now()-start).toFixed(1),heightEvaluations:samples-before,updates,
      geometryBytes:terrain.approxGeometryBytes,cache:terrain.cacheStatistics});
  }
  console.log(JSON.stringify(runs));
  terrain.dispose();scene.dispose();engine.dispose();world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1;});
