const assert=require('node:assert/strict');
const {NullEngine,Scene,MeshBuilder,Matrix}=require('@babylonjs/core');
const {rockWaterContact,WaterContactUniforms,MAX_WATER_CONTACTS}=require('../.test-build/world/water/WaterContacts.js');
const {RockColliderSystem}=require('../.test-build/world/RockColliderSystem.js');

const engine=new NullEngine(),scene=new Scene(engine);
const box=MeshBuilder.CreateBox('contact-rock',{width:4,height:4,depth:2},scene);
box.bakeTransformIntoVertices(Matrix.Translation(0,2,0));
const colliders=new RockColliderSystem(()=>[box]);
const placement={id:'wet-rock',kind:'packRocas',x:10,y:0,z:-8,scale:1,yaw:.7,partIndex:0};
colliders.sync([placement],10,-8,new Set());
let contacts=colliders.waterContacts(10,-8,()=>2);
assert.equal(contacts.length,1,'a rock crossing the waterline supplies one contact');
assert.ok(Math.abs(contacts[0].x-10)<.001&&Math.abs(contacts[0].z+8)<.001);
assert.ok(Math.abs(contacts[0].radiusX-2)<.001&&Math.abs(contacts[0].radiusZ-1)<.001,
  'section preserves the rotated, non-circular rock footprint');
assert.equal(colliders.waterContacts(10,-8,()=>5).length,0,'fully submerged rock has no surface foam');
assert.equal(colliders.waterContacts(10,-8,()=>-1).length,0,'dry rock has no surface foam');
assert.equal(colliders.waterContacts(10,-8,()=>null).length,0,'no water means no contact');
const sloping=colliders.waterContacts(10,-8,(x,z)=>2+(x-10)*.2+(z+8)*.1);
assert.equal(sloping.length,1,'sloping river intersects the actual triangles');
const count=scene.meshes.length;
for(let i=0;i<100;i++)colliders.waterContacts(10,-8,()=>2);
assert.equal(scene.meshes.length,count,'contact updates allocate no new meshes');
colliders.sync([],10,-8,new Set());
assert.equal(colliders.waterContacts(10,-8,()=>2).length,0,'streamed-out rocks leave no ghost contact');

const sphere=MeshBuilder.CreateSphere('tapered-rock',{diameter:4,segments:16},scene);
const waist=rockWaterContact([sphere],0,0,0,0),top=rockWaterContact([sphere],1.6,0,0,0);
assert.ok(top.radiusX<waist.radiusX*.7,'the foam section shrinks near the top, unlike a bounding sphere');
const buffer=new WaterContactUniforms(),shapes=buffer.shapes,info=buffer.info;
buffer.set(Array.from({length:MAX_WATER_CONTACTS+4},()=>waist));
assert.equal(buffer.shapes.length,MAX_WATER_CONTACTS*4,'uniform capacity is bounded');
buffer.set([]);
assert.equal(buffer.shapes,shapes);assert.equal(buffer.info,info);
assert.ok(buffer.info.every(n=>n===0),'empty selection clears all previous contacts');
colliders.dispose();scene.dispose();engine.dispose();
console.log('✓ Waterline sections, rotated rocks, sloping flow, dry/submerged filtering and bounded contact lifecycle');
