(async()=>{
  const {world:w}=window.__auraliaGame,a=w.abilities;
  w.engine.stopRenderLoop();window.dispatchEvent(new Event('focus'));
  const assert=(ok,m)=>{if(!ok)throw Error(m);};
  a.interrupt();a.development('sandbox');a.development('unlock','forest_roots');a.select('forest_roots');
  a.development('level','4');a.development('cooldown');
  for(let i=0;i<200&&a.presentation.roots.diagnostics.state!=='ready';i++)await new Promise(r=>setTimeout(r,50));
  const sample=()=>{const times=[];for(let i=0;i<30;i++){
    const start=performance.now();w.scene.render();times.push(performance.now()-start);
  }return {mean:times.reduce((a,b)=>a+b,0)/times.length,max:Math.max(...times)};};
  const baseline=sample();a.request();a.manager.update(1.55);w.scene.render();
  assert(a.manager.execution?.committed,'need a committed attack');
  const active=sample(),e=a.manager.execution;
  const start=performance.now();for(let i=0;i<100;i++)a.presentation.update(e);
  const fxUpdateMs=(performance.now()-start)/100;
  const allocations={meshes:w.scene.meshes.length,materials:w.scene.materials.length,morphs:w.scene.morphTargetManagers.length};
  const rootMeshesBefore=w.scene.meshes.filter(m=>m.name.startsWith('root-')).length;
  const {RootsFx}=await import('/src/game/abilities/RootsFx.ts');
  const nativeFetch=window.fetch;let aborted=false;
  window.fetch=(url,options)=>String(url).includes('/assets/abilities/')?new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('test abort','AbortError'));});
  }):nativeFetch(url,options);
  const pending=new RootsFx(w.scene);pending.prepare();pending.dispose();
  await new Promise(r=>setTimeout(r,0));window.fetch=nativeFetch;
  assert(aborted,'pending download not aborted');assert(!pending.ready().ok,'disposed resource reports ready');
  assert(w.scene.meshes.filter(m=>m.name.startsWith('root-')).length===rootMeshesBefore&&
    pending.diagnostics.instances===0,'late load created a root mesh');
  const owned=a.presentation.roots.pool.flatMap(p=>p.entries?.rootNodes.flatMap(n=>n.getChildMeshes())??[]);
  const managers=new Set(owned.map(m=>m.morphTargetManager).filter(Boolean));
  a.dispose();
  assert(owned.every(m=>m.isDisposed()),'instance survived disposal');
  assert(!w.santi.special,'character special not released');
  assert(a.presentation.roots.diagnostics.instances===0,'pool not freed');
  assert([...managers].every(m=>!w.scene.morphTargetManagers.includes(m)),'morph manager survived disposal');
  return {baselineRenderCpuMs:baseline,activeRenderCpuMs:active,fxUpdateCpuMs:fxUpdateMs,
    note:'Headless scene.render CPU timings, 30 warmed samples; not GPU frame times or an FPS promise.',
    pendingDownloadAborted:aborted,noLateMeshes:true,disposedInstances:owned.length,
    beforeDisposal:allocations,afterDisposal:{meshes:w.scene.meshes.length,materials:w.scene.materials.length,morphs:w.scene.morphTargetManagers.length}};
})()
