const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Vector3,Ray}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
(async()=>{
  const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>
    JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
  const source=new WorldStudioSource(m,s,h,async u=>{
    const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,s,h);
  setActiveGeography(world);await world.prepareAround(-2062,-425);
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('lowland-test',scene);
  const terrain=new TerrainStream(scene,root,{},world),tiles=new Map();
  try{
    for(const [x,z] of [[-2062,-425],[-2062,-440],[-2050,-410],[-2080,-425]]){
      assert.equal(world.waterAt(x,z),null,'keep the existing ocean owner; do not add inland water');
      assert.equal(world.oceanLevelAt(x,z),1,'camera must recognize the rendered lowland waterline');
      const cx=Math.floor(x/72),cz=Math.floor(z/72),key=`${cx}:${cz}`;
      let tile=tiles.get(key);
      if(!tile){tile=terrain.createTile('near',{cx,cz});tiles.set(key,tile);tile.setEnabled(true);tile.computeWorldMatrix(true);}
      const hit=new Ray(new Vector3(x,100,z),new Vector3(0,-1,0),200).intersectsMesh(tile,false);
      assert.ok(hit.hit,'a rendered bottom must exist below the reported lake');
      assert.ok(Math.abs(hit.pickedPoint.y-world.surface.heightAt(x,z))<1e-5,'rendered bed and collision height agree');
    }
    assert.ok(Math.abs(world.surface.heightAt(-2062,-425)+4.20752881771927)<1e-9,'preserve the existing bottom');
    assert.equal(world.oceanLevelAt(-2062,-350),null,'dry bank must not activate ocean immersion');
    assert.equal(world.waterAt(-2308,100)?.kind,'lake','previously repaired lake keeps its inland surface');
    assert.equal(world.oceanLevelAt(-2308,100),null,'never overlap an inland owner with the ocean');
    console.log('Lowland lake: 4 rendered bed hits, optical waterline, dry bank and inland ownership verified.');
  }finally{
    for(const tile of tiles.values())tile.dispose();
    terrain.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
  }
})().catch(e=>{console.error(e);process.exitCode=1});
