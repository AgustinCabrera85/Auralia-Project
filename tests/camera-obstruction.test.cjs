const assert=require('node:assert/strict');
const {NullEngine,Scene,MeshBuilder,Vector3}=require('@babylonjs/core');
const {BrisaliaVillage}=require('../.test-build/world/BrisaliaVillage.js');
const {CameraObstructionProbe,cameraRadiusAfterCollision}=require('../.test-build/game/cameraTerrain.js');
const engine=new NullEngine(),scene=new Scene(engine);
try{
  const village=Object.create(BrisaliaVillage.prototype);
  village.solids=[];village.rainCells=new Map();
  const box=(name,x,y,z,width,height,depth)=>{
    const mesh=MeshBuilder.CreateBox(name,{width,height,depth},scene);
    mesh.position.set(x,y,z);mesh.computeWorldMatrix(true);village.solids.push(mesh);
    const b=mesh.getBoundingInfo().boundingBox;
    for(let cx=Math.floor(b.minimumWorld.x/16);cx<=Math.floor(b.maximumWorld.x/16);cx++)
      for(let cz=Math.floor(b.minimumWorld.z/16);cz<=Math.floor(b.maximumWorld.z/16);cz++){
        const key=`${cx}:${cz}`,cell=village.rainCells.get(key)??[];cell.push(mesh);village.rainCells.set(key,cell);
      }
    return mesh;
  };
  box('wall',1,2,0,.2,4,6);
  box('roof',0,4.5,0,6,.2,6);
  const from=new Vector3(0,2,0),to=new Vector3(0,2,10),probe=new CameraObstructionProbe();
  let queries=0;
  const query=()=>{queries++;return village.cameraObstruction(from,to);};
  assert.equal(probe.resolve(from,to,1/60,query),null);
  assert.equal(probe.resolve(from,to,1/60,query),null);assert.equal(queries,1,'idle Babylon vectors reuse the same probe');
  to.set(10,2,0);
  const hit=probe.resolve(from,to,1/60,query);
  assert.ok(Math.abs(hit-.9)<1e-5,'a rapid turn detects a nearby wall immediately');
  assert.equal(queries,2,'turning cannot wait for the old 120 ms interval');
  const safe=cameraRadiusAfterCollision(11.5,Math.max(.25,hit-.65),1/60);
  assert.ok(safe<hit,'close walls cannot be crossed by a forced 1.4 m minimum');
  to.set(0,10,0);
  assert.ok(Math.abs(probe.resolve(from,to,1/60,query)-2.4)<1e-5,'upward pivot probe detects the roof');
  from.x=-1;
  probe.resolve(from,to,1/60,query);assert.equal(queries,4,'moving the pivot invalidates the cached ray');
  probe.resolve(from,to,.13,query);assert.equal(queries,5,'stationary probes eventually check newly loaded geometry');
  const ground=village.ground(1,0,10,20);
  assert.ok(ground&&Math.abs(ground.height-4.6)<1e-5,'spatial ray candidates preserve the highest support');
  console.log('Camera obstruction: immediate orbit/zoom/target checks, close wall, roof, idle reuse and spatial building rays passed.');
}finally{scene.dispose();engine.dispose();}
