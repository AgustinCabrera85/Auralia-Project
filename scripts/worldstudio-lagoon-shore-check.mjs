/** Reported lagoon shore, two angles, disposable browser profile. */
export async function checkLagoonShore(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');w.climate.setElapsedHours(10);const update=w.climate.update.bind(w.climate);w.climate.update=()=>update(0);})()`);
 await evaluate(`window.__auraliaGame.world.travelGeographic(-2936,-827,'Laguna de las Tres Vertientes')`);
 for(let i=0;i<1800;i++){
  if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.mainland.pendingCount&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
  if(i===1799)throw Error('Lagoon shore streaming did not settle');await pause(200);
 }
 for(let i=0;i<300;i++){
  if(await evaluate('(()=>{const w=window.__auraliaGame.world;return (!w.lagoonVegetation||w.lagoonVegetation.count>0)&&!w.authoredAssets.inFlight.size;})()'))break;
  if(i===299)throw Error('Lagoon vegetation did not load');await pause(200);
 }
 for(const [id,alpha] of [['noreste',2.618],['noroeste',1.117]]){
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=1.1;w.camera.radius=11.5;})()`);await pause(2000);
  await capture(id);
 }
 await save('status',await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld;return {...w.geographicStatus,eye:w.camera.globalPosition.asArray(),fps:w.engine.getFps(),terrainBytes:w.mainland.approxGeometryBytes,triangles:w.scene.getActiveIndices()/3,lagoon:g.lagoon,samples:[[-2936,-827],[-2940,-820],[-2948,-812],[-2928,-824]].map(([x,z])=>({x,z,ground:g.surface.heightAt(x,z),water:g.waterFieldAt(x,z),oceanMask:g.oceanExclusion.valueAt(x,z)}))};})()`));
 await evaluate('(()=>{const w=window.__auraliaGame.world;w.ocean.near.isVisible=false;w.ocean.far.isVisible=false;})()');
 await pause(200);await capture('sin-oceano');
 await evaluate('(()=>{const w=window.__auraliaGame.world;w.ocean.near.isVisible=true;w.ocean.far.isVisible=true;})()');
 await save('vegetation',await evaluate(`(()=>{const w=window.__auraliaGame.world,a=w.authoredAssets;
  const meshes=w.scene.meshes.filter(m=>m.metadata?.authoredAsset?.startsWith('v3Wetland'));
  const visible=meshes.filter(m=>m.isVisible),drawn=[...new Set([...a.idsByMesh.values()].flat().filter(id=>id.startsWith('lagoon-shore-v1-')))];
  return {placements:w.lagoonVegetation?.count,generationMs:w.lagoonVegetation?.generationMs,
   visiblePlacements:drawn.length,visibleBatches:visible.length,errors:a.errors,
   triangles:visible.reduce((n,m)=>n+m.getTotalIndices()/3*m.thinInstanceCount,0),
   instanceBufferBytes:visible.reduce((n,m)=>n+m.thinInstanceCount*64,0),heapBytes:performance.memory?.usedJSHeapSize,
   batches:visible.map(m=>({name:m.name,instances:m.thinInstanceCount,triangles:m.getTotalIndices()/3}))};})()`));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=1.117;w.camera.beta=1.12;})()`);
 await pause(1200);await capture('vegetacion');
 // The river mouths must remain readable and the migrated impact foam active.
 await save('impacts',await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.geographicWorld.waterImpacts;})()`));
 for(const [id,x,z,alpha] of [['ferragris',-2981,-1225,2.7],['velo',-2689,-1315,2.1],['gemelas',-2400,-1269,1.4]]){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Cascada ${id}')`);
  for(let i=0;i<1200;i++){
   if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
   if(i===1199)throw Error('Cascade streaming did not settle');await pause(100);
  }
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=1.15;})()`);
  await pause(1500);await capture(id);
 }
 await evaluate(`window.__auraliaGame.world.travelGeographic(-1250,1943,'Brisalia')`);
 await pause(3000);
 const outside=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {drawn:[...w.authoredAssets.idsByMesh.values()].flat().filter(id=>id.startsWith('lagoon-shore-v1-')).length,errors:w.authoredAssets.errors};})()`);
 await save('vegetation-outside',outside);
 if(outside.drawn||outside.errors.length)throw Error('Lagoon vegetation culling or asset loading failed');
}
