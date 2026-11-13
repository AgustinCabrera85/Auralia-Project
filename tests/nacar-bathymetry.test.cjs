const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {GeographicSurface}=require('../.test-build/world/geography/GeographicSource.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');

(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,splines,hydrology),lake=world.lakes.find(l=>l.id==='nacar'),original=new GeographicSurface(source);
 setActiveGeography(world);await world.prepare(lake.bounds);
 const report={sampleStep:24,waterLevel:lake.level,samples:0,protectedSamples:0,drySamples:0,depthBefore:[],depthAfter:[],max:{depth:0},points:[],lod:[],mask:world.stats.nacarBathymetry};
 for(let z=Math.ceil(lake.bounds[1]/24)*24;z<lake.bounds[3];z+=24)for(let x=Math.ceil(lake.bounds[0]/24)*24;x<lake.bounds[2];x+=24){
  if(world.lakeAt(x,z)?.id!=='nacar')continue;
  const before=original.heightAt(x,z),after=world.surface.heightAt(x,z),depth=lake.level-after;
  assert.ok(after<=before+1e-8,'bathymetry only excavates');report.samples++;
  if(lake.level-before<=3){assert.equal(after,before,'all shallow banks and island heights are preserved');report.protectedSamples++;}
  if(before>=lake.level){assert.equal(after,before);report.drySamples++;continue;}
  assert.equal(world.waterAt(x,z)?.level,lake.level,'waterline is not lifted');
  report.depthBefore.push(lake.level-before);report.depthAfter.push(depth);
  if(depth>report.max.depth)report.max={x,z,depth};
 }
 const summary=a=>{a.sort((a,b)=>a-b);return {n:a.length,min:a[0],median:a[Math.floor(a.length*.5)],p90:a[Math.floor(a.length*.9)],max:a.at(-1),over40:a.filter(x=>x>40).length,over60:a.filter(x=>x>60).length};};
 report.depthBefore=summary(report.depthBefore);report.depthAfter=summary(report.depthAfter);
 assert.ok(report.depthAfter.max>70&&report.depthAfter.max<=80.01,'deep living habitat, bounded to 80 m');
 assert.ok(report.depthAfter.over40>1000,'a basin rather than a single deep pit');
 assert.ok(report.protectedSamples>300&&report.drySamples>200);
 // Preserve the actual canonical triangles that intersect the waterline,
 // including narrow island contours between the coarser audit samples.
 let shoreTriangles=0;
 for(let z=Math.ceil(lake.bounds[1]/6)*6;z<lake.bounds[3]-6;z+=6)for(let x=Math.ceil(lake.bounds[0]/6)*6;x<lake.bounds[2]-6;x+=6){
  if(world.lakeAt(x,z)?.id!=='nacar')continue;
  const points=[[x,z],[x+6,z],[x,z+6],[x+6,z+6]].map(([x,z])=>({x,z,y:source.heightAt(x,z)}));
  for(const ids of [[0,1,2],[1,3,2]]){
   if(!ids.some(i=>points[i].y>=lake.level)||!ids.some(i=>points[i].y<lake.level))continue;
   for(const i of ids){const p=points[i];assert.equal(world.nacarBathymetry.heightAt(p.x,p.z,p.y),p.y,'shoreline triangle remains exactly unchanged');}
   shoreTriangles++;
  }
 }
 assert.ok(shoreTriangles>100);report.shoreTriangles=shoreTriangles;
 for(const [x,z] of [[1580,-688],[1373,-438],[400,-400],[1700,-1000],[2200,-600],[1710,-1340]]){
  report.points.push({x,z,before:lake.level-original.heightAt(x,z),after:lake.level-world.surface.heightAt(x,z),shoreDistance:world.nacarBathymetry.shoreDistanceAt(x,z)});
 }
 assert.equal(report.points[1].before,report.points[1].after,'approved island landmark unchanged');
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('nacar-test',scene),terrain=new TerrainStream(scene,root,{},world);
 for(const point of [...report.points.filter(p=>p.after>0),report.max])for(const lod of ['near','mid','far']){
  const size=TERRAIN_LOD_CONFIG[lod+'Size'],cell={cx:Math.floor(point.x/size),cz:Math.floor(point.z/size)};
  const start=performance.now(),mesh=terrain.createTile(lod,cell);mesh.isPickable=true;mesh.computeWorldMatrix(true);
  const hit=scene.pickWithRay(new Ray(new Vector3(point.x,100,point.z),new Vector3(0,-1,0),300),m=>m===mesh);
  assert.ok(hit?.hit,'the rendered lake bed exists');const expected=world.surface.heightAt(point.x,point.z),error=Math.abs(hit.pickedPoint.y-expected);
  assert.ok(error<(lod==='near'?.002:2),'LOD preserves the broad bathymetry: '+lod+' error '+error);
  const row={x:point.x,z:point.z,lod,error,vertices:mesh.getTotalVertices(),triangles:mesh.getTotalIndices()/3,generationMs:performance.now()-start};
  mesh.dispose();
  // Same topology before/after: deepening does not keep a denser continent.
  const profile=world.nacarBathymetry;world.nacarBathymetry=undefined;
  const oldMesh=terrain.createTile(lod,cell);world.nacarBathymetry=profile;
  assert.equal(oldMesh.getTotalVertices(),row.vertices);assert.equal(oldMesh.getTotalIndices()/3,row.triangles);oldMesh.dispose();report.lod.push(row);
 }
 // Continuous descent reaches the actual bottom, holds depth, then resurfaces.
 const {x,z}=report.max,bed=world.surface.heightAt(x,z),controller=new CharacterTraversalController();
 const collision={ground:()=>null,solidTop:()=>null,wall:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:(x,z)=>world.surface.heightAt(x,z),waterLevel:(x,z)=>world.waterAt(x,z)?.level??null};
 const input={moveX:0,moveZ:0,forwardX:0,forwardZ:1,horizontal:0,vertical:0,run:false,sprint:false,jumpPressed:false,swimVertical:0};
 controller.teleport(x,lake.level-1.65,z);controller.step(1/60,input,collision);
 for(let i=0;i<1500;i++)controller.step(1/60,{...input,swimVertical:-1},collision);
 const bottom=controller.position.y;assert.ok(Math.abs(bottom-bed-.3)<.01,'deep dive collides with the same bed');
 for(let i=0;i<120;i++)controller.step(1/60,input,collision);
 assert.ok(Math.abs(controller.position.y-bottom)<.01,'release holds depth');
 controller.step(1/60,{...input,jumpPressed:true},collision);
 for(let i=0;i<1500;i++)controller.step(1/60,input,collision);
 assert.ok(Math.abs(controller.position.y-(lake.level-1.65))<.01,'resurface from deepest point');
 report.swimming={bed,bottom,resurfaced:controller.position.y,mode:controller.mode};
 assert.ok(world.stats.residentTiles<=9);assert.ok(report.mask.bytes<400000);
 await world.prepareAround(world.town.x,world.town.z);await world.prepare(lake.bounds);
 assert.equal(world.surface.heightAt(x,z),bed,'unload/reload is deterministic');
 report.residentTiles=world.stats.residentTiles;
 await fs.mkdir('artifacts/geographic-source/nacar-depth',{recursive:true});await fs.writeFile('artifacts/geographic-source/nacar-depth/geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));terrain.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
})().catch(e=>{console.error(e);process.exitCode=1});
