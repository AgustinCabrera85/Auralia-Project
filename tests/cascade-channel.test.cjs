const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Ray,Vector3}=require('@babylonjs/core');
const {StudioRivers}=require('../.test-build/world/geography/StudioRivers.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');

(async()=>{
 // A sloping valley must retain rising banks, not a flat ledge beside its fall.
 const steep=new StudioRivers([{id:'chute',type:'river',width:22,resolvedLevels:true,
  controlPoints:[{x:0,z:0,y:300},{x:0,z:300,y:0}]}],-100,()=>null);
 const bank=[];
 for(let x=20;x<=50;x+=3){
  const original=180+x*.8,h=steep.bedAt(x,150,original);
  assert.ok(h<=original,'incision never raises the original terrain');bank.push({x,h});
 }
 for(let i=1;i<bank.length;i++)assert.ok(bank[i].h-bank[i-1].h>1,
  'steep valley banks must rise continuously without a shelf');
 const uniform=new StudioRivers([{id:'uniform-fall',type:'river',width:22,resolvedLevels:true,
  controlPoints:Array.from({length:8},(_,i)=>({x:0,z:i*50,y:350-i*50}))}],-100,()=>null);
 for(let z=65;z<=285;z+=.5)for(const x of [-18,0,18])
  assert.ok(Math.abs(uniform.at(x,z).level-(350-z))<1e-9,
   'control points must not introduce terraces into a uniform downhill grade');
 // Gentle river profiles remain exactly the same as before the cascade change.
 const gentle=new StudioRivers([{id:'flat',type:'river',width:22,resolvedLevels:true,
  controlPoints:[{x:0,z:0,y:10},{x:0,z:300,y:10}]}],0,()=>null);
 const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
 for(let x=0;x<64;x+=.5){const base=30,bed=10-5.76,crest=14.32;
  const channel=bed+(crest-bed)*smooth(4.95,25,x);
  assert.ok(Math.abs(gentle.bedAt(x,150,base)-Math.min(base,channel+(base-channel)*smooth(25,63,x)))<1e-10);
 }
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async u=>{const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,s,h);await world.prepareAround(2129,-2538);
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('cascade-test',scene),terrain=new TerrainStream(scene,root,{},world);
 const meshes=new Map(),report={crossSections:0,lodChecks:0,minDepth:Infinity,maxLodError:0,bank};
 let previousLevel=Infinity;
 const route=world.runtimeSplines.find(s=>s.id==='rv-cumbres-nacar');
 for(let i=1;i<route.controlPoints.length;i++){
  const a=route.controlPoints[i-1],b=route.controlPoints[i];
  if(a.z< -3000||b.z> -2380)continue;
  const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/4);
  for(let j=0;j<steps;j++){
   const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,r=world.rivers.at(x,z);report.crossSections++;
   assert.ok(r.level<=previousLevel+.001,'cascade never flows uphill');previousLevel=r.level;
   for(const across of [-.9,0,.9]){
    const px=x+r.dz*r.width*across,pz=z-r.dx*r.width*across;
    const level=world.waterFieldAt(px,pz)?.level;assert.ok(Number.isFinite(level),'continuous water footprint');
    const ground=world.surface.heightAt(px,pz);report.minDepth=Math.min(report.minDepth,level-ground);
    assert.ok(level-ground>.25,'channel remains submerged across the fall');
    for(const lod of ['near','mid','far']){
     const size=TERRAIN_LOD_CONFIG[lod+'Size'],cell={cx:Math.floor(px/size),cz:Math.floor(pz/size)},key=`${lod}:${cell.cx}:${cell.cz}`;
     let mesh=meshes.get(key);if(!mesh){mesh=terrain.createTile(lod,cell);mesh.isPickable=true;mesh.computeWorldMatrix(true);meshes.set(key,mesh);}
     const hit=scene.pickWithRay(new Ray(new Vector3(px,level+100,pz),new Vector3(0,-1,0),200),m=>m===mesh);
     assert.ok(hit.hit,'terrain ray hit');const error=Math.abs(hit.pickedPoint.y-ground);
     report.maxLodError=Math.max(report.maxLodError,error);assert.ok(error<.002,'same physical channel at every LOD');report.lodChecks++;
    }
   }
  }
 }
 assert.ok(report.crossSections>100);assert.ok(world.stats.residentTiles<=9);
 await fs.mkdir('artifacts/geographic-source/cascade',{recursive:true});
 await fs.writeFile('artifacts/geographic-source/cascade/geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));for(const mesh of meshes.values())mesh.dispose();terrain.dispose();scene.dispose();engine.dispose();world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1});
