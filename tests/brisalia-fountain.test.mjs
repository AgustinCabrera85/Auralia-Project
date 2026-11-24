import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,LoadAssetContainerAsync,Ray} from '@babylonjs/core';

const folder=resolve('.test-build/fountain');mkdirSync(folder,{recursive:true});
const source=readFileSync('src/world/BrisaliaFountain.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace("import { loadGpuAssetContainerAsync } from './GpuAssets';","import { LoadAssetContainerAsync as loadGpuAssetContainerAsync } from '@babylonjs/core';");
writeFileSync(resolve(folder,'BrisaliaFountain.mjs'),code);
for(const name of ['CharacterTraversalController','traversalRules']){
  const runtime=ts.transpileModule(readFileSync(`src/game/${name}.ts`,'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace("from './traversalRules'","from './traversalRules.mjs'");
  writeFileSync(resolve(folder,`${name}.mjs`),runtime);
}
const {CharacterTraversalController}=await import(pathToFileURL(resolve(folder,'CharacterTraversalController.mjs')));
const {BrisaliaFountain,FOUNTAIN,fountainJetPoint}=await import(pathToFileURL(resolve(folder,'BrisaliaFountain.mjs')));
const bytes=readFileSync('public'+FOUNTAIN.url);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'7aa99ef55985f4ae1706fbbd454c266534f4bf7836c25e31f1bd18f19a061a61','original asset is preserved');
const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
assert.equal(gltf.meshes.length,1);assert.ok(gltf.images[0].bufferView!==undefined,'texture is embedded');
const engine=new NullEngine(),scene=new Scene(engine);
scene.activeCamera=new FreeCamera('qa',new Vector3(10,8,-10),scene);
scene.activeCamera.setTarget(new Vector3(14,4,-25));
// NullEngine has no real instancing capability; its buffers can still verify the pooled transforms.
engine.getCaps().instancedArrays=true;
const parent=new TransformNode('world',scene),baseline={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length};
const importer=(_url,scene)=>LoadAssetContainerAsync('data:application/octet-stream;base64,'+bytes.toString('base64'),scene,{pluginExtension:'.glb'});
const fountain=new BrisaliaFountain(scene,parent,new Vector3(14,3,-25),importer);
// Safe restoration must work before the asynchronous asset has finished loading.
for(const [x,z] of [[20.9,-25],[14,-25],[14,-17]]){
  const safe=fountain.safeSavedPosition(x,z,.6);
  assert.ok(Math.hypot(safe.x-14,safe.z+25)>FOUNTAIN.diameter*.55+.6,'saved basin/rim positions recover outside the masonry');
}
assert.deepEqual(fountain.safeSavedPosition(30,-25,.6),{x:30,z:-25},'unrelated saved positions are preserved');
assert.ok(!scene.getTransformNodeByName('fountain:water-effects').isEnabled(),'effects wait for the actual asset');
await fountain.ready;assert.equal(fountain.error,null);assert.equal(fountain.meshes.length,1);
const stone=fountain.meshes[0],bounds=stone.getBoundingInfo().boundingBox;
assert.ok(Math.abs(bounds.minimumWorld.y-3)<.001,'base sits on the terrain');
assert.ok(Math.abs(bounds.maximumWorld.x-bounds.minimumWorld.x-16.2)<.001,'fountain is three times its original size');
assert.equal(stone.metadata.buildingCollision,true);
const scale=FOUNTAIN.diameter/FOUNTAIN.sourceWidth;
const sideHit=new Ray(new Vector3(bounds.minimumWorld.x-1,3+.1*scale,-25),
  new Vector3(1,0,0),FOUNTAIN.diameter+2).intersectsMesh(stone);
assert.ok(sideHit.hit,'basin masonry has a real collision surface');
for(let side=0;side<4;side++){
  const origin=fountainJetPoint(side,0),end=fountainJetPoint(side,1);
  assert.ok(Math.abs(end.y-FOUNTAIN.waterY)<1e-7,'stream meets the water surface');
  assert.ok(Math.hypot(end.x,end.z)<.43,'impact stays inside the basin wall');
  const radial=new Vector3(Math.cos(side*Math.PI/2),0,Math.sin(side*Math.PI/2));
  const nozzle=origin.scale(scale).add(new Vector3(14,3,-25));
  // The nozzle end is inset by a few millimetres; the next point must emerge into free space.
  const probe=nozzle.add(radial.scale(.08)).add(new Vector3(0,.012*scale,0));
  const hit=new Ray(probe,radial.scale(-1),.15).intersectsMesh(stone);
  assert.ok(hit.hit,`stream ${side} begins at its authored nozzle`);
  for(let i=1;i<=28;i++){
    const a=fountainJetPoint(side,(i-1)/28),b=fountainJetPoint(side,i/28);
    assert.ok(b.y<a.y&&Math.hypot(b.x,b.z)>Math.hypot(a.x,a.z),'gravity bends the stream outward and downward');
  }
}
// Exercise the real GLB rim with the actual player controller, including the
// shallow bevels that previously dropped the feet into the masonry underneath.
const collisionWorld={
  ground:(x,z,origin,max)=>{
    const hit=new Ray(new Vector3(x,origin,z),new Vector3(0,-1,0),max).intersectsMesh(stone);
    const n=hit.hit?hit.getNormal(true):null;
    if(hit.pickedPoint&&n&&Math.abs(n.y)>.55)return {height:hit.pickedPoint.y,normalY:Math.abs(n.y),rockId:'building:fountain'};
    return origin>=3&&origin-max<=3?{height:3,normalY:1}:null;
  },
  wall:(x,y,z,dx,dz,reach)=>{
    const hit=new Ray(new Vector3(x,y,z),new Vector3(dx,0,dz).normalize(),reach).intersectsMesh(stone);
    const n=hit.hit?hit.getNormal(true):null;
    if(!hit.pickedPoint||!n||Math.abs(n.y)>.75)return null;
    return {pointX:hit.pickedPoint.x,pointY:hit.pickedPoint.y,pointZ:hit.pickedPoint.z,
      distance:hit.distance,normalX:n.x,normalY:n.y,normalZ:n.z,climbable:false,rockId:'building:fountain'};
  },
  headroom:(x,y,z,h)=>!new Ray(new Vector3(x,y+.15,z),Vector3.Up(),h-.15).intersectsMesh(stone).hit,
  solidTop:()=>null,fallbackHeight:()=>3,
  canMove:(x,z,fx,fz,y)=>!collisionWorld.wall(fx,y+1.2,fz,x-fx,z-fz,Math.hypot(x-fx,z-fz)+.35)
};
for(const hz of [30,60,144])for(const [angle,radius] of [[0,6.9],[.12,6.95],[Math.PI/2,7.1],[Math.PI,7.1],[Math.PI*1.5,7.1]]){
  const dx=Math.cos(angle),dz=Math.sin(angle),x=14+dx*radius,z=-25+dz*radius;
  const floor=collisionWorld.ground(x,z,7,4);assert.ok(floor&&floor.height>5,'starts on the real rim');
  for(const jump of [false,true]){
    const avatar=new CharacterTraversalController();avatar.teleport(x,floor.height,z);avatar.supportRockId=floor.rockId;
    for(let i=0;i<hz*2;i++){
      const oldY=avatar.position.y;
      avatar.step(1/hz,{moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,horizontal:0,vertical:1,
        run:false,sprint:false,jumpPressed:jump&&i===0},collisionWorld);
      assert.ok(oldY-avatar.position.y<.75,`no instant drop through the rim at ${hz} Hz`);
    }
    assert.ok(Math.hypot(avatar.position.x-x,avatar.position.z-z)>3,`can ${jump?'jump':'walk'} off the fountain at ${hz} Hz`);
    assert.ok(avatar.position.y>=3,'remains above terrain');
  }
}
fountain.update(.05,{x:14,y:5,z:-25});scene.render();
const active=scene.getActiveMeshes();
for(const mesh of [stone,...scene.meshes.filter(m=>m.name.startsWith('fountain:'))])
  assert.ok(active.data.slice(0,active.length).includes(mesh),`${mesh.name} enters the render list`);
const initial=fountain.clock,matrices=Array.from(fountain.matrices);
for(let i=0;i<120;i++)fountain.update(1/60,{x:14,y:5,z:-25});
assert.equal(scene.meshes.filter(m=>m.name.startsWith('fountain:')).length,3,'water, four merged streams and one instanced splash draw mesh');
assert.ok(fountain.clock>initial);assert.notDeepEqual(Array.from(fountain.matrices),matrices);
assert.ok(Array.from(fountain.matrices).every(Number.isFinite));
const frozen=fountain.clock;fountain.update(.1,{x:14,y:5,z:-25},1,true,true);assert.equal(fountain.clock,frozen);
fountain.update(.1,{x:500,y:5,z:500});assert.ok(!scene.getTransformNodeByName('fountain:water-effects').isEnabled());
assert.equal(fountain.clock,frozen,'distant effects do not simulate');
fountain.update(.1,{x:14,y:5,z:-25},.2);assert.ok(scene.getTransformNodeByName('fountain:water-effects').isEnabled());
fountain.dispose();fountain.dispose();
assert.equal(scene.meshes.length,baseline.meshes);assert.equal(scene.materials.length,baseline.materials);
// Babylon owns its lazy, shared PBR lookup; the fountain must release its embedded texture.
assert.equal(scene.textures.filter(t=>!/^data:EnvironmentBRDFTexture/.test(t.name)).length,baseline.textures);
const late=new BrisaliaFountain(scene,parent,Vector3.Zero(),importer);late.dispose();await late.ready;
assert.equal(scene.meshes.length,baseline.meshes,'dispose during load does not leak geometry');
const failed=new BrisaliaFountain(scene,parent,Vector3.Zero(),async()=>{throw new Error('missing asset');});await failed.ready;
assert.match(failed.error,/missing asset/);assert.ok(!scene.getTransformNodeByName('fountain:water-effects').isEnabled());failed.dispose();
scene.dispose();engine.dispose();
console.log('Brisalia fountain: rim traversal at 30/60/144 Hz, original GLB, placement, four nozzle anchors, water impacts, collision, bounded effects, pause and lifecycle OK');
