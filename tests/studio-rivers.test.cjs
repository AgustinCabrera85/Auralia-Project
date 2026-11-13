const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');
const {featureTerrainTopology}=require('../.test-build/world/terrainTileTopology.js');

(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,splines,hydrology);setActiveGeography(world);
 // The global ocean mask may query unloaded sectors without loading heights.
 const resident=world.stats.residentTiles;
 for(let z=-7000;z<=7000;z+=125)for(let x=-7000;x<=7000;x+=125)assert.equal(typeof world.waterMaskAt(x,z),'boolean');
 assert.equal(world.stats.residentTiles,resident);
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('river-test',scene),terrain=new TerrainStream(scene,root,{},world);
 const report={lodChecks:0,maxLodHeightError:0,sections:[],topology:[]};
 // Every edge either has two incident triangles or lies on the outer tile.
 for(const lod of ['mid','far']){
  const topo=featureTerrainTopology(lod,(x,z,s)=>x<100&&x+s>65&&z<170),edges=new Map();let area=0;
  for(let i=0;i<topo.indices.length;i+=3){const ids=topo.indices.slice(i,i+3),[a,b,c]=ids.map(n=>topo.offsets[n]);
   const ar=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;assert.ok(ar>0);area+=ar;
   for(let j=0;j<3;j++){const k=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(k,(edges.get(k)??0)+1);}}
  assert.ok(Math.abs(area-topo.size**2)<1e-6);
  for(const [key,count] of edges){assert.ok(count===1||count===2);if(count===2)continue;
   const [a,b]=key.split(':').map(n=>topo.offsets[Number(n)]);
   assert.ok(a[0]===b[0]&&(a[0]===0||a[0]===topo.size)||a[1]===b[1]&&(a[1]===0||a[1]===topo.size),'no interior T-junction');}
  report.topology.push({lod,vertices:topo.offsets.length,triangles:topo.indices.length/3});
 }
 for(const point of [{x:-1501,z:1584},{x:-2309,z:1706},{x:-2351,z:1817}]){
  await world.prepareAround(point.x,point.z);
  const river=world.rivers.at(point.x,point.z);assert.ok(river);
  const row={point,center:{x:river.x,z:river.z},level:river.level,depth:river.level-world.surface.heightAt(river.x,river.z),lod:[]};
  assert.ok(row.depth>4.5,'real center depth exceeds 4.5 m');
  for(const lod of ['near','mid','far']){
   const size=TERRAIN_LOD_CONFIG[lod+'Size'],cell={cx:Math.floor(river.x/size),cz:Math.floor(river.z/size)};
   const mesh=terrain.createTile(lod,cell);mesh.isPickable=true;mesh.computeWorldMatrix(true);
   for(let j=-4;j<=4;j++){
    const x=river.x+river.dz*j,z=river.z-river.dx*j;
    if(Math.floor(x/size)!==cell.cx||Math.floor(z/size)!==cell.cz)continue;
    const expected=world.surface.heightAt(x,z),ray=new Ray(new Vector3(x,river.level+100,z),new Vector3(0,-1,0),200);
    const hit=scene.pickWithRay(ray,m=>m===mesh);assert.ok(hit?.hit,lod+' ray hits');
    const error=Math.abs(hit.pickedPoint.y-expected);report.maxLodHeightError=Math.max(report.maxLodHeightError,error);
    assert.ok(error<.002,lod+' preserves actual bed, no distant dam');assert.ok(hit.pickedPoint.y<river.level-4);
    report.lodChecks++;
   }
   row.lod.push({lod,vertices:mesh.getTotalVertices(),triangles:mesh.getTotalIndices()/3});mesh.dispose();
  }report.sections.push(row);
 }
 await world.prepareAround(-1501,1584);
 const water=new GeographyStream(scene,root),meshes=[];
 for(const lod of ['near','far']){
  const build=water.createWater(-22,22,lod==='near'?3:12,lod);let next;do{next=build.next()}while(!next.done);
  const mesh=next.value;assert.ok(mesh);meshes.push(mesh);
  assert.equal(mesh.material.needAlphaBlending(),true,'latest clear watershed optics');
  const p=mesh.getVerticesData('position');
  for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i+1]-world.waterFieldAt(p[i],p[i+2]).level-.035)<.001,'river stays on waterline, no hanging bank curtain');
 }
 assert.deepEqual(Array.from(meshes[0].getVerticesData('position')),Array.from(meshes[1].getVerticesData('position')),'water LOD edges and stations agree');
 report.water={vertices:meshes[0].getTotalVertices(),triangles:meshes[0].getTotalIndices()/3,clear:true,verticalCurtains:false};
 // Cancel a partially built refined tile before unloading its source window.
 terrain.update(-1501,1584);
 for(let i=0;i<100&&!terrain.activeBuild;i++)terrain.update(-1501,1584);
 assert.ok(terrain.activeBuild,'dense work is split across frames');
 const oldBuild=terrain.activeBuild;
 await world.prepareAround(5200,-3700);terrain.update(5200,-3700);
 assert.notEqual(terrain.activeBuild,oldBuild,'teleport cancels stale height queries');
 assert.equal(terrain.coverageAt(5200,-3700),'near','teleport retains immediate playable coverage');
 assert.ok(world.stats.residentTiles<=9);report.source=world.stats;
 await fs.mkdir('artifacts/geographic-source/water-union',{recursive:true});await fs.writeFile('artifacts/geographic-source/water-union/terrain-lod.json',JSON.stringify(report,null,2));
 for(const m of meshes)m.dispose();water.dispose();terrain.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
