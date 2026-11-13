const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {terrainTileTopology,featureTerrainTopology}=require('../.test-build/world/terrainTileTopology.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
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
 await fs.mkdir('artifacts/geographic-source/water-review',{recursive:true});await fs.writeFile('artifacts/geographic-source/water-review/geometry.json',JSON.stringify(report,null,2));
 world.dispose();console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
