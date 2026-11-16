const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Material,Mesh,NullEngine,Scene,StandardMaterial,TransformNode,Vector3,VertexBuffer}=require('@babylonjs/core');
const {WayfindingSway}=require('../.test-build/world/WayfindingSway.js');
const {addWayfindingEndGrain}=require('../.test-build/world/wayfindingGeometry.js');
const {WayfindingSystem}=require('../.test-build/world/WayfindingSystem.js');

const engine=new NullEngine(),scene=new Scene(engine);
// Canvas drawing is irrelevant to geometry; preserve the production text planes.
engine.createCanvas=(width,height)=>({width,height,getContext:()=>({clearRect(){},measureText:s=>({width:s.length*20}),strokeText(){},fillText(){}})});
function fixture(name){
  const bytes=fs.readFileSync(`public/assets/wayfinding/${name}.glb`),length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
  function read(index){
    const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const method={5126:'readFloatLE',5123:'readUInt16LE',5125:'readUInt32LE'}[a.componentType];
    const component=a.componentType===5123?2:4,offset=(v.byteOffset??0)+(a.byteOffset??0),result=[];
    for(let i=0;i<a.count;i++)for(let k=0;k<size;k++)result.push(bin[method](offset+i*(v.byteStride??component*size)+k*component));
    return result;
  }
  const root=new TransformNode(name+'-gltf',scene);root.rotation.y=Math.PI;root.scaling.z=-1;
  const materials=gltf.materials.map(m=>new StandardMaterial(m.name,scene));
  const meshes=gltf.meshes[0].primitives.map((primitive,i)=>{
    const mesh=new Mesh(name+'-'+i,scene);mesh.parent=root;mesh.material=materials[primitive.material];
    mesh.sideOrientation=Material.ClockWiseSideOrientation;
    for(const [attribute,kind] of [['POSITION','position'],['NORMAL','normal'],['TANGENT','tangent'],['TEXCOORD_0','uv']])
      if(primitive.attributes[attribute]!==undefined)mesh.setVerticesData(kind,read(primitive.attributes[attribute]));
    mesh.setIndices(read(primitive.indices));return mesh;
  });
  return {root,meshes,materials};
}
const parts=root=>root.getChildMeshes().filter(m=>m.getTotalVertices());
const indexCount=root=>parts(root).reduce((n,m)=>n+m.getTotalIndices(),0);
function positions(root){
  const result=[];
  for(const mesh of parts(root)){
    const world=mesh.computeWorldMatrix(true),p=mesh.getVerticesData(VertexBuffer.PositionKind);
    for(const i of mesh.getIndices())result.push(Vector3.TransformCoordinates(Vector3.FromArray(p,i*3),world).asArray());
  }
  return result.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
}
const near=(a,b,e=1e-4)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function samePoints(actual,expected,label){
  const buckets=new Map(),cell=p=>p.map(x=>Math.floor(x*1000));
  for(const p of expected){const key=cell(p).join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
  for(const p of actual){
    const c=cell(p);let found=false;
    for(let x=-1;x<=1&&!found;x++)for(let y=-1;y<=1&&!found;y++)for(let z=-1;z<=1&&!found;z++){
      const group=buckets.get([c[0]+x,c[1]+y,c[2]+z].join(','));
      const i=group?.findIndex(q=>Math.hypot(...q.map((v,k)=>v-p[k]))<.0001)??-1;
      if(i>=0){group.splice(i,1);found=true;}
    }
    assert.ok(found,label+': unchanged vertex '+p);
  }
  assert.ok([...buckets.values()].every(g=>!g.length),label+': no missing vertices');
}
for(const name of ['Board','Lamp','Pointer1','Pointer2']){
  const source=fixture(name),root=new TransformNode(name+'-site',scene),axes=new TransformNode(name+'-axes',scene);
  root.position.set(40,12,-70);root.rotation.y=.67;axes.parent=root;axes.rotation.y=Math.PI;
  axes.position.y=name.startsWith('Pointer')?-.2287568:-.45505095;if(name.startsWith('Pointer'))axes.position.z=3.55;
  source.root.parent=axes;
  const count=indexCount(root),before=positions(root);
  const shared=source.meshes[0].clone(name+'-other-site',null,true),sharedCount=shared.getTotalIndices();
  shared.parent=null;
  const cap=addWayfindingEndGrain(source.meshes[0],new StandardMaterial('end-grain',scene));
  assert.ok(cap,name+' has a separate top cut');
  assert.equal(cap.sideOrientation,Material.ClockWiseSideOrientation,'Top cut preserves glTF face winding');
  const uvs=cap.getVerticesData(VertexBuffer.UVKind);
  near(Math.min(...uvs),0);near(Math.max(...uvs),1);
  const heights=cap.getVerticesData(VertexBuffer.PositionKind).filter((_,i)=>i%3===1);
  near(Math.min(...heights),Math.max(...heights));
  let sway;
  if(name==='Board'||name==='Lamp'){
    sway=new WayfindingSway(root,name==='Lamp');
    assert.ok(sway.pivot.getChildMeshes().length>=2,name+' separates hanging materials');
    assert.ok(sway.pivot.getChildMeshes().every(m=>m.sideOrientation===Material.ClockWiseSideOrientation),'Hanging parts preserve glTF face winding');
    assert.ok(!cap.isDescendantOf(sway.pivot),'Post cap stays fixed');
  }
  assert.equal(indexCount(root),count,name+' conserves all triangles');
  assert.equal(shared.getTotalIndices(),sharedCount,'Splitting one instance does not alter another');
  samePoints(positions(root),before,name+' retains its resting geometry');
  if(sway){
    const fixed=parts(root).filter(m=>!m.isDescendantOf(sway.pivot));
    const matrices=fixed.map(m=>Array.from(m.computeWorldMatrix(true).m));
    const anchor=sway.pivot.getAbsolutePosition().clone();
    for(let t=0;t<30;t+=.1){
      sway.update(t);assert.ok(Math.abs(sway.pivot.rotation.x)<=.045&&Math.abs(sway.pivot.rotation.z)<=.016,'Sway remains gentle');
    }
    near(Vector3.Distance(anchor,sway.pivot.getAbsolutePosition()),0);
    fixed.forEach((m,i)=>assert.deepEqual(Array.from(m.computeWorldMatrix(true).m),matrices[i],'Post/crossbar stay fixed'));
    assert.ok(Math.abs(sway.pivot.rotation.x)>.001,'Hanging part moves');
    if(name==='Board')near(sway.pivot.rotation.z,0);
  }
  root.dispose();shared.dispose();
}

(async()=>{
  const parent=new TransformNode('town',scene),system=new WayfindingSystem(scene,parent,[],()=>0);
  await system.ready;
  for(const [id,name,asset] of [['board','Board','wayfindingBoard'],['lamp','Lamp','wayfindingLamp']]){
    const source=fixture(name);
    system.place({id,asset,at:[0,0],yaw:.7,region:'Brisalia',location:'Cruce central',routes:[{label:'Castillo',points:[[0,0],[1,0]],distance:1}]},
      {materials:source.materials,instantiateModelsToScene:()=>({rootNodes:[source.root]})});
  }
  const board=system.placed.get('board'),hanger=system.sways[0].pivot;
  const text=board.meshes.filter(m=>m.metadata.inscription?.includes('Cruce central'));
  assert.equal(text.length,2);assert.ok(text.every(m=>m.parent===hanger),'Both inscriptions follow the hanging board');
  assert.ok(board.meshes.filter(m=>m.metadata.inscription==='BRISALIA').every(m=>m.parent===board.root),'Header stays on fixed crossbar');
  const lamp=system.lamps[0];assert.equal(lamp.light.parent,system.sways[1].pivot);assert.equal(lamp.characterLight.parent,lamp.light.parent);
  const relative=text.map(m=>m.position.asArray());
  const lampRest=Vector3.TransformCoordinates(lamp.light.position,lamp.light.parent.computeWorldMatrix(true));
  for(let i=0;i<180;i++)system.update(1,{x:0,z:0},1/60);
  text.forEach((m,i)=>assert.deepEqual(m.position.asArray(),relative[i],'Text never slides across wood'));
  const lampNow=Vector3.TransformCoordinates(lamp.light.position,lamp.light.parent.computeWorldMatrix(true));
  assert.ok(Vector3.Distance(lampRest,lampNow)>.005,'Actual illumination moves with the lantern');
  assert.ok(Vector3.Distance(lampRest,lampNow)<.12,'Lamp movement stays subtle');
  system.dispose();engine.dispose();
  console.log(JSON.stringify({passed:true,assets:4,checks:'triangle conservation, fixed posts, planar end grain, hanging text, moving light'}));
})().catch(error=>{console.error(error);engine.dispose();process.exitCode=1;});
