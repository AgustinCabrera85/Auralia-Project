const fs=require('node:fs');
const assert=require('node:assert/strict');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {findPlaceArrival}=require('../.test-build/world/geography/PlayablePlaces.js');
const {NACAR_PALACE,inNacarPalaceFootprint}=require('../.test-build/world/geography/NacarPalace.js');
const {BRISALIA_BUILDINGS,CASTLE_BUILDING,BRISALIA_SCALE,brisaliaRoadEdge}=require('../.test-build/world/brisaliaLayout.js');
const {castlePlantsForChunk}=require('../.test-build/world/BrisaliaCastlePlanting.js');
const {MAINLAND}=require('../.test-build/world/terrainData.js');
const {brisaliaWayfinding}=require('../.test-build/world/wayfindingData.js');
const read=n=>JSON.parse(fs.readFileSync('public/auralia-preview/data/'+n+'.json','utf8'));
(async()=>{
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology,read('reinos_v3_7'));
  assert.equal(BRISALIA_BUILDINGS.length,27);
  assert.ok(BRISALIA_BUILDINGS.every(b=>b.id!=='B28'));
  assert.ok(brisaliaRoadEdge(CASTLE_BUILDING.x,-69*BRISALIA_SCALE)>20,'old palace spur removed');
  assert.ok(brisaliaWayfinding(world.town).every(s=>!s.id.startsWith('castle')&&s.routes.every(r=>r.label!=='Castillo')));
  const old={x:world.town.x+CASTLE_BUILDING.x,z:world.town.z+CASTLE_BUILDING.z};
  assert.ok(Math.abs(world.heightAt(old.x,old.z)-world.stats.townHeight)<1e-6,'no old raised courtyard');
  await world.prepare([1300,-680,1620,-360]);
  assert.ok(world.palace.groundHeight>world.waterFieldAt(NACAR_PALACE.x,NACAR_PALACE.z).level+10);
  let supportSamples=0;
  for(let dx=-95;dx<=95;dx+=5)for(let dz=-86;dz<=90;dz+=5){
    const x=NACAR_PALACE.x+dx,z=NACAR_PALACE.z+dz,y=world.surface.heightAt(x,z);
    assert.ok(y>=world.palace.groundHeight-.01,'no unsupported wall/tower base');
    assert.equal(world.waterAt(x,z),null,'palace platform remains dry');
    if(inNacarPalaceFootprint(x,z))assert.ok(world.vegetationClearanceAt(x,z)<=0,'castle clears grass and trees');
    supportSamples++;
  }
  const support={town:world.town,sample:(x,z)=>world.surface.surfaceAt(x,z),waterLevel:(x,z)=>world.waterAt(x,z)?.level??null};
  for(const id of ['isla-nacar','palacio-nacar']){
    const arrival=findPlaceArrival(world.destination(id),support);
    assert.ok(arrival&&!inNacarPalaceFootprint(arrival.x,arrival.z,1.5),'arrival outside walls');
    assert.ok(Math.abs(arrival.x-NACAR_PALACE.x)<1,'arrival faces gate');
  }
  const plantsAt=(point)=>{const result=[],size=MAINLAND.chunkSize;
    for(let x=Math.floor((point.x-150)/size);x<=Math.ceil((point.x+150)/size);x++)
      for(let z=Math.floor((point.z-150)/size);z<=Math.ceil((point.z+150)/size);z++)
        result.push(...castlePlantsForChunk(x,z,NACAR_PALACE,[],(xx,zz)=>world.surface.heightAt(xx,zz)));
    return result;};
  const plants=plantsAt(NACAR_PALACE);
  assert.ok(plants.length>100,'wall planting followed castle');
  assert.equal(plantsAt(old).length,0,'no floating border plants left in Brisalia');
  assert.equal(world.locationNameAt(NACAR_PALACE.x,NACAR_PALACE.z),'Palacio de Nácar');
  assert.ok(world.mapMarkup().includes('data-place="palacio-nacar"'));
  console.log(`PASS: palace relocation, ${supportSamples} terrain supports, ${plants.length} border plants, map arrivals and old site cleanup`);
  world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1;});
