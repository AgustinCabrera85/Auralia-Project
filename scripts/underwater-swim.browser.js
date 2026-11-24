(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<1200&&!window.__auraliaGame?.world.santi?.isReady;i++)await wait(50);
 const w=window.__auraliaGame.world;window.dispatchEvent(new Event('focus'));await w.village.ready;
 const {waterSurfaceAt}=await import('/src/world/geographicFeatures.ts'),{sampleMainlandHeight}=await import('/src/world/terrainData.ts');
 const candidates=[],seen=new Set();
 for(const list of w.geographicWorld.rivers.cells.values())for(const s of list){
  if(seen.has(s))continue;seen.add(s);
  for(const t of [.25,.5,.75]){
   const x=s.ax+(s.bx-s.ax)*t,z=s.az+(s.bz-s.az)*t;
   if(!w.geographicWorld.isReady([x-3,z-3,x+3,z+3]))continue;
   const water=waterSurfaceAt(x,z);if(!water||water.kind!=='stream'||water.level-sampleMainlandHeight(x,z)<5)continue;
   candidates.push({x,z,level:water.level,dx:s.bx-s.ax,dz:s.bz-s.az,distance:Math.hypot(x-w.geographicWorld.town.x,z-w.geographicWorld.town.z)});
  }
 }
 candidates.sort((a,b)=>a.distance-b.distance);const c=candidates[0];if(!c)throw Error('No deep river in loaded region');
 await w.travelGeographic(c.x,c.z,'QA nado sumergido');await wait(1500);
 w.climate.forcedWeather='clear';w.climate.setElapsedHours(14);w.engine.stopRenderLoop();
 w.traversal.teleport(c.x,c.level-4,c.z);w.traversal.mode='swimming';w.traversal.swimDepthTarget=4;w.player.position.set(c.x,c.level-4,c.z);
 w.camera.setTarget(w.player.position.add(new w.player.position.constructor(0,1.25,0)));
 w.camera.alpha=Math.atan2(-c.dz,-c.dx);w.camera.beta=1.5;w.camera.radius=8;w.cameraPreferredRadius=w.cameraAppliedRadius=8;
 let swimmingFrames=0,checkedFrames=0,waterSectors=0;const mismatches=[],path=[];
 for(let i=0;i<360;i++){
  if(i===80)w.pressed.add('w');w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();
  const optics=w.speedMotionBlur.optics,active=w.scene.getActiveMeshes();
  const visible=active.data.slice(0,active.length).filter(m=>m.metadata?.inlandWater);
  if(optics.surfaceMode&&optics.surfaceReady&&i>15){
   checkedFrames++;waterSectors=Math.max(waterSectors,visible.length);
   if(visible.length!==optics.surfaces.length||visible.some(m=>!optics.surfaces.includes(m)))mismatches.push({frame:i,visible:visible.length,sampled:optics.surfaces.length});
  }
  if(w.traversal.mode==='swimming'&&w.camera.globalPosition.y<(waterSurfaceAt(w.camera.globalPosition.x,w.camera.globalPosition.z)?.level??-Infinity)-.3)swimmingFrames++;
  if(i%30===0)path.push({frame:i,eye:w.camera.globalPosition.asArray(),player:w.player.position.asArray(),mode:w.traversal.mode,visibleWater:visible.length});
  if(i%8===0)await wait(1);
 }
 w.pressed.clear();
 if(checkedFrames<200||swimmingFrames<200)throw Error('Insufficient submerged river movement');
 if(mismatches.length)throw Error('River interface uses stale visible sectors: '+JSON.stringify(mismatches));
 return {river:c,swimmingFrames,checkedFrames,waterSectors,mismatches,path,passesSynchronized:true};
})()
