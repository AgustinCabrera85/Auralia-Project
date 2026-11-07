const assert=require('node:assert/strict');
const fs=require('node:fs');
const {NullEngine,Scene,TransformNode,PBRMaterial,Color3,MeshBuilder}=require('@babylonjs/core');
const {EXPANSION_V3_ASSETS}=require('../.test-build/world/expansionV3Catalog.js');
const {EXPANSION_PREFIX,expansionBiomeAssets,installExpansionBiomeAssets}=
  require('../.test-build/world/expansionBiomeData.js');
const {emptyWorldDocument,getWorldDocument,setWorldDocument,blocksAuthoredMovement}=
  require('../.test-build/world/editor/WorldEditState.js');
const {AuthoredAssets}=require('../.test-build/world/editor/AuthoredAssets.js');
const {sampleMainlandHeight,geographyMasks,isStarterArea}=require('../.test-build/world/terrainData.js');
const {waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const {insideFoliageForest}=require('../.test-build/world/foliageForestConfig.js');
const {configureExpansionV3Material}=require('../.test-build/world/LandscapeAtmosphere.js');

const generated=expansionBiomeAssets();
assert.deepEqual(generated,expansionBiomeAssets(),'reloads keep the same deterministic vegetation');
assert.equal(new Set(generated.map(p=>p.id)).size,generated.length,'unique stable placement ids');
for(const [id,asset] of Object.entries(EXPANSION_V3_ASSETS)){
  assert.ok(generated.some(p=>p.assetId===id),`${id} has suitable habitat`);
  assert.equal(asset.interaction,'decorative','original wood trees remain the resource models');
  for(const file of [asset.path,asset.lodPath].filter(Boolean)){
    const raw=fs.readFileSync('public'+file);
    assert.equal(raw.readUInt32LE(0),0x46546c67);
    const glb=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString('utf8'));
    assert.ok(glb.meshes.length&&glb.materials.length<=2);
    assert.ok((glb.images??[]).every(image=>image.bufferView!==undefined),
      'textures stay embedded; no missing external atlas URLs');
    if(id.startsWith('v3Tree')){
      assert.ok(glb.materials.some(m=>m.name.includes('_wood_')));
      assert.ok(glb.materials.some(m=>m.alphaMode==='MASK'));
    }
  }
}
for(const p of generated){
  const catalog=EXPANSION_V3_ASSETS[p.assetId];
  assert.ok(!insideFoliageForest(p.x,p.z)&&!isStarterArea(p.x,p.z));
  assert.ok(geographyMasks(p.x,p.z).road<.45,'roads stay open');
  if(catalog.surface==='water'){
    const water=waterSurfaceAt(p.x,p.z);
    assert.ok(water&&['lake','lagoon'].includes(water.kind));
    assert.ok(sampleMainlandHeight(p.x,p.z)<water.level-.25);
    assert.equal(p.collisionRadius,0,'floating flora never obstructs movement');
  }
}
const original={id:'custom-tree',assetId:'v4TreeSoftEmerald',x:100,z:-300,
  yOffset:0,scale:1,yaw:0,collisionRadius:12};
setWorldDocument({...emptyWorldDocument(),assets:[original]});
installExpansionBiomeAssets();const installed=getWorldDocument().assets;
assert.deepEqual(installed[0],original,'existing editor objects are preserved');
assert.ok(installed.filter(p=>p.id.startsWith(EXPANSION_PREFIX)).every(p=>
  Math.hypot(p.x-original.x,p.z-original.z)>14),'new flora clears authored objects');
installExpansionBiomeAssets();
assert.deepEqual(getWorldDocument().assets,installed,'installation is idempotent');
const trunk=installed.find(p=>p.assetId.startsWith('v3Tree'));
assert.ok(blocksAuthoredMovement(trunk.x,trunk.z),'new tree trunks participate in collisions');

const engine=new NullEngine(),scene=new Scene(engine);
const system=new AuthoredAssets(scene,new TransformNode('assets',scene));
const lily=generated.find(p=>p.assetId==='v3WetlandLilyWhite');
const matrix=system.placementMatrix(lily.assetId,lily,EXPANSION_V3_ASSETS[lily.assetId]);
assert.ok(Math.abs(matrix[13]-waterSurfaceAt(lily.x,lily.z).level-lily.yOffset)<1e-5,
  'floating model matrix follows water, not the bottom of the lake');
const bloom=new PBRMaterial('Auralia_V4_Leaves_Painterly',scene);
bloom.albedoColor=new Color3(.96,.31,.63);
configureExpansionV3Material(bloom);
assert.deepEqual(bloom.albedoColor.asArray(),[.96,.31,.63],
  'flower colours are preserved instead of receiving the V4 green tint');
const reed=new PBRMaterial('Auralia_Expansion_Ground_Plants',scene);
const mesh=MeshBuilder.CreateBox('reed',{height:2},scene);mesh.material=reed;
system.foliageWind.register([mesh],'v3WetlandTotoraTall');
assert.equal(system.foliageWind.groundMaterialCount,1,'wetland stems use the shared wind');
system.dispose();scene.dispose();engine.dispose();
console.log(`Expansion V3: ${generated.length} placements, 23 habitats, water anchoring, original colours and collision OK`);
