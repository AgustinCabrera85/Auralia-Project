/** Fixed view and settled streaming for before/after forest comparisons. */
export async function checkForest(evaluate,capture,save,collectGarbage){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');})()`);
 const rows=[];
 for(const [id,x,z,alpha] of [['nacar-isla',1524,-434,-2.2],['nacar-frente',1430,-414,-1.3788],['brisalia',-1249,1953,-2.2]]){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Arboledas QA')`);
  for(let i=0;i<2400;i++){
   if(await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&w.vegetation.ready&&!w.vegetation.pending.length&&!w.geography.pending.length&&!w.geography.activeBuild;})()`))break;
   if(i===2399)throw Error('Forest streaming did not settle');await pause(200);
  }
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=1.35;w.camera.radius=11.5;w.climate.setElapsedHours(9.5);window.__forestClimateUpdate??=w.climate.update.bind(w.climate);w.climate.update=()=>window.__forestClimateUpdate(0);})()`);
  await pause(2000);
  const result=await evaluate(`(async()=>{const w=window.__auraliaGame.world,v=w.vegetation,frames=[];let previous=0;
   await new Promise(resolve=>{const b=w.engine.onEndFrameObservable.add(()=>{const now=performance.now();if(previous)frames.push(now-previous);previous=now;if(frames.length===180){w.engine.onEndFrameObservable.remove(b);resolve();}});});
   const sources=map=>[...map].map(([kind,m])=>({kind,triangles:m.getTotalIndices()/3,instances:m.thinInstanceCount,materials:m.subMeshes.length}));
   frames.sort((a,b)=>a-b);return {id:${JSON.stringify(id)},position:w.geographicStatus.position,viewport:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],camera:{alpha:w.camera.alpha,beta:w.camera.beta,radius:w.camera.radius},
    vegetation:{chunks:v.activeChunkCount,instances:v.instanceCount,farInstances:v.farInstanceCount,canopyInstances:v.canopyInstanceCount??0,near:sources(v.sources),far:sources(v.farSources),canopy:v.canopySources?sources(v.canopySources):[],colliders:v.treeColliders.colliders.size,stats:v.stats??null},
    frameMs:{mean:frames.reduce((a,b)=>a+b,0)/frames.length,p95:frames[Math.floor(frames.length*.95)]},fps:w.engine.getFps(),heapBytes:performance.memory.usedJSHeapSize,heapAfterGC:false,sceneTriangles:w.scene.getActiveIndices()/3,source:w.geographicWorld.stats};})()`);
  await capture(id);
  if(collectGarbage){await collectGarbage();result.heapBytesAfterGC=await evaluate('performance.memory.usedJSHeapSize');}
  await save(id,result);rows.push(result);
  if(id==='nacar-frente'){
   await evaluate('window.__auraliaGame.world.climate.setElapsedHours(21.5)');await pause(600);await capture('nacar-frente-noche');
  }
 }
 await save('comparison',rows);
}
