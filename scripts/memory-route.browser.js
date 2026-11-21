(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<1200&&!window.__auraliaGame?.world.santi?.isReady;i++)await wait(50);
 const w=window.__auraliaGame.world;await w.village.ready;
 if(w.village.errors.length)throw Error(w.village.errors.join('; '));
 w.engine.stopRenderLoop();w.scene.activeCamera=w.camera;w.pressed.clear();w.climate.forcedWeather='clear';
 const town=w.geographicWorld.town,samples=[];
 const sample=label=>({label,heapUsedMiB:Math.round(performance.memory.usedJSHeapSize/1048576),
  meshes:w.scene.meshes.length,geometries:w.scene.geometries.length,textures:w.engine.getLoadedTexturesCache().length,
  effects:Object.keys(w.engine._compiledEffects).length,terrain:w.mainland.statistics,
  materials:w.scene.materials.length,maxMaterialLights:Math.max(...w.scene.materials.map(m=>m.maxSimultaneousLights??0))});
 const stages=[['village-day',town.x,town.z+90,14],['outside',town.x+900,town.z+600,16],['village-night',town.x,town.z+90,21]];
 for(const [label,x,z,hour] of stages.filter(s=>!window.__memoryStage||s[0]===window.__memoryStage)){
  await w.travelGeographic(x,z,'QA memoria');w.climate.setElapsedHours(hour);
  w.camera.alpha=-Math.PI/2;w.camera.beta=1.15;
  // Drain the same time-budgeted streaming jobs without a GPU draw per job.
  for(let i=0;i<2400&&(i===0||w.mainland.pendingCount||w.geography.pending.length||w.geography.activeBuild);i++){
   w.streamMainland(x,z);w.geography.update();w.vegetation.update();w.props.update(1/60);w.grass.update();
   if(i%8===0)await wait(2);
  }
  for(let i=0;i<240;i++){
   w.update(1/60);w.camera.alpha=-Math.PI/2+i*Math.PI/120;w.scene.render();
   if(i%8===0)await wait(2);
  }
  await w.scene.whenReadyAsync();w.scene.render();samples.push(sample(label));
 }
 window.__memoryRouteCycle=(window.__memoryRouteCycle??0)+1;
 return {cycle:window.__memoryRouteCycle,samples,buildings:w.village.buildings.size,lanterns:w.village.lanterns.lamps.size,
  lampsActive:[...w.village.lanterns.lamps.values()].filter(l=>l.light.isEnabled()).length};
})()
