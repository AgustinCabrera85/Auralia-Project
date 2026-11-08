const assert=require('node:assert/strict');
const fs=require('node:fs');
const {BIOME_MATERIALS,BIOME_PALETTES,BIOME_TEXTURE_GPU_BYTES}=require('../.test-build/world/materials/BiomeMaterialCatalog.js');
const {LANDSCAPE_REGIONS,landscapeRegionWeight,landscapeVegetation}=require('../.test-build/world/landscapeRegions.js');
const {LANDSCAPE_LANDFORMS,applyLandscapeRelief}=require('../.test-build/world/landscapeRelief.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {vegetationForChunk,VEGETATION_CONFIG}=require('../.test-build/world/vegetationData.js');
const manifest=JSON.parse(fs.readFileSync('public/assets/terrain/biomes/manifest.json','utf8'));

function dimensions(bytes){
  if(bytes.toString('ascii',1,4)==='PNG')return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  for(let at=12;at+8<bytes.length;){
    const tag=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),p=at+8;
    if(tag==='VP8X')return [bytes.readUIntLE(p+4,3)+1,bytes.readUIntLE(p+7,3)+1];
    if(tag==='VP8 ')return [bytes.readUInt16LE(p+6)&0x3fff,bytes.readUInt16LE(p+8)&0x3fff];
    if(tag==='VP8L'){const bits=bytes.readUInt32LE(p+1);return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
    at+=8+size+(size&1);
  }
  throw Error('Missing WebP image');
}
assert.equal(manifest.biomes.length,14);
assert.equal(new Set(BIOME_MATERIALS.map(m=>m.id)).size,BIOME_MATERIALS.length);
for(const original of manifest.biomes){
  const m=BIOME_MATERIALS.find(m=>m.id===original.id);assert.ok(m);
  for(const channel of ['albedo','normal']){
    assert.ok(m[channel].endsWith(original[channel]));
    assert.deepEqual(dimensions(fs.readFileSync('public'+m[channel])),[1024,1024]);
  }
  assert.ok(m.normalStrength>0&&m.normalStrength<.3,'estimated normals remain moderate');
}
for(const palette of Object.values(BIOME_PALETTES)){
  assert.equal(palette.length,4);
  assert.ok(palette.every(id=>BIOME_MATERIALS.some(m=>m.id===id)));
}
assert.ok(BIOME_TEXTURE_GPU_BYTES<48*1024*1024,'shared texture working set stays below 48 MiB with mipmaps');
for(const r of Object.values(LANDSCAPE_REGIONS)){
  assert.equal(landscapeRegionWeight(r.x,r.z,r),1);
  assert.equal(landscapeRegionWeight(r.x+r.rx*1.1,r.z,r),0);
  for(let t=.45;t<=1.1;t+=.01){
    const w=landscapeRegionWeight(r.x+r.rx*t,r.z,r);
    assert.ok(w>=0&&w<=1);
    assert.ok(Math.abs(w-landscapeRegionWeight(r.x+r.rx*t+.01,r.z,r))<.001,'world masks cross chunk boundaries smoothly');
  }
}
assert.ok(landscapeVegetation(-180,-1640).grass<.1);
assert.ok(landscapeVegetation(-1330,-1730).trees<.1);
assert.equal(landscapeVegetation(1,10).grass,1);
assert.ok(LANDSCAPE_LANDFORMS.length>=8);
assert.ok(sampleMainlandHeight(275,-1310)>180,'the massif keeps a large silhouette beyond the protected road shoulder');
assert.ok(sampleMainlandHeight(-180,-1640)>250,'the volcanic massif has a large silhouette');
// Former route-cut trenches beside the screenshots' positions: broad slopes
// and rounded crests remain, without one-triangle needles or 85-degree walls.
for(const [cx,cz,maxAngle,maxBend] of [[112,-1562,70,4],[266,-1778,60,3],[200,-660,30,2]]){
  for(let x=cx-42;x<=cx+42;x+=6)for(let z=cz-42;z<=cz+42;z+=6){
    const h=sampleMainlandHeight(x,z),a=sampleMainlandHeight(x-6,z),b=sampleMainlandHeight(x+6,z);
    const c=sampleMainlandHeight(x,z-6),d=sampleMainlandHeight(x,z+6);
    assert.ok(Math.atan(Math.hypot(b-a,d-c)/12)*180/Math.PI<maxAngle,
      `bounded shoulder slope at ${x},${z}`);
    assert.ok(Math.max(Math.abs(a+b-2*h),Math.abs(c+d-2*h))<maxBend,
      `rounded triangle-scale crest at ${x},${z}`);
  }
}
for(let z=-2700;z<=300;z+=90)for(let x=-1900;x<=1900;x+=90){
  const h=sampleMainlandHeight(x,z);assert.ok(Number.isFinite(h));
  assert.ok(Math.abs(h-sampleMainlandHeight(x+.001,z))<.04);
  assert.ok(Math.abs(h-sampleMainlandHeight(x,z+.001))<.04);
  assert.equal(applyLandscapeRelief(x,z,10,1),10,'historical route cores are protected');
}

// Compare both vegetation budgets on the SAME terrain, seed and climate masks.
const originalCounts={...VEGETATION_CONFIG.candidatesPerChunk},originalScale={...VEGETATION_CONFIG.baseScale};
function countTrees(){let trees=0,area=0;
  for(let z=-16;z<=0;z++)for(let x=-12;x<=10;x++)for(const p of vegetationForChunk(x,z))
    if(p.obstacleRadius>0&&p.kind!=='tronco1'){trees++;area+=(VEGETATION_CONFIG.crownRadius[p.kind]*p.scale)**2;}
  return {trees,area};
}
const current=countTrees();let previous;
try{
  Object.assign(VEGETATION_CONFIG.candidatesPerChunk,{arbolito1:8,arbolito2:12,arbolito3:2,arbolitoSeco:3});
  for(const id of ['arbolito1','arbolito2','arbolito3'])VEGETATION_CONFIG.baseScale[id]*=1.2/1.95;
  VEGETATION_CONFIG.baseScale.arbolitoSeco/=1.5;
  previous=countTrees();
}finally{
  Object.assign(VEGETATION_CONFIG.candidatesPerChunk,originalCounts);
  Object.assign(VEGETATION_CONFIG.baseScale,originalScale);
}
assert.ok(current.trees<previous.trees*.8,'larger silhouettes use fewer tree instances');
assert.ok(current.area>previous.area,'fewer trees still cover more canopy area');
console.log('✓ Biome pack: 14 original 1K pairs, palette references, texture budget, continuous masks, large relief and protected roads');
console.log(JSON.stringify({previous,current,treeReduction:1-current.trees/previous.trees,canopyAreaRatio:current.area/previous.area}));
