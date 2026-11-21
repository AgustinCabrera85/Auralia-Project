(async()=>{
 const w=window.__auraliaGame.world,engine=w.engine,scene=w.scene;
 engine.stopRenderLoop();
 const imageUrls=()=>engine.getLoadedTexturesCache().filter(t=>t.url).map(t=>t.url).sort();
 const before={textures:engine.getLoadedTexturesCache().length,buildings:w.village.buildings.size,imageUrls:imageUrls()};
 const gl=engine._gl,extension=gl.getExtension('WEBGL_lose_context');
 if(!extension)throw Error('Context-loss test extension unavailable');
 if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error before context restoration test');
 const restored=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Context restoration timed out')),60000);
  engine.onContextRestoredObservable.addOnce(()=>{clearTimeout(timeout);resolve();});
 });
 extension.loseContext();await new Promise(r=>setTimeout(r,250));extension.restoreContext();await restored;
 await scene.whenReadyAsync();for(let i=0;i<4;i++){scene.render();await new Promise(r=>setTimeout(r,50));}
 // whenReadyAsync covers visible materials; cached, disabled prefabs also
 // reload asynchronously and must finish before auditing every resident image.
 for(let i=0;i<1200&&engine.getLoadedTexturesCache().some(t=>!t.isReady);i++)
  await new Promise(r=>setTimeout(r,50));
 const textures=engine.getLoadedTexturesCache();
 if(textures.some(t=>!t.isReady))throw Error('Texture missing after context restoration: '+textures.filter(t=>!t.isReady).map(t=>t.url).join(', '));
 if(JSON.stringify(imageUrls())!==JSON.stringify(before.imageUrls))throw Error('Resident image set changed after restoration');
 if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error after context restoration');
 return {restored:true,before:{textures:before.textures,buildings:before.buildings,images:before.imageUrls.length},after:{textures:textures.length,buildings:w.village.buildings.size,images:imageUrls().length},
  compressed:textures.filter(t=>t._extension==='.ktx2').length,
  externalTextureRequests:performance.getEntriesByType('resource').filter(e=>/ktx|wasm/.test(e.name)&&new URL(e.name).origin!==location.origin).map(e=>e.name)};
})()
