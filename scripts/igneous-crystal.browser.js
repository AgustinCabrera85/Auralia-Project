// Run only in the isolated QA profile, after igneous-walkthrough.browser.js.
(async()=>{
  const q=window.__igneousQA,w=q.w,r=q.r,s=w.store;
  const assert=(value,message)=>{if(!value)throw Error(message);};
  // Isolated saved-game fixture: reaching the chamber for the first time.
  s.data.discoveredPlaces=s.state.discoveredPlaces.filter(id=>id!=='reino-igneo-cristal');
  s.data.inventory.fireCrystal=0;s.repository.save(s.data);r.setFlags(s.state.discoveredPlaces);
  q.pose([74.8,13.701,-91.8],'palacio_salon',.88,1.52);
  await q.walk([q.meta.checkpoints.palacio_cristal],'crystal-approach');
  w.camera.alpha=.88;w.camera.beta=1.52;w.cameraPreferredRadius=23;
  for(let i=0;i<15;i++)await q.frame();
  assert(!s.hasFirePower,'power must be sealed before the chamber interaction');
  assert(w.volcanicCave.nearestAction(w.player.position)==='cristal','reachable interaction');
  const c=r.crystal,light=c.light.intensity,ember=c.meshes.at(-1).position.clone();
  for(let i=0;i<35;i++)await q.frame();
  assert(Math.abs(c.light.intensity-light)>.001,'the light breathes');
  assert(ember.subtract(c.meshes.at(-1).position).length()>.1,'the embers move');
  assert(!w.props.sources.has('cristalFuego'),'exterior does not load the sacred crystal');
  w.interact();assert(s.hasFirePower&&s.state.inventory.fireCrystal===1,'awakening is committed');
  const reload=new s.constructor(s.repository);assert(reload.hasFirePower,'power survives localStorage reload');
  assert(w.volcanicCave.nearestAction(w.player.position)===null,'no repeat harvesting');
  w.interact();assert(s.state.inventory.fireCrystal===1,'no duplicate reward');
  const count=r.meshes.length;
  w.volcanicCave.leave();assert(!c.root.isEnabled()&&!c.light.isEnabled(),'effects stop outside');
  await w.volcanicCave.enter(s.state.discoveredPlaces,'palacio_cristal');
  assert(r.meshes.length===count&&r.crystal===c,'return reuses the unique crystal');
  for(let i=0;i<95;i++)await q.frame();
  const old=r.container.meshes.filter(m=>/^Lago web · cristal/.test(m.material?.name??''));
  assert(old.length===3&&old.every(m=>!m.isEnabled()),'old crystal geometry is hidden');
  return {model:'Cristal_de_Fuego.glb',singleCrystal:true,oldGemPrimitivesHidden:old.length,
    firePower:reload.hasFirePower,oneTimeReward:s.state.inventory.fireCrystal,exteriorCrystalLoaded:false,
    animatedLight:true,animatedEmbers:true,visibleAfterReturn:c.root.isEnabled(),meshes:count,
    material:c.meshes[0].material.name,position:r.local(w.player.position).asArray(),recoveries:q.recoveries};
})()
