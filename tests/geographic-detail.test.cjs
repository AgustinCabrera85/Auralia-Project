const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {terrainTileTopology,featureTerrainTopology,terrainInteriorSubdivisions}=require('../.test-build/world/terrainTileTopology.js');
const {nearTerrainHeightAt,TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');
(async()=>{
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async u=>{const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,s,h);await world.prepareAround(-2399,-1630);
 const report={spacing:world.meshSpacing,errors:{},topology:[],rockBed:null};
 const height=(x,z)=>world.heightAt(x,z);
 for(const step of [6,3]){
  const errors=[];
  for(let z=-1750.17;z<-1550;z+=1.71)for(let x=-2520.31;x<-2300;x+=1.73){
   const f=world.waterFieldAt(x,z);if(!f||Math.abs(height(x,z)-f.level)>3)continue;
   errors.push(Math.abs(nearTerrainHeightAt(x,z,height,step)-height(x,z)));
  }
  assert.ok(errors.length>100);errors.sort((a,b)=>a-b);
  report.errors[step]={samples:errors.length,mean:errors.reduce((a,b)=>a+b,0)/errors.length,p95:errors[Math.floor(errors.length*.95)],max:errors.at(-1)};
 }
 assert.ok(report.errors[3].p95<report.errors[6].p95*.6,'finer shore triangles reduce actual height error');
 for(const lod of ['near','mid','far'])for(const refined of [false,true]){
  const t=refined?featureTerrainTopology(lod,(x,z)=>Math.abs(x-z)<12,3):terrainTileTopology(lod,3);
  const edges=new Map();
  for(let i=0;i<t.indices.length;i+=3){
   const tri=t.indices.slice(i,i+3),[a,b,c]=tri.map(j=>t.offsets[j]);
   assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0,'consistent non-degenerate winding');
   for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(k,(edges.get(k)||0)+1);}
  }
  let border=0;
  for(const [k,n] of edges){assert.ok(n===1||n===2);if(n===2)continue;
   const [a,b]=k.split(':').map(i=>t.offsets[+i]);
   assert.ok(a[0]===b[0]&&(a[0]===0||a[0]===t.size)||a[1]===b[1]&&(a[1]===0||a[1]===t.size),'no open internal seams');
   assert.equal(Math.hypot(a[0]-b[0],a[1]-b[1]),3);border++;
  }
  assert.equal(border,t.size/3*4);
  if(lod!=='near')assert.ok(t.offsets.length<(t.size/3+1)**2*.6,'coarse interiors stay bounded');
  report.topology.push({lod,refined,vertices:t.offsets.length,triangles:t.indices.length/3});
 }
 const x=-2760,z=-1517,y=height(x,z),f=world.waterFieldAt(x,z),w=world.weightsAt(x,z,y,0);
 assert.ok(f&&f.level>y,'reported riverbed is submerged');assert.ok(w[2]>.8&&w[0]<.01,'rock replaces underwater grass');
 assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);report.rockBed={x,z,height:y,water:f.level,weights:w};
 await world.prepareAround(-2450,-807);
 const midStep=TERRAIN_LOD_CONFIG.midSize/TERRAIN_LOD_CONFIG.midSubdivisions;
 const farStep=TERRAIN_LOD_CONFIG.farSize/terrainInteriorSubdivisions('far',world.meshSpacing);
 assert.equal(farStep,midStep,'far and middle mountain interiors sample the same grid');
 for(let z=-1500;z<=-1300;z+=13)for(let x=-3300;x<=-3050;x+=13){
  const mid=nearTerrainHeightAt(x,z,height,midStep);
  const far=nearTerrainHeightAt(x,z,height,farStep);
  assert.ok(Math.abs(far-mid)<1e-7,'camera-prioritized far/mid swaps preserve mountain shape');
 }
 const mountain={x:-3228,z:-1380};
 const detailed=nearTerrainHeightAt(mountain.x,mountain.z,height,world.meshSpacing);
 const distant=nearTerrainHeightAt(mountain.x,mountain.z,height,farStep);
 assert.ok(Math.abs(distant-detailed)<12,'distant ridge no longer loses tens of metres');
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('mountain-lod',scene);
 const terrain=new TerrainStream(scene,root,{},world),rendered=[];
 for(const lod of ['near','mid','far']){
  const size=TERRAIN_LOD_CONFIG[`${lod}Size`];
  const mesh=terrain.createTile(lod,{cx:Math.floor(mountain.x/size),cz:Math.floor(mountain.z/size)});
  mesh.isPickable=true;mesh.computeWorldMatrix(true);
  const ray=new Ray(new Vector3(mountain.x,detailed+500,mountain.z),new Vector3(0,-1,0),900);
  const hit=scene.pickWithRay(ray,candidate=>candidate===mesh);
  assert.ok(hit?.hit,`${lod} mountain tile is renderable`);
  rendered.push({lod,height:hit.pickedPoint.y});mesh.dispose();
 }
 assert.ok(Math.abs(rendered[1].height-rendered[2].height)<.001,'rendered far and middle ridges keep one silhouette');
 assert.ok(Math.abs(rendered[0].height-rendered[2].height)<12,'distant rendered ridge follows the canonical mountain');
 terrain.dispose();scene.dispose();engine.dispose();
 await fs.mkdir('artifacts/geographic-source/water-review',{recursive:true});await fs.writeFile('artifacts/geographic-source/water-review/geometry.json',JSON.stringify(report,null,2));
 world.dispose();console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
