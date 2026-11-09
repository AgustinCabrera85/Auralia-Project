// Same real collider queries and scene for before/after; no renderer/GPU claims.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),os=require('node:os');
const B=require('@babylonjs/core');
const exportsTS={};
const compiler={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022};
function load(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:compiler}).outputText,
  {exports:out,require:id=>id==='@babylonjs/core'?B:load(require('node:path').resolve(require('node:path').dirname(file),id+'.ts'))});return out;}
Object.assign(exportsTS,load('src/world/TreeColliderSystem.ts'));
const engine=new B.NullEngine(),scene=new B.Scene(engine);
const source=B.MeshBuilder.CreateCylinder('trunk',{height:8,diameter:1.2,tessellation:8},scene);
source.bakeTransformIntoVertices(B.Matrix.Translation(0,4,0));source.isVisible=false;
const system=new exportsTS.TreeColliderSystem(scene,()=>source);
// Preserve the former query path so the baseline remains reproducible after
// the production implementation changes. Geometry and rays are identical.
const legacy=process.argv.includes('--legacy');
if(legacy)system.queryWall=function(x,y,z,dirX,dirZ,maxDistance){
  const length=Math.hypot(dirX,dirZ);if(length<1e-8||maxDistance<=0)return null;
  const nx=dirX/length,nz=dirZ/length,candidates=new Map();
  for(const entry of this.colliders.values())if(Math.hypot(entry.placement.x-x,entry.placement.z-z)<=entry.radius+maxDistance)candidates.set(entry.instance,entry);
  if(!candidates.size)return null;
  const ray=new B.Ray(new B.Vector3(x,y,z),new B.Vector3(nx,0,nz),maxDistance);
  const hits=scene.multiPickWithRay(ray,m=>candidates.has(m))??[];
  for(const hit of hits.sort((a,b)=>a.distance-b.distance)){
    const entry=candidates.get(hit.pickedMesh),point=hit.pickedPoint,normal=hit.getNormal(true);
    if(!entry||!point||!normal||y<entry.placement.y+1.25||normal.y>=.75)continue;
    const fromRadius=Math.hypot(x-entry.placement.x,z-entry.placement.z),outward=(x-entry.placement.x)*nx+(z-entry.placement.z)*nz;
    if(fromRadius<entry.trunkRadius&&outward>0)continue;if(normal.x*nx+normal.z*nz>0)normal.scaleInPlace(-1);
    return {point,distance:hit.distance,normal,id:this.key(entry.placement)};
  }return null;
};
const placements=[];
for(let z=-24;z<=24;z+=4)for(let x=-24;x<=24;x+=4)placements.push({kind:'arbolito1',x,y:0,z,scale:1,yaw:0});
system.sync(placements,0,0);
for(let i=0;i<4000;i++){const m=B.MeshBuilder.CreateBox('unrelated',{size:1},scene);m.position.set(100+i,0,100);m.computeWorldMatrix(true);}
let checksum=0;
const batch=()=>{for(let i=0;i<200;i++){const x=(i%11-5)*4;checksum+=system.queryWall(x-2,2,0,1,0,3)?.distance??0;}};
for(let i=0;i<15;i++)batch();
const samples=[];for(let i=0;i<60;i++){const t=performance.now();batch();samples.push((performance.now()-t)/200);}
samples.sort((a,b)=>a-b);const q=p=>samples[Math.floor((samples.length-1)*p)];
const result={date:new Date().toISOString(),mode:legacy?'legacy scene scan':'spatial index + direct mesh query',node:process.version,cpu:os.cpus()[0].model,sceneMeshes:scene.meshes.length,colliders:placements.length,warmupQueries:3000,measuredQueries:12000,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),checksum};
console.log(JSON.stringify(result,null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
system.dispose();scene.dispose();engine.dispose();
