const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {WorldStudioSource,GeographicDataUnavailable}=require('../.test-build/world/geography/WorldStudioSource.js');
const {GeographicSurface,legacyGeography}=require('../.test-build/world/geography/GeographicSource.js');
const {geographicTraversal}=require('../.test-build/world/geography/GeographicTraversal.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const load=async name=>JSON.parse(await readFile(`public/auralia-preview/data/${name}`,'utf8'));
const input={moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,run:false,sprint:false,jumpPressed:false};
(async()=>{
  const [manifest,splines,hydrology]=await Promise.all(['manifest.json','splines.json','hidrologia_v3_6.json'].map(load));
  const read=async url=>{const b=await readFile(`public${url}`);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
  const source=new WorldStudioSource(manifest,splines,hydrology,read),surface=new GeographicSurface(source);
  assert.throws(()=>source.heightAt(-1100,1900),GeographicDataUnavailable,'missing height data must never become legacy terrain or zero');
  assert.equal(source.isReady([8000,8000,9000,9000]),false);
  const broken=new WorldStudioSource(manifest,splines,hydrology,async()=>{throw new Error('offline');});
  await assert.rejects(()=>broken.prepare([-1300,1500,-1200,1600]),/offline/);
  assert.equal(broken.isReady([-1300,1500,-1200,1600]),false);
  assert.throws(()=>broken.heightAt(-1250,1550),GeographicDataUnavailable);broken.dispose();
  await assert.rejects(()=>source.prepare([-7000,-7000,7000,7000]),/budget/,'whole continent must not be resident');
  const region=(x,z)=>[x-2160,z-2160,x+2160,z+2160];
  await source.prepare(region(-1100,1900));
  assert.ok(source.stats.residentTiles<25&&source.stats.heightBytes<=9*640*640*2);
  const samples=[];let changed=0;
  for(let z=1720;z<2100;z+=17)for(let x=-1300;x<-600;x+=19){
    const base=source.baseHeightAt(x,z),h=source.heightAt(x,z),mask=source.detailMaskAt(x,z);
    assert.ok(Math.abs(h-base)<=1.250001);
    if(mask===0)assert.equal(h,base,'protected samples remain exactly authored');
    if(Math.abs(h-base)>.02)changed++;
    samples.push([x,z,h]);
  }
  assert.ok(changed>80,'detail must add actual deterministic relief to unprotected land');
  assert.equal(source.heightAt(-1250,1920),source.baseHeightAt(-1250,1920),'approved Brisalia anchor protected');
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('test-authority',scene);
  const stream=new TerrainStream(scene,root,{},source);
  assert.equal(stream.residentFarCount,0,'new source must not allocate continental far coverage');
  const settle=(x,z)=>{for(let i=0;i<400;i++){stream.update(x,z);if(!stream.pendingCount)break;}assert.equal(stream.pendingCount,0);};
  settle(-1100,1900);
  assert.equal(stream.coverageAt(-1100,1900),'near');
  assert.ok(stream.residentFarCount<200,'far geometry is a local window');
  const firstMeshes=scene.meshes.length;
  let rayChecks=0;
  for(let z=1860;z<1950;z+=11.7)for(let x=-1150;x<-1050;x+=13.1){
    const expected=surface.heightAt(x,z),ray=new Ray(new Vector3(x,expected+100,z),new Vector3(0,-1,0),200);
    const hit=scene.pickWithRay(ray,m=>m.isEnabled()&&m.metadata?.terrainLod==='near');
    assert.ok(hit?.hit,'near render mesh must cover the collision point');
    assert.ok(Math.abs(hit.pickedPoint.y-expected)<.001,'actual triangle picking agrees with collision/placement source');rayChecks++;
  }
  const controller=new CharacterTraversalController(),world=geographicTraversal(surface,()=>true);
  controller.teleport(-1100,surface.heightAt(-1100,1900),1900);
  for(let i=0;i<120;i++)controller.step(1/60,input,world);
  assert.ok(Math.abs(controller.position.y-surface.heightAt(controller.position.x,controller.position.z))<.06,'real controller rests on authoritative triangles');
  const pos={...controller.position},placement=surface.footprintAt(pos.x,pos.z,0);
  assert.equal(placement.height,surface.heightAt(pos.x,pos.z));
  for(const [x,z] of [[3400,-3400],[-3500,-3500],[-1100,1900]]){
    await source.prepare(region(x,z));settle(x,z);
    assert.ok(source.stats.residentTiles<=9&&scene.meshes.length<firstMeshes+150,'travel releases old source data and meshes');
    assert.equal(stream.coverageAt(x,z),'near');
  }
  for(const [x,z,h] of samples)assert.equal(source.heightAt(x,z),h,'detail is independent of tile load order and eviction');
  await source.prepare(region(1450,-520));
  for(const lake of hydrology.lakes){
    for(const [x,z] of lake.polygonXZ_m){if(!source.isReady([x-8,z-8,x+8,z+8]))continue;
      assert.equal(source.detailMaskAt(x,z),0,'approved lake boundary excludes detail');
      assert.equal(source.heightAt(x,z),source.baseHeightAt(x,z));
    }
  }
  for(const p of [[0,10],[-700,-1350],[350,-236]])assert.equal(legacyGeography.heightAt(...p),sampleMainlandHeight(...p),'default geography is unchanged');
  stream.dispose();assert.equal(scene.meshes.length,0);source.dispose();assert.equal(source.stats.heightBytes,0);engine.dispose();
  console.log(`Geographic source: ${samples.length} deterministic samples, ${changed} with detail; ${rayChecks} render/collision ray checks; masks, load budget, eviction and controller passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
