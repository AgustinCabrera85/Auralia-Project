// Uses only the isolated QA Chrome profile on port 9228.
import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.join(process.env.TEMP??'.test-build','auralia-cave-review');await fs.mkdir(output,{recursive:true});
const target=(await (await fetch('http://127.0.0.1:9228/json/list')).json()).find(p=>p.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let serial=0;
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const capture=async name=>{const r=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));};
try{
 console.log('prepare',await evaluate(`(async()=>{
  const w=window.__auraliaGame.world,d=await import('/src/world/cavePortalGeometry.ts'),b=await import((await (await fetch('/src/world/VolcanicCaveSystem.ts')).text()).match(/from ["']([^"']*babylonjs_core[^"']*)["']/)[1]);
  w.engine.stopRenderLoop();if(w.volcanicCave.inside)w.leaveVolcanicCave();
  const p=d.caveEntrancePoint(0,24);await w.travelGeographic(p.x,p.z);w.engine.stopRenderLoop();w.climate.setElapsedHours(12);w.climate.clockScale=0;
  w.camera.alpha=Math.PI/2+.0755;w.camera.beta=1.3;w.camera.radius=25;w.cameraPreferredRadius=25;
  const frame=async(keys=[])=>{w.pressed.clear();keys.forEach(k=>w.pressed.add(k));w.engine.beginFrame();w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();w.engine.endFrame();await new Promise(r=>requestAnimationFrame(r));};
  const place=(x,z)=>{const p=d.caveEntrancePoint(x,z),y=w.geographicWorld.surface.heightAt(p.x,p.z);w.traversal.teleport(p.x,y,p.z);w.player.position.set(p.x,y,p.z);w.camera.setTarget(w.player.position.add(new b.Vector3(0,3,0)),false,false,true);};
  window.__entryQA={w,d,b,frame,place};place(0,24);
  for(let i=0;i<900;i++){await frame();if(i>60&&w.scene.isReady()&&w.geographicStatus.ready)break;}
  return {ready:w.geographicStatus.ready,scene:w.scene.isReady(),action:w.santi.active?.name};
 })()`));
 await capture('approach');
 for(const [name,alpha] of [['entrance-left',.65],['entrance-right',2.5]]){await evaluate(`(async()=>{const {w,frame,place}=window.__entryQA;place(0,10);w.camera.alpha=${alpha};for(let i=0;i<30;i++)await frame();})()`);await capture(name);}
 await evaluate(`(()=>{const {w,place}=window.__entryQA;place(0,24);w.camera.alpha=Math.PI/2+.0755;})()`);
 console.log('walk',await evaluate(`(async()=>{const {w,d,frame}=window.__entryQA;let frames=0;
  while(d.caveEntranceLocal(w.player.position.x,w.player.position.z).z>-2&&frames++<300){await frame(['w']);if(w.traversal.mode!=='grounded')throw Error('Entrance is not walkable: '+w.traversal.mode);}
  if(frames>=300)throw Error('Entrance walk blocked');w.pressed.clear();for(let i=0;i<30;i++)await frame();
  if(w.volcanicCave.inside||w.volcanicCave.nearestAction(w.player.position)!=='enter')throw Error('Missing optional entry');
  return {frames,mode:w.traversal.mode,position:w.player.position.asArray(),action:w.volcanicCave.nearestAction(w.player.position)};
 })()`));await capture('recess');
 console.log('transition',await evaluate(`(async()=>{const {w,frame}=window.__entryQA;w.interact();if(!w.volcanicCave.inside)throw Error('E did not enter');w.interact();if(w.volcanicCave.inside)throw Error('E did not exit');await frame();return {inside:w.volcanicCave.inside,mode:w.traversal.mode};})()`));
 console.log('hang',await evaluate(`(async()=>{
  const {w,d,b,frame,place}=window.__entryQA,p=d.caveEntrancePoint(0,20),base=w.geographicWorld.surface.heightAt(p.x,p.z);
  const box=b.MeshBuilder.CreateBox('qa-straight-ledge',{width:10,depth:8,height:5},w.scene);box.position.set(p.x,base+2.5,p.z);box.rotation.y=-.0755;
  box.material=w.volcanicCave.stone;box.computeWorldMatrix(true);w.lagoon.rockColliders.registerGeneratedMesh(box);window.__entryQA.box=box;
  place(0,25.4);w.camera.alpha=Math.PI/2+.0755;w.camera.beta=1.3;w.camera.radius=18;w.cameraPreferredRadius=18;
  w.jumpRequested=true;let frames=0;
  do{await frame(['w']);}while(w.traversal.mode!=='hanging'&&frames++<120);
  if(w.traversal.mode!=='hanging')throw Error('Jump did not catch real mesh: '+JSON.stringify(w.geographicStatus.position));
  const held=w.player.position.clone();for(let i=0;i<30;i++)await frame(['w']);
  if(w.traversal.mode!=='hanging'||b.Vector3.Distance(held,w.player.position)>.01)throw Error('Auto-climb or drift');
  await frame();w.camera.alpha=.4;for(let i=0;i<35;i++)await frame();
  return {mode:w.traversal.mode,action:w.santi.active?.name,position:w.player.position.asArray(),hands:w.santi.contactHands.map(h=>h.getAbsolutePosition().y),edge:base+5};
 })()`));await capture('hanging');
 console.log('climb',await evaluate(`(async()=>{const {w,frame,box}=window.__entryQA;await frame(['w']);for(let i=0;i<90;i++)await frame();if(w.traversal.mode!=='grounded'||Math.abs(w.player.position.y-(box.position.y+2.5))>.2)throw Error('W failed to climb');return {mode:w.traversal.mode,position:w.player.position.asArray()};})()`));await capture('on-ledge');

 console.log('cave ledge',await evaluate(`(async()=>{
  const {w,b,frame,place}=window.__entryQA;place(0,-2);w.interact();const world=w.volcanicCave.traversalWorld();let found=false;
  for(let z=-23;z<-16&&!found;z+=.15){
   w.traversal.teleport(0,-397.4,z);w.traversal.mode='airborne';
   w.traversal.step(1/60,{moveX:0,moveZ:0,forwardX:0,forwardZ:1,horizontal:0,vertical:0,run:false,sprint:false,jumpPressed:false},world);
   if(w.traversal.mode==='hanging')found=true;
  }
  if(!found)throw Error('No grab on the real tapered bridge edge');
  const p=w.traversal.position;w.player.position.set(p.x,p.y,p.z);w.camera.setTarget(w.player.position.add(new b.Vector3(0,3,0)),false,false,true);w.camera.alpha=-.65;w.camera.beta=1.3;w.camera.radius=12;w.cameraPreferredRadius=12;
  for(let i=0;i<60;i++)await frame();
  const edge=w.traversal.climbContact,hands=w.santi.contactHands.map(h=>h.getAbsolutePosition());
  if(w.traversal.mode!=='hanging'||hands.some(h=>Math.abs(h.y-edge.pointY)>.12))throw Error('Hands miss the real cave edge');
  return {mode:w.traversal.mode,edge:{x:edge.pointX,y:edge.pointY,z:edge.pointZ},hands:hands.map(h=>h.asArray())};
 })()`));await capture('cave-hanging');

 await evaluate(`(async()=>{const {w,b,frame}=window.__entryQA;w.traversal.teleport(0,-399.9,62);w.player.position.set(0,-399.9,62);w.camera.alpha=Math.PI/2;w.camera.beta=1.25;w.cameraPreferredRadius=18;w.camera.setTarget(w.player.position.add(new b.Vector3(0,3,0)),false,false,true);for(let i=0;i<60;i++)await frame();})()`);
 await capture('arrival');
 await fs.copyFile(path.join(output,'approach.png'),'artifacts/volcanic-cave/entrance.png');
 await fs.copyFile(path.join(output,'arrival.png'),'artifacts/volcanic-cave/arrival.png');
 console.log(output);
}finally{
 try{await evaluate(`(()=>{const q=window.__entryQA;if(!q?.box)return;for(const m of [...q.w.scene.meshes])if(m.name==='collider-qa-straight-ledge')m.dispose(false,false);q.box.dispose(false,false);q.box=null;})()`);}catch{}
 ws.close();
}
