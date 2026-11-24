const assert=require('node:assert/strict');
const fs=require('node:fs');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {vegetationForChunk}=require('../.test-build/world/vegetationData.js');
const {MAINLAND}=require('../.test-build/world/terrainData.js');
const {generateGrassPatch}=require('../.test-build/world/grass/GrassPatchData.js');
const read=n=>JSON.parse(fs.readFileSync(`public/auralia-preview/data/${n}.json`,'utf8'));

(async()=>{
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology,read('reinos_v3_7'));
  try {
    setActiveGeography(world);
    // Several kilometres of dry interior, not a small patch around its label.
    for(const [x,z] of [[-6000,-4500],[-3600,-4500],[-4800,-5500],[-4800,-3500]]){
      assert.equal(world.desertAt(x,z),1);
      const flat=world.weightsAt(x,z,200,0),cliff=world.weightsAt(x,z,200,1.5);
      assert.ok(flat[3]>.95,'flat desert ground is sand');
      assert.ok(cliff[2]>.9,'steep faces retain rock');
      for(const w of [flat,cliff])assert.ok(Math.abs(w.reduce((a,b)=>a+b)-1)<1e-6);
      assert.equal(world.locationNameAt(x,z),'Desierto del Ocaso');
    }
    for(const [x,z] of [[-4670,-1600],[-2850,-3150],[50,-4700],[-1250,1600]])
      assert.equal(world.desertAt(x,z),0,'neighbouring region centres remain outside');
    // Continuity across the transition and streamed-sector boundaries.
    let previous=world.desertAt(-4800,-4500),mixed=0;
    for(let x=-4799;x<=-1900;x++){
      const d=world.desertAt(x,-4500);
      assert.ok(d>=0&&d<=1&&Math.abs(d-previous)<.005);
      if(d>0&&d<1)mixed++;previous=d;
    }
    assert.ok(mixed>400,'gradual foothill transition');
    await world.prepare([-5050,-4750,-4550,-4250]);
    for(let z=-4650;z<=-4350;z+=100)for(let x=-4950;x<=-4650;x+=100){
      const vegetation=vegetationForChunk(Math.floor(x/MAINLAND.chunkSize),Math.floor(z/MAINLAND.chunkSize));
      assert.ok(vegetation.every(p=>p.kind==='arbolitoSeco'),'no temperate trees/plants in dry core');
      assert.equal(generateGrassPatch(Math.floor(x/24),Math.floor(z/24),world).length,0);
    }
    console.log('PASS Ocaso: broad sand/rock region, continuous boundary, preserved neighbours, dry vegetation.');
  } finally {setActiveGeography(null);world.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
