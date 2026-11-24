(async()=>{
 const w=window.__auraliaGame.world,wait=ms=>new Promise(r=>setTimeout(r,ms));w.engine.stopRenderLoop();
 const source=await(await fetch('/src/game/WorldView.ts')).text();
 const B=await import(source.match(/from\s+["']([^"']+@babylonjs_core[^"']*)["']/)[1]);
 const scene=new B.Scene(w.engine),camera=new B.ArcRotateCamera('impact-depth',-Math.PI/2,1.1,11,new B.Vector3(0,.6,0),scene);
 camera.minZ=.01;scene.clearColor=new B.Color4(.1,.1,.1,1);new B.HemisphericLight('impact-light',new B.Vector3(0,1,0),scene);
 const fx=new w.groundImpactFX.constructor(scene),ground={x:0,y:0,z:0};await fx.prepare();
 const cover=B.MeshBuilder.CreatePlane('impact-depth-cover',{size:40,sideOrientation:B.Mesh.DOUBLESIDE},scene);
 cover.position.copyFrom(camera.position.scale(.7).add(camera.target.scale(.3)));cover.lookAt(camera.position);
 const mat=new B.StandardMaterial('impact-cover',scene);mat.disableLighting=true;mat.emissiveColor.set(.2,.1,.05);cover.material=mat;
 const pixels=async()=>{scene.render();return new Uint8Array(await w.engine.readPixels(0,0,w.engine.getRenderWidth(),w.engine.getRenderHeight()));};
 const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
 try{
  await scene.whenReadyAsync();const base=await pixels();fx.trigger(ground);fx.update(.1);fx.update(.1);
  const hidden=diff(base,await pixels());if(hidden)throw Error(`Impact visible through opaque surface: ${hidden}`);
  cover.setEnabled(false);fx.reset();const clear=await pixels();fx.trigger(ground);fx.update(.1);fx.update(.1);
  const visible=diff(clear,await pixels());if(visible<100)throw Error('Positive occlusion control failed');
  fx.trigger({x:2,y:0,z:0});fx.update(.1);await scene.whenReadyAsync();scene.render();
  const gl=w.engine._gl,ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),times=[];
  if(ext)for(let i=0;i<12;i++){
   const query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);scene.render();gl.endQuery(ext.TIME_ELAPSED_EXT);
   for(let j=0;j<100&&!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);j++)await wait(5);
   if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))times.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
   gl.deleteQuery(query);
  }
  times.sort((a,b)=>a-b);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error during impact test');
  return {resolution:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],hiddenPixels:hidden,visiblePixels:visible,
   twoImpacts:fx.getStats(),gpuSamples:times.length,gpuIsolatedSceneMedianMs:times.length?times[Math.floor(times.length/2)]:null};
 }finally{fx.dispose();scene.dispose();w.scene.render();}
})()
