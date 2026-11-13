/** Same shore/angles reported by the user, isolated browser and no user saves. */
export async function checkLakeShore(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');})()`);
 const records=[];
 for(const [id,x,z,alpha] of [['cumbres-este',1762,-1466,-2.845],['cumbres-oeste',1770,-1464,.0873]]){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Desembocadura QA')`);
  for(let i=0;i<1800;i++){
   if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
   if(i===1799)throw Error('Shore streaming did not settle');await pause(200);
  }
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=1.1;w.camera.radius=11.5;w.climate.setElapsedHours(9.5);window.__shoreClimateUpdate??=w.climate.update.bind(w.climate);w.climate.update=()=>window.__shoreClimateUpdate(0);})()`);await pause(1500);
  await capture(id);
  const state=await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld;return {...w.geographicStatus,eye:w.camera.globalPosition.asArray(),lakeDomains:g.lakes.map(l=>({id:l.id,domain:l.domain?.stats})),samples:[[1760,-1460],[1770,-1460],[1780,-1460],[1800,-1450]].map(([x,z])=>({x,z,ground:g.surface.heightAt(x,z),water:g.waterFieldAt(x,z),mask:g.oceanExclusion.valueAt(x,z)}))};})()`);
  records.push(state);await save(id,state);
  if(id==='cumbres-este'){
   await evaluate('(()=>{const w=window.__auraliaGame.world;w.ocean.near.setEnabled(false);w.ocean.far.setEnabled(false);})()');await pause(100);await capture('cumbres-sin-oceano');
   await evaluate('(()=>{const w=window.__auraliaGame.world;w.ocean.near.setEnabled(true);w.ocean.far.setEnabled(true);})()');
  }
 }
 await save('comparison',records);
}
