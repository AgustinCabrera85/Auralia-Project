import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function checkDogo(evaluate,capture,save){
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.climate.setElapsedHours(10);const update=w.climate.update.bind(w.climate);w.climate.update=()=>update(0);})()`);
  const initial=await evaluate('window.__auraliaGame.world.geographicStatus.companion');
  assert.ok(initial.ready&&initial.registeredActions.length===22,JSON.stringify(initial));
  await capture('dogo-brisalia');
  // Same frozen pose/light/camera: validate visible shadows, not just flags.
  await evaluate(`(()=>{const w=window.__auraliaGame.world;window.__loops=[...w.engine._activeRenderLoops];w.engine.stopRenderLoop();w.scene.animationsEnabled=false;w.scene.render();})()`);
  await capture('sombras-activas');
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.scene.getLightByName('sol').shadowEnabled=false;w.scene.render();})()`);
  await capture('sombras-desactivadas');
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.scene.getLightByName('sol').shadowEnabled=true;w.scene.animationsEnabled=true;for(const loop of window.__loops)w.engine.runRenderLoop(loop);})()`);
  // Use a clear path near spawn and real WASD traversal, with no save/profile reuse.
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=-Math.PI/2;w.camera.beta=1.15;w.setVirtualKey('w',true);})()`);
  await delay(6500);
  const walking=await evaluate(`(()=>{const w=window.__auraliaGame.world;w.setVirtualKey('w',false);return {player:w.geographicStatus.position,dog:w.geographicStatus.companion};})()`);
  await capture('dogo-recorrido');
  assert.ok(Math.hypot(walking.dog.position.x-initial.position.x,walking.dog.position.z-initial.position.z)>8,'Dogo follows actual movement');
  assert.ok(Math.hypot(walking.player.x-walking.dog.position.x,walking.player.z-walking.dog.position.z)<20,'Dogo remains close');
  await evaluate(`(()=>{const w=window.__auraliaGame.world;window.__dogMotion=[];
    window.__dogObserver=w.scene.onAfterRenderObservable.add(()=>window.__dogMotion.push({time:performance.now(),...w.dogo.status}));
    w.setVirtualKey('d',true);})()`);
  await delay(2400);
  await capture('dogo-giro');
  await evaluate(`window.__auraliaGame.world.setVirtualKey('d',false)`);
  await delay(1400);
  const motion=await evaluate(`(()=>{const w=window.__auraliaGame.world;w.scene.onAfterRenderObservable.remove(window.__dogObserver);return window.__dogMotion;})()`);
  assert.ok(motion.some(s=>s.angularSpeed>.3&&s.animationWeights.Walk>.05),'turns animate the paws');
  assert.ok(motion.every(s=>s.recoveries===walking.dog.recoveries),'turns never respawn Dogo');
  const curious=[];
  let sniffCapture=false;
  for(let i=0;i<20;i++){
    await delay(800);const state=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {player:w.geographicStatus.position,dog:w.geographicStatus.companion};})()`);
    curious.push(state);
    if(!sniffCapture&&state.dog.sniffWeight>.85){await capture('dogo-olfateando');sniffCapture=true;}
  }
  assert.ok(curious.some(s=>s.dog.behavior==='curious'),'curiosity activates after Santi stops');
  assert.ok(sniffCapture,'sniffs while resting nearby');
  assert.ok(curious.every(s=>Math.hypot(s.player.x-s.dog.position.x,s.player.z-s.dog.position.z)<8.5),'curiosity stays on leash');
  await capture('dogo-curioseando');
  await evaluate(`window.__auraliaGame.world.travelGeographic(-3218,-184,'Pradera')`);await delay(6000);
  await capture('dogo-pasto');
  const feet=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {santi:w.santi.footContact,dogo:w.dogo.status.footContact};})()`);
  assert.ok(feet.santi.enabled&&feet.dogo.enabled);
  assert.ok(feet.santi.feet.length===2&&feet.dogo.feet.length===4);
  assert.ok([...feet.santi.feet,...feet.dogo.feet].every(f=>Number.isFinite(f.error)&&Math.abs(f.error)<.12),JSON.stringify(feet));
  const grass=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {dog:w.geographicStatus.companion,contact:w.grass.geographic.focus};})()`);
  assert.equal(grass.contact.companionRadius,1.5);
  assert.ok(Math.abs(grass.contact.companionX-grass.dog.position.x)<.001);
  const shadows=await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.characterShadows.generator;return {
    size:g.getShadowMap().getSize(),casters:g.getShadowMap().renderList.filter(m=>m.isEnabled()).map(m=>m.name),
    terrainReceivers:w.scene.meshes.filter(m=>m.name.startsWith('terreno-')&&m.receiveShadows).length,
    enabled:w.scene.getLightByName('sol').shadowEnabled};})()`);
  assert.ok(shadows.enabled&&shadows.size.width===1024&&shadows.terrainReceivers>0);
  assert.ok(shadows.casters.includes('Dogo_primitive0')&&shadows.casters.some(n=>!n.startsWith('Dogo')),'both models cast real shadows');
  await evaluate(`window.__auraliaGame.world.travelGeographic(1580,-688,'Lago de Nácar')`);await delay(6000);
  const water=await evaluate('window.__auraliaGame.world.geographicStatus');
  assert.ok(['swim','swimIdle'].includes(water.companion.locomotion),'water uses the NLA swim clips');
  await capture('dogo-nadando');
  await evaluate(`window.__auraliaGame.world.travelFloating('albor')`);await delay(6000);
  const realm=await evaluate('window.__auraliaGame.world.geographicStatus');
  assert.ok(realm.companion.visible&&Math.abs(realm.companion.position.y-realm.position.y)<8,'companion follows realm travel');
  await capture('dogo-albor');
  const metrics=await evaluate(`(()=>{const w=window.__auraliaGame.world,d=w.dogo;return {fps:w.engine.getFps(),heapBytes:performance.memory?.usedJSHeapSize,meshTriangles:d.asset.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),activeClips:d.status.activeClips,scale:d.root.getChildMeshes().find(m=>m.name==='Dogo_primitive0').getBoundingInfo().boundingBox.extendSizeWorld.y*2};})()`);
  await save('validation',{initial,walking,motion,curious,grass,shadows,feet,water:{position:water.position,companion:water.companion},realm:{position:realm.position,companion:realm.companion},metrics});
  console.log('Dogo browser: follow, turns, braking, sniff, curiosity, grass, shadows, swim and realm travel OK',metrics);
}
