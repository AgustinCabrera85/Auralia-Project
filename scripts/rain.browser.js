(async()=>{
 const w=window.__auraliaGame.world,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 w.engine.stopRenderLoop();w.pressed.clear();w.resetMovementEffects();
 const rain=w.climate.precipitation.rain,mesh=w.scene.getMeshByName('auralia-rain-field');
 check(mesh,'Rain field missing');check(!w.scene.particleSystems.some(p=>p.name==='auralia-rain'),'Old rain particles remain');
 const buffers=mesh.geometry,textures=w.scene.textures.length;
 for(let i=0;i<10;i++){
  w.climate.forcedWeather=i%2?'storm':'clear';w.climate.update(1/60);
  check(rain.stats.active===!!(i%2),'Weather transition did not toggle rain');
 }
 w.climate.setSheltered(true);w.climate.update(1/60);check(!rain.stats.active,'Rain remains in shelter');
 w.climate.setSheltered(false);w.climate.forcedWeather='storm';w.climate.setElapsedHours(15);
 check(buffers===mesh.geometry&&textures===w.scene.textures.length,'Weather changes allocated resources');
 const origin=w.village.buildings.get('B18').root.position;
 await w.geographicWorld.prepareAround(origin.x,origin.z);
 for(let i=0;i<1800&&(i===0||w.mainland.pendingCount);i++){w.streamMainland(origin.x,origin.z);if(i%8===0)await wait(1);}
 await window.__brisaliaRev3.view('B18','front');
 const review=window.__brisaliaRev3.camera;
 // Keep the audit camera independent of the gameplay collision/distance resolver.
 w.scene.activeCamera=review;rain.camera=review;review.getViewMatrix(true);
 for(let i=0;i<45;i++){w.climate.update(1/60);w.scene.render();if(i%8===0)await wait(2);}
 await w.scene.whenReadyAsync();w.scene.render();
 const start=performance.now();for(let i=0;i<5000;i++)rain.update(w.climate.frame,false,1/60);
 const updateMicroseconds=(performance.now()-start)*1000/5000;
 const gl=w.engine._gl,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');let gpuMs=null;
 if(ext){
  const q=gl.createQuery(),before=mesh.onBeforeRenderObservable.add(()=>gl.beginQuery(ext.TIME_ELAPSED_EXT,q));
  const after=mesh.onAfterRenderObservable.add(()=>gl.endQuery(ext.TIME_ELAPSED_EXT));
  w.scene.render();mesh.onBeforeRenderObservable.remove(before);mesh.onAfterRenderObservable.remove(after);
  for(let i=0;i<100&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++)await wait(10);
  if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;
  gl.deleteQuery(q);
 }
 w.climate.forcedWeather='rain';w.climate.setElapsedHours(15);w.callbacks.onClimate(w.climate.frame);w.scene.render();
 check(gl.getError()===gl.NO_ERROR,'Rain WebGL error');
 return {stats:rain.stats,vertices:mesh.getTotalVertices(),triangles:mesh.getTotalIndices()/3,
  cpuUpdateMicroseconds:updateMicroseconds,gpuDrawMilliseconds:gpuMs,
  resolution:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],depthTest:true,
  oldRainRemoved:true,weatherTransitions:true,shelter:true,resourceReuse:true};
})()
