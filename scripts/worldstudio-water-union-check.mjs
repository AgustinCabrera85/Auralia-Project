/** Visual regressions above/below the single water surface, in a disposable profile. */
export async function checkWaterUnion(evaluate,capture,save,nativeOnly=false,views=null){
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');})()`);
 async function ready(){for(let i=0;i<1800;i++){
  if(await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()`))return;
  await delay(200);
 }throw new Error('Water streaming did not settle');}
 const optics=await evaluate(`(async()=>{const t=await import('/tests/water-optics.browser.mjs');return {sloping:await t.verifySlopingWater(),boundary:await t.verifyWaterBoundary(),finite:await t.verifyFiniteWater(),cascades:t.verifyGenericCascades()};})()`);
 await save('optics',optics);
 const mask=await evaluate(`(async()=>{const w=window.__auraliaGame.world,t=w.ocean.inlandMask,g=w.geographicWorld.oceanExclusion,rows=[];
   for(const [x,z] of [[-931,2282],[-1004,2165],[7500,7500]]){const ix=Math.floor((x+8192)/8),iz=Math.floor((z+8192)/8),data=await t.readPixels(0,0,null,true,false,ix,iz,1,1);rows.push({x,z,cpu:g.data[iz*2048+ix],gpu:data[0]});}
   return {rows,type:t.getInternalTexture().type};})()`);
 await save('gpu-ownership',mask);if(mask.type!==0||mask.rows.some(r=>r.cpu!==r.gpu))throw new Error('Ocean ownership was not uploaded correctly: '+JSON.stringify(mask));
 const cases=[['altapiedra',-1596,1429],['altapiedra-buceo',-1584,1472],['prado',-1501,1584],['brisalia',-1004,2165],['union-sur',-931,2282],['union-norte',-914,2335],['valle-lejos',-2309,1706],['valle-cerca',-2351,1817],['nacar',1710,-1340]];
 for(const [id,x,z] of cases.filter(c=>(!nativeOnly||c[0]==='brisalia')&&(!views||views.includes(c[0])))){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Agua QA')`);await ready();
  await evaluate(`(()=>{const w=window.__auraliaGame.world,r=w.geographicWorld.rivers.at(${x},${z});w.camera.alpha=r?Math.atan2(-r.dz,-r.dx):Math.PI/2;w.camera.beta=1.22;w.camera.radius=11.5;})()`);await delay(1500);
  const info=await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld,p=w.geographicStatus.position,r=g.rivers.at(p.x,p.z);return {...w.geographicStatus,river:r,depth:r?r.level-g.surface.heightAt(r.x,r.z):null,oceanExcluded:g.oceanExclusion.valueAt(p.x,p.z),waterMeshes:w.scene.meshes.filter(m=>m.metadata?.inlandWater&&m.isEnabled()).length};})()`);
  await capture(id);await save(id,info);
  if(['altapiedra-buceo','brisalia','union-sur','union-norte'].includes(id)){
   // Fixed submerged eye; resume the same render loop after the inspection.
   await evaluate(`(()=>{const w=window.__auraliaGame.world,r=w.geographicWorld.rivers.at(${x},${z});window.__waterLoops=[...w.engine._activeRenderLoops];w.engine.stopRenderLoop();
     w.camera.setTarget(new (w.player.position.constructor)(r.x+r.dx*15,r.level-1.4,r.z+r.dz*15));
     w.camera.setPosition(new (w.player.position.constructor)(r.x,r.level-2,r.z));w.camera.getViewMatrix(true);w.scene.render();})()`);
   await capture(id+'-sumergido');
   await evaluate(`(()=>{const w=window.__auraliaGame.world;for(const loop of window.__waterLoops)w.engine.runRenderLoop(loop);})()`);await delay(300);
  }
 }
 for(const id of ['laguna-tres-vertientes','nacimiento'].filter(id=>!views||views.includes(id))){
  await evaluate(`(()=>{const w=window.__auraliaGame.world,p=w.geographicWorld.destinations.find(d=>d.id===${JSON.stringify(id)});return w.travelGeographic(p.x,p.z,'Cuenca QA');})()`);await ready();await delay(5000);
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${id==='nacimiento'?-1.8:Math.PI/2};w.camera.beta=1.3;w.camera.radius=11.5;})()`);await delay(1200);
  const state=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {...w.geographicStatus,oldWater:w.scene.meshes.filter(m=>m.name==='laguna-superficie'||m.name==='laguna-alta-gemelas'||m.name.startsWith('vertientes-r')).length};})()`);
  if(state.oldWater)throw new Error('Duplicate native water surfaces');await capture(id);await save(id,state);
  if(nativeOnly&&id==='nacimiento'){
   await save('native-diagnostic',await evaluate(`(()=>{const w=window.__auraliaGame.world,p=w.camera.globalPosition,g=w.geographicWorld;return {eye:p.asArray(),field:g.waterFieldAt(p.x,p.z),optics:{weight:w.speedMotionBlur.optics.weight,slope:w.speedMotionBlur.optics.slope.asArray()},nearby:w.scene.meshes.filter(m=>m.isEnabled()&&m.name.includes('agua')).map(m=>({name:m.name,vertices:m.getTotalVertices()}))};})()`));
   await evaluate(`(()=>{const w=window.__auraliaGame.world;window.__savedWaterUpdate=w.speedMotionBlur.updateWaterSurface;w.speedMotionBlur.updateWaterSurface=()=>{};w.speedMotionBlur.optics.update(null);w.speedMotionBlur.immersion=0;w.speedMotionBlur.syncAttachment();})()`);await delay(500);await capture('nacimiento-sin-optica');
   await evaluate(`(()=>{const w=window.__auraliaGame.world;w.speedMotionBlur.updateWaterSurface=window.__savedWaterUpdate;})()`);
  }
 }
 // User-approved diversion: the protected building plot stays dry, while
 // its adjacent channel stays navigable around the whole settlement.
 if(nativeOnly||views&&!views.includes('brisalia-desvio'))return;
 const bypass=await evaluate(`(()=>{const g=window.__auraliaGame.world.geographicWorld,s=g.runtimeSplines.find(s=>s.id==='rv-prado'),p=s.controlPoints.reduce((a,b)=>Math.abs(b.z-g.town.z)<Math.abs(a.z-g.town.z)?b:a);return p;})()`);
 await evaluate(`window.__auraliaGame.world.travelGeographic(${bypass.x},${bypass.z},'Desvío de Brisalia')`);await ready();await delay(2000);await capture('brisalia-desvio');await save('brisalia-desvio',await evaluate('window.__auraliaGame.world.geographicStatus'));
}
