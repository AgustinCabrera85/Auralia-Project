const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {vegetationTouchesBeach}=require('../.test-build/world/geography/VegetationBeach.js');
const {brisaliaCherryTrees,brisaliaCherryCrown,inBrisaliaCherryDistrict,installBrisaliaCherryTrees}=require('../.test-build/world/BrisaliaCherryTrees.js');
const {BRISALIA_BUILDINGS,brisaliaRoadEdge,inBrisaliaFootprint}=require('../.test-build/world/brisaliaLayout.js');
const {vegetationForChunk}=require('../.test-build/world/vegetationData.js');
const {getWorldDocument,setWorldDocument,emptyWorldDocument,blocksAuthoredMovement}=require('../.test-build/world/editor/WorldEditState.js');
(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const world=await PlayableWorld.create(source,splines,hydrology);setActiveGeography(world);
 try{
  const town=world.town,plot={x:town.x-29,z:town.z+18,radius:28};
  const exclusions=[plot,...BRISALIA_BUILDINGS.map(b=>({x:town.x+b.x,z:town.z+b.z+b.footprintOffsetZ,radius:Math.hypot(b.width,b.depth)/2+2,buildingId:b.id}))];
  const trees=brisaliaCherryTrees(world,exclusions);
  assert.ok(trees.length>70&&trees.length<260,`bounded flowering city: ${trees.length}`);
  assert.equal(new Set(trees.map(p=>p.assetId)).size,3,'all three existing cherry variants');
  assert.deepEqual(trees,brisaliaCherryTrees(world,exclusions),'stable across reloads');
  for(const p of trees){
   const radius=brisaliaCherryCrown(p),x=p.x-town.x,z=p.z-town.z;
   assert.ok(brisaliaRoadEdge(x,z)>=radius+1&&!inBrisaliaFootprint(x,z,radius+2),'crowns clear streets and buildings');
   assert.ok(Math.hypot(p.x-plot.x,p.z-plot.z)>=plot.radius+radius,'construction clearing preserved');
  }
  const first=trees[0];assert.ok(!brisaliaCherryTrees(world,[...exclusions,{x:first.x,z:first.z,radius:10}]).some(p=>p.id===first.id),'saved structures override planting');
  setWorldDocument(emptyWorldDocument());installBrisaliaCherryTrees(world,exclusions);const count=getWorldDocument().assets.length;
  installBrisaliaCherryTrees(world,exclusions);assert.equal(getWorldDocument().assets.length,count,'install does not duplicate trees');
  assert.ok(blocksAuthoredMovement(first.x,first.z),'trunks participate in existing collisions');
  let generic=0;
  for(let z=town.z-490;z<town.z+220;z+=72)for(let x=town.x-460;x<town.x+640;x+=72)
   for(const p of vegetationForChunk(Math.floor(x/72),Math.floor(z/72)))if(p.kind.startsWith('arbolito')&&inBrisaliaCherryDistrict(p.x-town.x,p.z-town.z))generic++;
  assert.equal(generic,0,'city decorative canopy uses cherries');
  await world.prepare([1000,3700,2800,4700]);let outside=0,beachTrees=0;
  for(let z=3800;z<=4550;z+=72)for(let x=1100;x<=2700;x+=72)
   for(const p of vegetationForChunk(Math.floor(x/72),Math.floor(z/72)))if(p.kind.startsWith('arbolito')){
    if(vegetationTouchesBeach(world,p.x,p.z,0))beachTrees++;else outside++;
   }
  assert.equal(beachTrees,0,'repaired coast has no trees on sand');assert.ok(outside>0,'coastal grass hinterland retains trees');
  assert.ok(vegetationTouchesBeach(world,1704,4134,0));
  await world.prepare([1250,5200,1900,6100]);
  assert.ok(vegetationTouchesBeach(world,1600,5430,0),'island beach uses the same exclusion');
  assert.ok(!vegetationTouchesBeach(world,1600,5690,0),'island interior remains plantable');
  const edge={seaLevel:0,meshSpacing:3,heightAt:()=>5,weightsAt:x=>[x<5?1:0,0,0,x>=5?1:0,0,0]};
  assert.ok(!vegetationTouchesBeach(edge,0,0,0)&&vegetationTouchesBeach(edge,0,0,8),'crowns cannot overhang sand');
  console.log(JSON.stringify({cherries:trees.length,variants:3,beachTrees,retainedCoastalTrees:outside,deterministic:true}));
 }finally{setActiveGeography(null);}
})().catch(e=>{console.error(e);process.exitCode=1;});
