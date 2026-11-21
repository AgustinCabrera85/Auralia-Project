import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { brisaliaRev3ResourceUrl } from '../src/world/BrisaliaAssetUrls.ts';
import { BRISALIA_REV3_ASSETS } from '../src/world/brisaliaRev3Assets.ts';

const base=path.resolve('public/assets/buildings/brisalia-rev3-final');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'prefab_manifest.json'),'utf8'));
assert.deepEqual(manifest.prefabs.map(p=>p.id),Array.from({length:27},(_,i)=>`B${String(i+1).padStart(2,'0')}`));
assert.deepEqual(Object.keys(BRISALIA_REV3_ASSETS),manifest.prefabs.map(p=>p.id));
const images=new Set();let geometries=0;
for(const p of manifest.prefabs){
  const catalog=BRISALIA_REV3_ASSETS[p.id];assert.equal(catalog.file,p.shared_gltf);
  assert.ok(catalog.width>0&&catalog.depth>0&&catalog.height>0);
  const file=path.join(base,p.shared_gltf),g=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(g.extensionsRequired.includes('EXT_texture_webp'),`${p.id} explicit WebP`);
  const buffers=g.buffers.map(b=>{const bytes=fs.readFileSync(path.resolve(path.dirname(file),b.uri));
    assert.equal(bytes.length,b.byteLength);geometries+=bytes.length;return bytes;});
  for(const b of g.bufferViews)assert.ok((b.byteOffset??0)+b.byteLength<=buffers[b.buffer].length,`${p.id} buffer bounds`);
  for(const image of g.images){
    const uri=brisaliaRev3ResourceUrl(`/assets/buildings/brisalia-rev3-final/shared_gltf/${image.uri}`,'https://auralia.test/');
    assert.ok(uri.startsWith('https://auralia.test/assets/buildings/brisalia-rev3-final/shared_textures/'));
    const imagePath=path.resolve(path.dirname(file),image.uri);assert.ok(fs.statSync(imagePath).size>0);images.add(imagePath);
  }
  for(const mesh of g.meshes)for(const primitive of mesh.primitives){
    assert.ok(primitive.attributes.POSITION!==undefined&&primitive.attributes.NORMAL!==undefined,`${p.id} geometry normals`);
    if(primitive.material!==undefined)assert.ok(g.materials[primitive.material]);
  }
  assert.ok(g.materials.some(m=>m.normalTexture&&m.pbrMetallicRoughness?.metallicRoughnessTexture),`${p.id} PBR normal/roughness`);
  const names=g.nodes.map(n=>n.name??''),i=Number(p.id.slice(1));
  if(i>=7&&i<=26){
    assert.ok(!names.some(n=>/dressed_corner_stones|planter_herb/i.test(n)),`${p.id} old corner blocks/plants`);
    const expected=['B07','B13','B19','B25'].includes(p.id)?2:1;
    assert.equal(names.filter(n=>n.includes('_herbs_')).length,expected);
    assert.equal(names.filter(n=>n.includes('_daisies_')).length,expected);
  }
  if([2,4,5].includes(i)||i>=7&&i<=26){
    for(const pattern of [/daisy/i,/herb/i]){
      const material=g.materials.find(m=>pattern.test(m.name));
      assert.ok(material&&['MASK','BLEND'].includes(material.alphaMode)&&material.doubleSided,`${p.id} transparent crossed foliage`);
    }
  }
}
assert.equal(images.size,62);assert.equal(geometries,manifest.geometry_bytes_total);
assert.equal([...images].reduce((n,p)=>n+fs.statSync(p).size,0),manifest.shared_texture_bytes);
for(const bad of ['https://elsewhere.test/a.webp','/assets/private.webp',
  '/assets/buildings/brisalia-rev3-final/shared_gltf/../../escape.bin',
  '/assets/buildings/brisalia-rev3-final/shared_textures/%2e%2e/%2e%2e/escape.webp'])
  assert.throws(()=>brisaliaRev3ResourceUrl(bad,'https://auralia.test/'));
console.log('Rev3: 27 IDs, 62 shared images, buffer ranges, PBR, transparent planters and scoped URLs OK');
