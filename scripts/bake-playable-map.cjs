/* Offline cartography: same relief/water as gameplay, sampled tile by tile.
 * The game downloads only the final compressed image, never this baker. */
const fs=require('node:fs');
const path=require('node:path');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {BRISALIA_BUILDINGS,BRISALIA_ROADS}=require('../.test-build/world/brisaliaLayout.js');
const read=name=>JSON.parse(fs.readFileSync(`public/auralia-preview/data/${name}.json`,'utf8'));
(async()=>{
  const size=Number(process.argv[2]??1536);
  if(!Number.isInteger(size)||size<256||size>4096)throw new Error('Map size must be 256..4096');
  const manifest=read('manifest'),splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{
    const b=await fs.promises.readFile(path.join('public',url));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology,read('reinos_v3_7'));
  const heights=new Float32Array(size*size),levels=new Float32Array(size*size);
  const aridity=new Float32Array(size*size);
  const [minX,minZ,maxX,maxZ]=world.bounds,stepX=(maxX-minX)/size,stepZ=(maxZ-minZ)/size;
  let sampled=0;
  for(const tile of manifest.tiles){
    const [a,b,c,d]=tile.boundsXZ;
    await world.prepare([a-12,b-12,c+12,d+12]);
    const x0=Math.max(0,Math.ceil((a-minX)/stepX-.5)),x1=Math.min(size,Math.ceil((c-minX)/stepX-.5));
    const z0=Math.max(0,Math.ceil((b-minZ)/stepZ-.5)),z1=Math.min(size,Math.ceil((d-minZ)/stepZ-.5));
    for(let row=z0;row<z1;row++)for(let col=x0;col<x1;col++){
      const x=minX+(col+.5)*stepX,z=minZ+(row+.5)*stepZ,index=row*size+col;
      const h=world.heightAt(x,z),field=world.waterFieldAt(x,z);
      heights[index]=h;
      aridity[index]=world.desertAt(x,z);
      levels[index]=field?.level??(h<world.seaLevel?world.oceanLevelAt(x,z)??-10000:-10000);
      sampled++;
    }
    console.log(`Map samples: ${Math.round(sampled/(size*size)*100)}% (${tile.id})`);
  }
  if(sampled!==size*size||heights.some(v=>!Number.isFinite(v)))throw new Error('Incomplete map sampling');
  const output='.test-build/playable-map';fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(`${output}/height.f32`,Buffer.from(heights.buffer));
  fs.writeFileSync(`${output}/water.f32`,Buffer.from(levels.buffer));
  fs.writeFileSync(`${output}/aridity.f32`,Buffer.from(aridity.buffer));
  fs.writeFileSync(`${output}/metadata.json`,JSON.stringify({size,bounds:world.bounds,seaLevel:world.seaLevel,
    regions:world.regions,destinations:world.destinations,town:world.town,
    buildings:BRISALIA_BUILDINGS,roads:BRISALIA_ROADS}));
  world.dispose();console.log(`Sampled ${sampled.toLocaleString()} world positions → ${output}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
