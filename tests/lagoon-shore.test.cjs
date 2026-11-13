const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld,regionPoint}=require('../.test-build/world/geography/PlayableWorld.js');
const {CASCADE_LAGOON:l,LAGOON_FALLS,lagoonChannelAt,applyLagoonRelief}=require('../.test-build/world/lagoonData.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {OceanWater}=require('../.test-build/world/water/OceanWater.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {TERRAIN_LOD_CONFIG:config}=require('../.test-build/world/terrainLod.js');
(async()=>{
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async u=>{const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}),world=await PlayableWorld.create(source,s,h);
 await world.prepareAround(-2936,-827);setActiveGeography(world);
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('lagoon-shore-test',scene);
 const terrain=new TerrainStream(scene,root,{},world),water=new GeographyStream(scene,root),ocean=new OceanWater(scene),meshes=new Map();
 const report={perimeterSamples:0,waterChecks:0,lodChecks:0,maxLodError:0,maxShoreRadiusErrorMeters:0,shoreSections:0,waterMeshes:[],impacts:[]};
 const level=l.level+world.lagoon.y;
 // Entire basin perimeter, including every position of the translated grid.
 for(let angle=0;angle<Math.PI*2;angle+=Math.PI/180){
  for(const r of [.98,1.01,1.025,1.045,1.075]){
   const p=regionPoint(world.lagoon,l.x+Math.cos(angle)*l.radiusX*r,l.z+Math.sin(angle)*l.radiusZ*r);
   assert.equal(world.oceanExclusion.valueAt(p.x,p.z),1,'no ocean crests through the basin shore');report.perimeterSamples++;
   if(world.surface.heightAt(p.x,p.z)<level){assert.ok(world.waterAt(p.x,p.z),'wet shore has inland water');report.waterChecks++;}
  }
  // Compare the rendered shoreline with the authoritative, smooth relief.
  const local={x:l.x+Math.cos(angle)*l.radiusX*1.025,z:l.z+Math.sin(angle)*l.radiusZ*1.025};
  const channel=lagoonChannelAt(local.x,local.z);
  if(channel.distance<channel.width+120||LAGOON_FALLS.some(f=>Math.hypot(local.x-f.x,local.z-f.z)<70))continue;
  let lo=.98,hi=1.075;
  for(let i=0;i<24;i++){const r=(lo+hi)/2,p=regionPoint(world.lagoon,l.x+Math.cos(angle)*l.radiusX*r,l.z+Math.sin(angle)*l.radiusZ*r);if(world.surface.heightAt(p.x,p.z)<level)lo=r;else hi=r;}
  const error=Math.abs((lo+hi)/2-1.025)*l.radiusX*world.lagoon.scale;
  report.maxShoreRadiusErrorMeters=Math.max(report.maxShoreRadiusErrorMeters,error);report.shoreSections++;
  assert.ok(error<.2,'shoreline does not zigzag by metres between six-metre vertices');
 }
 assert.ok(report.shoreSections>40);
 // The old step at the bank must be continuous even before tessellation.
 const a=applyLagoonRelief(l.x-l.radiusX*(1.025-1e-7),l.z,100,24),b=applyLagoonRelief(l.x-l.radiusX*(1.025+1e-7),l.z,100,24);
 assert.ok(Math.abs(a-b)<.00001,'no 1.5 m jump at the waterline');
 for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
  for(const r of [1.0,1.025,1.05]){
   const p=regionPoint(world.lagoon,l.x+Math.cos(angle)*l.radiusX*r,l.z+Math.sin(angle)*l.radiusZ*r),ground=world.surface.heightAt(p.x,p.z);
   for(const lod of ['near','mid','far']){
    const size=config[lod+'Size'],cell={cx:Math.floor(p.x/size),cz:Math.floor(p.z/size)},key=`${lod}:${cell.cx}:${cell.cz}`;
    let mesh=meshes.get(key);if(!mesh){mesh=terrain.createTile(lod,cell);mesh.isPickable=true;mesh.computeWorldMatrix(true);meshes.set(key,mesh);}
    const hit=scene.pickWithRay(new Ray(new Vector3(p.x,ground+100,p.z),new Vector3(0,-1,0),200),m=>m===mesh);assert.ok(hit.hit);
    const error=Math.abs(hit.pickedPoint.y-ground);report.maxLodError=Math.max(report.maxLodError,error);report.lodChecks++;
    assert.ok(error<.002,'shore and collider match at each terrain LOD');
   }
  }
 }
 for(const [x,z] of [[-2936,-827],[-2966,-849],...LAGOON_FALLS.map(f=>{const p=regionPoint(world.lagoon,f.x,f.z+f.run+4);return [p.x,p.z]})]){
  const cx=Math.floor(x/72),cz=Math.floor(z/72);
  for(const lod of ['near','far']){
   const build=water.createWater(cx,cz,3,lod);let result;do{result=build.next()}while(!result.done);
   const mesh=result.value;assert.ok(mesh);const positions=mesh.getVerticesData('position');
   for(let i=0;i<positions.length;i+=3){
    const f=world.waterFieldAt(positions[i],positions[i+2]);assert.ok(f,'water has exactly one geographic owner');
    assert.ok(world.oceanExclusion.valueAt(positions[i],positions[i+2])>.5,'both ocean LODs excluded at every inland vertex');
    assert.ok(Math.abs(positions[i+1]-f.level-.035)<.002,'no lifted water or bent skirt');
   }
   report.waterMeshes.push({x,z,lod,triangles:mesh.getTotalIndices()/3});mesh.dispose();
  }
 }
 water.update(1/30);
 assert.equal(water.poolMaterial._floats.uImpactEnabled,1,'migrated pool receives cascade impacts');
 assert.equal(ocean.nearMaterial._textures.uInlandMask,ocean.farMaterial._textures.uInlandMask);
 for(const [i,impact] of world.waterImpacts.entries()){
  const p=water.impacts[i];assert.equal(p.x,impact.x);assert.equal(p.y,impact.z);assert.equal(p.z,impact.radius);
  assert.ok(world.waterAt(impact.x,impact.z+2),'impact meets actual receiving water');report.impacts.push(impact);
 }
 assert.ok(world.stats.residentTiles<=9);
 await fs.mkdir('artifacts/geographic-source/lagoon-shore',{recursive:true});await fs.writeFile('artifacts/geographic-source/lagoon-shore/geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));for(const mesh of meshes.values())mesh.dispose();water.dispose();ocean.dispose();terrain.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
})().catch(e=>{console.error(e);process.exitCode=1});
