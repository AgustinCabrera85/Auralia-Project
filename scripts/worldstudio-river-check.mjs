/** River acceptance checks against the running game, using its real controller. */
export async function checkStudioRivers(evaluate,capture,save){
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function ready(){for(let i=0;i<600;i++){
    if(await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()`))return;
    await pause(200);
  }throw new Error('River stream did not settle');}
  const views=[['prado',-1501,1584,.70],['valle-lejos',-2309,1706,5.04],['valle-cerca',-2351,1817,5.14],['desembocadura',1710,-1340,Math.PI/2]];
  const results=[];
  for(const [id,x,z,alpha] of views){
    await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Rivers QA')`);await ready();
    await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=1.22;w.camera.radius=11.5;w.setRenderQuality('performance');w.engine.maxFPS=30;})()`);
    await pause(3500);
    const result=await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld,p=w.geographicStatus.position,r=g.rivers.at(p.x,p.z);
      const mesh=w.scene.meshes.filter(m=>m.metadata?.inlandWater&&m.isEnabled());
      return {id:${JSON.stringify(id)},...w.geographicStatus,fps:w.engine.getFps(),heap:performance.memory?.usedJSHeapSize,
        terrainBytes:w.mainland.approxGeometryBytes,river:r,centerDepth:r?r.level-g.surface.heightAt(r.x,r.z):null,
        water:{meshes:mesh.length,vertices:mesh.reduce((n,m)=>n+m.getTotalVertices(),0),triangles:mesh.reduce((n,m)=>n+m.getTotalIndices()/3,0),
          clear:w.geography.material.needAlphaBlending()},camera:{alpha:w.camera.alpha,beta:w.camera.beta,radius:w.camera.radius}};})()`);
    if(!result.water.clear)throw new Error('Old opaque river material');
    if(id!=='desembocadura'&&result.centerDepth<4.5)throw new Error('Shallow river bed');
    await capture(id);await save(id,result);results.push(result);
  }
  // Enter the real river, settle into swimming, then leave onto the outer bank.
  await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.travelGeographic(-1513.607889,1590.46545,'River swim');})()`);await ready();await pause(1800);
  const swimming=await evaluate('window.__auraliaGame.world.geographicStatus');
  if(swimming.mode!=='swimming')throw new Error('Deep river does not enable swimming: '+swimming.mode);
  await capture('prado-nadando');
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=Math.atan2(.456309,-.889821);w.setVirtualKey('w',true);})()`);
  await pause(7000);await evaluate("window.__auraliaGame.world.setVirtualKey('w',false)");await pause(1000);
  const bank=await evaluate('window.__auraliaGame.world.geographicStatus');
  if(!['grounded','falling','climbing'].includes(bank.mode))throw new Error('Could not exit river: '+bank.mode);
  await capture('prado-orilla');await save('swimming',{swimming,bank});
  return results;
}

/** Surface, dive, return and a real bank exit; no position changes after entry. */
export async function checkRiverTraversal(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`window.__auraliaGame.world.travelGeographic(-1513.607889,1590.46545,'Natación QA')`);
 for(let i=0;i<1200;i++){
   if(await evaluate('window.__auraliaGame.world.geographicStatus.ready'))break;
   if(i===1199)throw Error('River movement loading timed out');await pause(200);
 }
 await pause(2000);
 const state=()=>evaluate(`(()=>{const w=window.__auraliaGame.world;return {...w.geographicStatus,submerged:w.traversal.swimSubmerged};})()`);
 const toggle=()=>evaluate(`(()=>{const w=window.__auraliaGame.world;w.setVirtualKey('space',true);w.setVirtualKey('space',false);})()`);
 if((await state()).submerged){await toggle();await pause(3000);}
 const surface=await state();if(surface.mode!=='swimming'||surface.submerged)throw Error('Cannot swim at surface');
 // Measure after all water cells settle, including the actual interface pass.
 for(let i=0;i<1800;i++){
   if(await evaluate('!window.__auraliaGame.world.geography.pending.length&&!window.__auraliaGame.world.geography.activeBuild'))break;
   if(i===1799)throw Error('Water performance stream did not settle');await pause(200);
 }
 const performance=await evaluate(`(async()=>{const w=window.__auraliaGame.world,frames=[],cpu=[];let previous=0,begin=0;
   const a=w.engine.onBeginFrameObservable.add(()=>begin=performance.now());
   await new Promise(resolve=>{const b=w.engine.onEndFrameObservable.add(()=>{const now=performance.now();cpu.push(now-begin);if(previous)frames.push(now-previous);previous=now;if(frames.length===300){w.engine.onEndFrameObservable.remove(b);resolve();}});});
   w.engine.onBeginFrameObservable.remove(a);const stats=a=>{a.sort((a,b)=>a-b);return {mean:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)]};};
   const optics=w.speedMotionBlur.optics;return {frames:frames.length,fps:w.engine.getFps(),frameMs:stats(frames),cpuMs:stats(cpu),heapBytes:performance.memory.usedJSHeapSize,heapAfterGC:false,
     surfacePass:optics.surfaceMode,surfaceTarget:optics.surfaceDepth?.getDepthMap().getSize(),terrainBytes:w.mainland.approxGeometryBytes,source:w.geographicWorld.stats};})()`);
 if(!performance.surfacePass)throw Error('Missing real water interface pass');await save('swimming-performance',performance);
 await capture('movimiento-superficie');await toggle();await pause(3000);
 const dive=await state();if(!dive.submerged||dive.position.y>surface.position.y-.8)throw Error('Dive did not descend');
 await capture('movimiento-buceo');await toggle();await pause(3000);
 const returned=await state();if(returned.submerged||Math.abs(returned.position.y-surface.position.y)>.3)throw Error('Cannot return to surface');
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=Math.atan2(.456309,-.889821);w.setVirtualKey('w',true);})()`);
 try{await pause(7000);}finally{await evaluate("window.__auraliaGame.world.setVirtualKey('w',false)");}
 await pause(1000);const bank=await state();
 if(bank.mode!=='grounded')throw Error('Could not walk out of river: '+bank.mode);
 await capture('movimiento-orilla');await save('movement',{surface,dive,returned,bank});
}
