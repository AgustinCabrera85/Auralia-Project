const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld,regionLocal}=require('../.test-build/world/geography/PlayableWorld.js');
const {LagoonVegetation,lagoonVegetationAssets,lagoonPlantingClear}=require('../.test-build/world/geography/LagoonVegetation.js');
const {CASCADE_LAGOON:l}=require('../.test-build/world/lagoonData.js');
const {AuthoredAssets}=require('../.test-build/world/editor/AuthoredAssets.js');
const {EXPANSION_V3_ASSETS}=require('../.test-build/world/expansionV3Catalog.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {setWorldDocument,emptyWorldDocument,getWorldDocument}=require('../.test-build/world/editor/WorldEditState.js');
(async()=>{
 const [m,s,h]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 let loads=0;
 const source=new WorldStudioSource(m,s,h,async u=>{loads++;const b=await fs.readFile('public'+u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,s,h);setActiveGeography(world);setWorldDocument(emptyWorldDocument());
 const vegetation=new LagoonVegetation(world);
 assert.equal(vegetation.ensure(world.town.x,world.town.z),false,'no distant planting at startup');
 await world.prepareAround(-2936,-827);const loadsBefore=loads;
 let complete=false;
 for(let i=0;i<500&&!complete;i++)complete=vegetation.ensure(-2936,-827);
 assert.equal(complete,true,'bounded incremental generation completes');
 assert.equal(loads,loadsBefore,'planting must not load extra R16 sectors');
 const placements=getWorldDocument().assets;
 assert.ok(placements.length>250&&placements.length<1000,'bounded local patches');
 assert.deepEqual(placements,lagoonVegetationAssets(world),'stable placement across reloads');
 assert.equal(vegetation.ensure(-2966,-849),false,'walking does not duplicate vegetation');
 assert.equal(getWorldDocument().assets.length,placements.length);
 assert.equal(new Set(placements.map(p=>p.id)).size,placements.length);
 const engine=new NullEngine(),scene=new Scene(engine),renderer=new AuthoredAssets(scene,new TransformNode('plants',scene));
 const level=l.level+world.lagoon.y,counts={};
 for(const p of placements){
  counts[p.assetId]=(counts[p.assetId]??0)+1;
  const local=regionLocal(world.lagoon,p.x,p.z),surface=world.surface.surfaceAt(p.x,p.z);
  assert.ok(lagoonPlantingClear(local.x,local.z),'falls/outlet/grotto remain open');
  assert.ok(Math.hypot(surface.slopeX,surface.slopeZ)<=.25,'no planting on cliffs');
  assert.equal(p.collisionRadius,0,'small wetland flora cannot obstruct swimming/walking');
  const asset=EXPANSION_V3_ASSETS[p.assetId];
  assert.ok(asset.renderDistance<=155,'bounded rendering distance');
  if(p.assetId==='v3WetlandTotoraTall'||p.assetId==='v3WetlandJuncosDense')assert.ok(asset.lodPath&&asset.lodDistance===65);
  const matrix=renderer.placementMatrix(p.assetId,p,asset);
  if(asset.surface==='water'){
   assert.ok(surface.height<level-.3&&surface.height>level-2.6);
   assert.ok(Math.abs(matrix[13]-level-.035)<.001,'pads use surface, never lake bed');
   for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]])assert.ok(world.waterAt(p.x+dx,p.z+dz));
  }else{
   assert.ok(surface.height>level-.7&&surface.height<level+2.4);
   assert.ok(Math.abs(matrix[13]-surface.height)<.001,'root placement matches rendered/collision triangles');
  }
 }
 assert.equal(Object.keys(counts).length,6,'all six wetland species have viable habitat');
 // A later authored object reserves space without altering unrelated placements.
 const p=placements[0],obstacle={...p,id:'authored-object',collisionRadius:6,scale:1};
 assert.ok(lagoonVegetationAssets(world,[obstacle]).every(a=>Math.hypot(a.x-p.x,a.z-p.z)>=9));
 const report={placements:placements.length,counts,generationMs:vegetation.generationMs,
  maxRenderDistance:167,lodDistance:65,extraR16Loads:loads-loadsBefore,metadataBytes:Buffer.byteLength(JSON.stringify(placements))};
 await fs.mkdir('artifacts/geographic-source/lagoon-shore',{recursive:true});
 await fs.writeFile('artifacts/geographic-source/lagoon-shore/vegetation.json',JSON.stringify(report,null,2)+'\n');
 console.log(report);renderer.dispose();scene.dispose();engine.dispose();setActiveGeography(null);
})().catch(e=>{console.error(e);process.exitCode=1});
