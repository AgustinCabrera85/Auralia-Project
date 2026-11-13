/** Repeatable player-scale views of the Cumbres cascade, without user saves. */
export async function checkCascade(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');w.climate.setElapsedHours(10);const update=w.climate.update.bind(w.climate);w.climate.update=()=>update(0);})()`);
 for(const [id,x,z,alpha,beta] of [['lateral',2129,-2538,3.42,1.4],['superior',2165,-2704,3.18,1.4],['frente',2145,-2341,1.82,1.4]]){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Cascada de Cumbres')`);
  for(let i=0;i<1800;i++){
   if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.mainland.pendingCount&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
   if(i===1799)throw Error('Cascade streaming did not settle');await pause(200);
  }
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=${beta};w.camera.radius=11.5;})()`);await pause(2000);
  await capture(id);
  await save(id,await evaluate(`(()=>{const w=window.__auraliaGame.world;return {...w.geographicStatus,eye:w.camera.globalPosition.asArray(),fps:w.engine.getFps(),heapBytes:performance.memory?.usedJSHeapSize,terrainBytes:w.mainland.approxGeometryBytes,triangles:w.scene.getActiveIndices()/3};})()`));
 }
}
