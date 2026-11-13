/** Reproduce the Cumbres shore crossing without accessing the user's saves. */
export async function checkWaterEntry(evaluate,capture,save,before=false){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const gpu=await evaluate(`(async()=>{const t=await import('/tests/water-optics.browser.mjs');
   try{return {ok:true,result:await t.verifyDistantWater()};}catch(e){return {ok:false,error:String(e)};}})()`);
 await save('gpu',gpu);
 if(!before&&!gpu.ok)throw Error(gpu.error);
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');})()`);
 const records=[];
 for(const [id,x,z] of [['orilla',1842,-1735],['agua',1841,-1736],['regreso',1842,-1735]]){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Cumbres QA')`);
  // Save-position updates deliberately coalesce tiny movements. Place the
  // actual controller at each side of this one-metre shore crossing as well.
  await evaluate(`(()=>{const w=window.__auraliaGame.world,y=w.geographicWorld.surface.heightAt(${x},${z});w.traversal.teleport(${x},y,${z});w.player.position.set(${x},y,${z});})()`);
  for(let i=0;i<1800;i++){
   if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
   if(i===1799)throw Error('Entry streaming did not settle');await pause(200);
  }
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=2.02458;w.camera.beta=1.4;w.camera.radius=11.5;w.climate.setElapsedHours(5.5);window.__entryClimateUpdate??=w.climate.update.bind(w.climate);w.climate.update=()=>window.__entryClimateUpdate(0);})()`);await pause(1800);
  await capture(id);
  const state=await evaluate(`(()=>{const w=window.__auraliaGame.world,o=w.speedMotionBlur.optics;return {...w.geographicStatus,eye:w.camera.globalPosition.asArray(),optics:{weight:o.weight,level:o.level,surfaceMode:o.surfaceMode},triangles:w.scene.getActiveIndices()/3};})()`);
  records.push({id,...state});
 }
 await save('crossing',records);
 if(records[0].optics.weight!==0||records[1].optics.weight<.99||records[2].optics.weight!==0)
   throw Error('The shore crossing did not exercise the optical activation boundary');
 if(!before){
  const regression=await evaluate(`(async()=>{const t=await import('/tests/water-optics.browser.mjs');return {sloping:await t.verifySlopingWater(),boundary:await t.verifyWaterBoundary(),finite:await t.verifyFiniteWater()};})()`);
  await save('regressions',regression);
 }
}
