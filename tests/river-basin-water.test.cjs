const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
(async()=>{
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async u=>{const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,s,h);setActiveGeography(world);await world.prepareAround(-2086,242);
 assert.equal(world.riverBasins.length,1);
 const basin=world.riverBasins[0];assert.equal(basin.stats.boundaryContacts,0);assert.ok(basin.stats.bytes<20000);
 for(const [x,z,height] of [[-2086,200,-5.205632597892524],[-2104,180,-7.688552069980848],[-2090,180,-6.602157475402144],[-2080,180,-6.139870685893662],[-2050,120,-6.553395578596387]]){
  assert.ok(Math.abs(world.surface.heightAt(x,z)-height)<1e-9,'approved terrain must not move');
  assert.equal(world.waterAt(x,z)?.kind,'stream','the flooded basin must share the river surface');
  assert.equal(world.waterAt(x,z)?.level,1);assert.equal(world.oceanExclusion.valueAt(x,z),1,'no ocean through the basin');
  assert.ok(world.waterNear(Math.floor(x/72),Math.floor(z/72),72));
 }
 assert.equal(world.waterAt(-2086,242),null,'dry shore stays dry');
 assert.equal(world.waterAt(-2030,300),null,'separate dry ground stays dry');
 assert.equal(world.oceanExclusion.valueAt(-2030,300),0,'do not extend the mask beyond the basin');
 assert.equal(world.flowAt(-2050,120).velocity,0,'calm basin must not inherit a distant native stream current');
 assert.equal(world.flowAt(-2136,142).velocity,1.4,'existing channel current is retained');
 assert.ok(Math.abs(world.surface.heightAt(-2090,742)+4.119444368619329)<1e-9);
 let checked=0;
 for(let z=basin.bounds[1]+4;z<basin.bounds[3];z+=8)for(let x=basin.bounds[0]+4;x<basin.bounds[2];x+=8){
  if(basin.valueAt(x,z)<=.5)continue;
  assert.ok(world.waterFieldAt(x,z),'no hole in the shared basin domain');
  assert.ok(world.oceanExclusion.valueAt(x,z)>.5,'inland owner excludes the ocean');checked++;
 }
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('basin-test',scene),water=new GeographyStream(scene,root);
 for(const lod of ['near','far'])for(const [cx,cz] of [[-30,2],[-29,2],[-29,1]]){
  const build=water.createWater(cx,cz,lod==='near'?3:12,lod);let next;do{next=build.next()}while(!next.done);
  const mesh=next.value;assert.ok(mesh,'both LODs cover the formerly ocean-owned basin');
  assert.equal(mesh.material,water.material,'the channel and flooded basin use the same water shader');
  const p=mesh.getVerticesData('position');for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i+1]-1.035)<1e-6,'one horizontal water datum');
  mesh.dispose();
 }
 water.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
 console.log(`River basin: ${checked} shared ownership samples; unchanged bed, shore, current and near/far water datum.`);
})().catch(e=>{console.error(e);process.exitCode=1});
