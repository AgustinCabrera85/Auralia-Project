(async()=>{
 const w=window.__auraliaGame.world;w.engine.stopRenderLoop();
 const source=await(await fetch('/src/world/BrisaliaVillage.ts')).text();
 const B=await import(source.match(/from\s+["']([^"']+@babylonjs_core[^"']*)["']/)[1]);
 const {RainFX}=await import('/src/world/climate/RainFX.js');
 const scene=new B.Scene(w.engine),camera=new B.ArcRotateCamera('fx-depth-test',-Math.PI/2,1.1,9,new B.Vector3(0,1,0),scene);
 camera.minZ=.01;
 const fx=new w.doubleJumpFX.constructor(scene,{poolSize:1}),rain=new RainFX(scene,{quality:'low',intensity:0,groundY:0});
 scene.clearColor=new B.Color4(.1,.1,.1,1);scene.getAnimationRatio=()=>1;
 const cover=B.MeshBuilder.CreatePlane('opaque-depth-cover',{size:40,sideOrientation:B.Mesh.DOUBLESIDE},scene);
 cover.position.copyFrom(camera.position.scale(.6).add(camera.target.scale(.4)));
 cover.lookAt(camera.position);
 const material=new B.StandardMaterial('depth-cover',scene);material.disableLighting=true;material.emissiveColor.set(.2,.1,.05);cover.material=material;
 const pixels=async()=>{for(let i=0;i<4;i++)scene.render();return new Uint8Array(await w.engine.readPixels(0,0,w.engine.getRenderWidth(),w.engine.getRenderHeight()));};
 const difference=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
 try{
  await fx.prepare();await scene.whenReadyAsync();const base=await pixels();
  fx.trigger({x:0,y:1,z:0},{x:1,z:0});fx.update(.15);
  const hidden=await pixels(),hiddenPixels=difference(base,hidden);
  if(hiddenPixels)throw Error(`FX visible through opaque cover: ${hiddenPixels} pixels`);
  cover.setEnabled(false);fx.reset();const empty=await pixels();
  fx.trigger({x:0,y:1,z:0},{x:1,z:0});fx.update(.15);const visiblePixels=difference(empty,await pixels());
  if(visiblePixels<100)throw Error('Occlusion control did not render the FX');
  // Rain uses the same normal depth pipeline. Put the cover within its 0.8m near fade,
  // so all rain is behind it and compare GPU pixels, not only material flags.
  fx.reset();cover.setEnabled(true);cover.position.copyFrom(camera.position.scale(.97).add(camera.target.scale(.03)));
  const rainBase=await pixels();rain.setIntensity(1,0);
  for(let i=0;i<12;i++)rain.update(.1,camera);
  await scene.whenReadyAsync();const rainHiddenPixels=difference(rainBase,await pixels());
  if(rainHiddenPixels)throw Error(`Rain visible through opaque cover: ${rainHiddenPixels} pixels`);
  return {doubleJumpHiddenPixels:hiddenPixels,doubleJumpVisiblePixels:visiblePixels,rainHiddenPixels,resolution:[w.engine.getRenderWidth(),w.engine.getRenderHeight()]};
 }finally{rain.dispose();fx.dispose();scene.dispose();w.scene.render();}
})()
