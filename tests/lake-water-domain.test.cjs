const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
(async()=>{
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(m,s,h,async u=>{const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}),world=await PlayableWorld.create(source,s,h);
 const report={lakes:[],points:[],checked:0};
 for(const lake of world.lakes.filter(l=>l.domain)){
  const domain=lake.domain;console.log(lake.id,domain.stats);
  assert.equal(domain.stats.boundaryContacts,0,'the basin must close before the search boundary');
  assert.ok(domain.stats.bytes<250000,'ownership must stay compact');
  await world.prepare(domain.bounds);let wet=0,fringe=0;
  for(let z=domain.bounds[1]+4;z<domain.bounds[3];z+=12)for(let x=domain.bounds[0]+4;x<domain.bounds[2];x+=12){
   if(domain.valueAt(x,z)<=.5)continue;
   const f=world.waterFieldAt(x,z);assert.ok(f,'no holes in the shared domain');
   assert.ok(world.oceanExclusion.valueAt(x,z)>.5,'ocean excluded throughout the inland domain');
   report.checked++;
   if(world.surface.heightAt(x,z)<f.level){wet++;if(!world.lakeAt(x,z))fringe++;}
  }
  report.lakes.push({id:lake.id,...domain.stats,wet,fringe});
 }
 await world.prepareAround(1762,-1466);
 for(const [x,z,height] of [[1760,-1460,.8830965948552154],[1770,-1460,.9323353335258302],[1780,-1460,.7854488201738052],[1800,-1450,-.4821623983695933]]){
  assert.ok(Math.abs(world.surface.heightAt(x,z)-height)<1e-9,'repair must not move the approved terrain');
  const f=world.waterAt(x,z);assert.equal(f?.kind,'lake');assert.equal(f.level,1);
  assert.equal(world.oceanExclusion.valueAt(x,z),1,'reported blue strips no longer have an ocean owner');
  report.points.push({x,z,height,water:f,mask:1});
 }
 assert.ok(Math.abs(world.waterAt(1740,-1480).level-1.9954285622501842)<1e-9,'lake repair must not lift the adjoining river');
 assert.equal(world.waterAt(1760,-1500),null,'dry outer river shoulder stays dry');
 assert.ok(world.stats.residentTiles<=9);world.dispose();
 await fs.mkdir('artifacts/geographic-source/lake-shore',{recursive:true});await fs.writeFile('artifacts/geographic-source/lake-shore/geometry.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
