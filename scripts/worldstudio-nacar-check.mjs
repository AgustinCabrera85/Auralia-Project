/** Actual keyboard/controller descent in Nácar, in the isolated QA profile. */
export async function checkNacar(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const state=()=>evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld,p=w.geographicStatus.position,water=g.waterAt(p.x,p.z);return {...w.geographicStatus,submerged:w.traversal.swimSubmerged,waterLevel:water?.level,bed:g.surface.heightAt(p.x,p.z),camera:w.camera.globalPosition.asArray()};})()`);
 async function travel(x,z){
  await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'Nácar QA')`);
  for(let i=0;i<1800;i++){
   if(await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()`))break;
   if(i===1799)throw Error('Nácar streaming did not settle');await pause(200);
  }
  await pause(2000);
 }
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');w.camera.radius=11.5;w.camera.beta=1.22;})()`);
 await travel(1580,-688);await evaluate('window.__auraliaGame.world.camera.alpha=2.3');await pause(1200);
 const shelf=await state();await capture('nacar-plataforma-insular');
 await travel(1700,-1000);await evaluate('window.__auraliaGame.world.camera.alpha=2.3');await pause(1200);
 const surface=await state();if(surface.mode!=='swimming'||surface.waterLevel-surface.bed<70)throw Error('Deep Nácar basin not active');
 await capture('nacar-superficie');
 await evaluate("window.__auraliaGame.world.setVirtualKey('control',true)");
 try{
  await pause(11000);await capture('nacar-descenso');await pause(9000);
 }finally{await evaluate("window.__auraliaGame.world.setVirtualKey('control',false)");}
 await pause(1500);const bottom=await state();
 if(bottom.mode!=='swimming'||!bottom.submerged||Math.abs(bottom.position.y-bottom.bed-.3)>.2)throw Error('Deep dive did not reach canonical bed: '+JSON.stringify(bottom));
 await capture('nacar-fondo');
 const performance=await evaluate(`(async()=>{const w=window.__auraliaGame.world,frames=[];let previous=0;
  await new Promise(resolve=>{const b=w.engine.onEndFrameObservable.add(()=>{const now=performance.now();if(previous)frames.push(now-previous);previous=now;if(frames.length===180){w.engine.onEndFrameObservable.remove(b);resolve();}});});
  frames.sort((a,b)=>a-b);return {fps:w.engine.getFps(),frameMean:frames.reduce((a,b)=>a+b,0)/frames.length,frameP95:frames[Math.floor(frames.length*.95)],heapBytes:performance.memory.usedJSHeapSize,heapAfterGC:false,terrainBytes:w.mainland.approxGeometryBytes,source:w.geographicWorld.stats,opticalSurfacePass:w.speedMotionBlur.optics.surfaceMode};})()`);
 const held=await state();if(Math.abs(held.position.y-bottom.position.y)>.02)throw Error('Released Ctrl does not hold depth');
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.setVirtualKey('space',true);w.setVirtualKey('space',false);})()`);await pause(21000);
 const returned=await state();if(returned.submerged||Math.abs(returned.position.y-surface.position.y)>.1)throw Error('Cannot resurface from deep lake');
 await capture('nacar-regreso');
 await travel(1373,-438);const island=await state();if(island.mode!=='grounded')throw Error('Approved island no longer walkable');await capture('nacar-isla');
 await save('nacar',{shelf,surface,bottom,held,returned,island,performance});
}
