import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {repairWoodSolids} from '../src/world/RepairWoodSolids.ts';
const folder=new URL('../public/assets/buildings/brisalia-rev3-final/shared_gltf/',import.meta.url);
let components=0,b18=0,meshes=0;
for(const name of (await readdir(folder)).filter(n=>n.endsWith('.gltf'))){
 const gltf=JSON.parse(await readFile(new URL(name,folder),'utf8'));
 const buffers=await Promise.all(gltf.buffers.map(b=>readFile(new URL(b.uri,folder))));
 const data=index=>{
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],buffer=buffers[v.buffer??0];
  const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];
  assert.ok(!v.byteStride||v.byteStride===size*Type.BYTES_PER_ELEMENT,'fixture layout');
  return new Type(buffer.buffer,buffer.byteOffset+(v.byteOffset??0)+(a.byteOffset??0),a.count*size);
 };
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
  if(!/oak/i.test(gltf.materials[primitive.material].name))continue;
  const positions=data(primitive.attributes.POSITION),normals=data(primitive.attributes.NORMAL),indices=data(primitive.indices);
  const originals=[positions.slice(),normals.slice(),indices.slice()];
  const fixed=repairWoodSolids(positions,normals,indices);if(!fixed)continue;
  meshes++;components+=fixed.components;if(name.startsWith('B18'))b18+=fixed.components;
  assert.deepEqual(positions,originals[0]);assert.deepEqual(normals,originals[1]);assert.deepEqual(indices,originals[2]);
  assert.equal(fixed.indices.length,indices.length);assert.equal(fixed.normals.length,normals.length);
  assert.equal(repairWoodSolids(positions,fixed.normals,fixed.indices),null,'repair is idempotent');
 }
}
assert.ok(b18>0,'B18 source contains inward solid timbers');
assert.equal(repairWoodSolids([0,0,0,1,0,0,0,0,1],[0,1,0,0,1,0,0,1,0],[0,1,2]),null,'open sheets are not filled or flipped');
console.log(`Wood solids: ${components} closed components in ${meshes} meshes corrected (${b18} in B18); original positions/UV topology intact, open sheets untouched, idempotent.`);
