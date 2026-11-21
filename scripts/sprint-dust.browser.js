// Run with check-abilities.mjs --1080p --out=sprint-dust --eval=... --report=integration.
(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const assert=(ok,m)=>{if(!ok)throw Error(m);};
  for(let i=0;i<400&&!window.__auraliaGame?.world.santi?.isReady;i++)await wait(50);
  const {world:w,store}=window.__auraliaGame;
  w.engine.stopRenderLoop();window.dispatchEvent(new Event('focus'));
  const moduleSource=await(await fetch('/src/game/SantiSprintDust.js')).text();
  const coreUrl=moduleSource.match(/from\s+["']([^"']+@babylonjs_core[^"']*)["']/)?.[1];
  const B=await import(coreUrl);
  const SantiSprintDust=w.sprintDust.constructor;
  const scene=w.scene,ratio=scene.getAnimationRatio;
  scene.getAnimationRatio=()=>1;
  const report={configuration:{intensity:w.sprintDust.options.intensity,scale:w.sprintDust.options.scale,
    capacity:w.sprintDust.options.capacity},suppression:{},surfaces:{}};
  const before={particles:scene.particleSystems.length,textures:scene.textures.length,meshes:scene.meshes.length};
  const fx=new SantiSprintDust(scene,{intensity:report.configuration.intensity,scale:report.configuration.scale});
  const shared=fx._slots[0].system.particleTexture;
  assert(shared===fx._slots[1].system.particleTexture&&shared===w.sprintDust._slots[0].system.particleTexture,'texture not shared');
  assert(shared.getSize().width===1024,'texture size');
  assert(fx._slots.reduce((n,s)=>n+s.system.getCapacity(),0)===72,'capacity');
  const simulate=(overrides={},speed=27,fps=60,seconds=1)=>{
    fx.reset();let count=0;
    for(let i=0;i<=fps*seconds;i++){
      count+=fx.update({dt:1/fps,position:{x:i*speed/fps,y:0,z:0},grounded:true,sprinting:true,surface:'dirt',...overrides});
    }
    return count;
  };
  for(const [name,frame,speed] of [
    ['walk',{},11],['run',{},19],['idle',{},0],['blocked',{},0],
    ['sprintOff',{sprinting:false},27],['airborne',{grounded:false},27],
    ['swimming',{grounded:false,surface:'water'},27],['water',{surface:'water'},27],
    ['wood',{surface:'wood'},27],['paved',{surface:'paved'},27],['snow',{surface:'snow'},27],
    ['lava',{surface:'lava'},27],['wet',{wetness:.7},27]]){
    assert(simulate(frame,speed)===0,`unexpected dust: ${name}`);report.suppression[name]=true;
  }
  for(const surface of ['dirt','grass','sand']){
    report.surfaces[surface]=simulate({surface});assert(report.surfaces[surface]>0,`no dust on ${surface}`);
  }
  report.frameRates=[24,60,144].map(fps=>({fps,emitted:simulate({},27,fps,3)}));
  assert(Math.max(...report.frameRates.map(r=>r.emitted))-Math.min(...report.frameRates.map(r=>r.emitted))<16,'frame rate dependence');
  fx.reset();fx.update({dt:.016,position:{x:0,y:0,z:0},grounded:true,sprinting:true});
  assert(fx.update({dt:.016,position:{x:100,y:0,z:0},grounded:true,sprinting:true})===0,'teleport burst');
  assert(fx.update({dt:1,position:{x:101,y:0,z:0},grounded:true,sprinting:true})===0,'pause burst');
  let queried=0;
  fx.options.sampleGround=(x,z)=>{queried++;return {height:.7*x,surface:'dirt',normalY:1/Math.hypot(1,.7)};};
  fx.reset();
  for(let i=0;i<60;i++){
    const x=i*27/60;
    fx.update({dt:1/60,position:{x,y:.7*x,z:0},grounded:true,sprinting:true});
    for(const s of fx._slots)if(s.started)assert(Math.abs(s.point.y-.7*s.point.x-fx.options.groundOffset*fx.options.scale)<1e-5,'dust floats on slope');
  }
  assert(queried<=9,'too many support queries');report.slope={grade:.7,queriesPerSecond:queried};
  fx.options.sampleGround=()=>null;assert(simulate()===0,'dust over a void');
  fx.dispose();fx.dispose();
  assert(scene.particleSystems.length===before.particles&&scene.textures.includes(shared),'shared texture disposed too early');
  assert(scene.meshes.length===before.meshes,'dust created meshes');
  report.sharedTexture=true;

  // Exercise the real world adapter with controlled support and non-zero zone offsets.
  const zone=w.zones.get(store.state.zone),offset=zone.offset.clone();
  const traversalWorld=w.traversalWorld,weightsAt=w.geographicWorld.weightsAt;
  const weather={...w.climate.frame.weatherMix};
  let hit={height:4,normalY:1,surface:'wood'},water=null,received;
  try{
    zone.offset.set(300,0,-700);
    w.traversalWorld=()=>({ground:(x,z)=>{received={x,z};return hit;},waterLevel:()=>water});
    w.geographicWorld.weightsAt=()=>[0,1,0,0,0,0];
    let contact=w.sampleSprintDustGround(305,-693,4);
    assert(contact.surface==='wood'&&received.x===5&&received.z===7,'support priority or coordinates');
    hit={height:4,normalY:1};water=4;
    assert(w.sampleSprintDustGround(305,-693,4).surface==='water','water precedence');water=null;
    for(const [index,surface] of ['grass','dirt','stone','sand','snow','lava'].entries()){
      w.geographicWorld.weightsAt=()=>Array.from({length:6},(_,i)=>i===index?1:0);
      assert(w.sampleSprintDustGround(305,-693,4).surface===surface,`paint mapping ${surface}`);
    }
    w.climate.frame.weatherMix.rain=.68;
    assert(w.sampleSprintDustGround(305,-693,4).wetness>.7,'real rain ignored');
    report.supportAdapter={zoneOffset:true,supportPriority:true,paint:true,rain:true};
  }finally{
    zone.offset.copyFrom(offset);w.traversalWorld=traversalWorld;w.geographicWorld.weightsAt=weightsAt;
    Object.assign(w.climate.frame.weatherMix,weather);
  }

  // Real controller, real ground, original input and animation, in the loaded game.
  w.climate.forcedWeather='clear';w.abilities.resetScene();w.pressed.clear();w.sprintTap.reset();
  const town=w.geographicWorld.town;
  await w.travelGeographic(town.x+65,town.z+85,'QA sprint');
  for(let i=0;i<120;i++){w.update(1/60);scene.render();if(i%10===0)await wait(20);}
  const start={...w.traversal.position};
  const originalUpdate=w.sprintDust.update.bind(w.sprintDust);
  let emitted=0,peak=0;
  w.sprintDust.update=frame=>{const n=originalUpdate(frame);emitted+=n;return n;};
  const reset=()=>{w.pressed.clear();w.sprintTap.reset();w.sprintDust.reset();
    w.traversal.teleport(start.x,start.y,start.z);w.player.position.set(start.x,start.y,start.z);
    w.camera.alpha=0;emitted=0;peak=0;};
  const step=async(frames)=>{for(let i=0;i<frames;i++){
    w.update(1/60);scene.render();peak=Math.max(peak,w.sprintDust.getActiveCount());
    if(i%12===0)await wait(1);
  }};
  try{
    reset();w.pressed.add('w');await step(24);assert(emitted===0,'walk integration');
    reset();w.pressed.add('w');w.pressed.add('shift');await step(24);assert(emitted===0,'run integration');
    reset();w.pressed.add('w');w.pressed.add('shift');
    w.sprintTap.press(0);w.sprintTap.release();w.sprintTap.press(100);
    await step(42);
    assert(emitted>0&&peak>0,`sprint invisible: ${emitted}, ${peak}, ${JSON.stringify(w.traversal.position)}`);
    report.game={emitted,peak,surface:w.sampleSprintDustGround(w.player.position.x,w.player.position.z,w.player.position.y)?.surface,
      displacement:Math.hypot(w.traversal.position.x-start.x,w.traversal.position.z-start.z)};
    w.jumpRequested=true;await step(1);emitted=0;await step(10);assert(emitted===0,'jump emitted dust');
    report.game.jumpSuppressed=true;
    window.dispatchEvent(new Event('blur'));assert(w.sprintDust.getActiveCount()===0,'blur did not reset');
    window.dispatchEvent(new Event('focus'));report.game.blurReset=true;
    const blocked=w.blocked;w.blocked=()=>true;await step(1);w.blocked=blocked;
    assert(w.sprintDust.getActiveCount()===0,'pause did not reset');report.game.pauseReset=true;
    // Prove old particles stay in world space while the emitter moves away.
    reset();w.pressed.add('w');w.pressed.add('shift');w.sprintTap.active=true;await step(18);
    const ps=w.sprintDust._slots.find(s=>s.system.getActiveCount()>0)?.system;
    const particle=ps?._particles[0];assert(particle,'no world particle');const old=particle.position.clone();
    w.player.position.x+=2;originalUpdate({dt:1/60,position:w.player.position,grounded:true,sprinting:true});
    assert(particle.position.equalsWithEpsilon(old),'particle followed the emitter');report.game.worldSpace=true;
    w.activateZone(store.state.zone);assert(w.sprintDust.getActiveCount()===0,'zone reset');report.game.zoneReset=true;
    // Leave an actual sprint frame for the 1080p screenshot.
    w.climate.setElapsedHours(12);
    reset();w.pressed.add('w');w.pressed.add('shift');w.sprintTap.active=true;
    w.camera.beta=1.2;w.camera.radius=8;w.cameraPreferredRadius=w.cameraAppliedRadius=8;
    await step(30);await scene.whenReadyAsync();await step(3);
    assert(emitted>0&&w.sprintDust.getActiveCount()>0,'capture must show an active sprint');
    report.resolution={width:w.engine.getRenderWidth(),height:w.engine.getRenderHeight()};
    report.resources={particleSystems:scene.particleSystems.filter(p=>p.name.startsWith('santi-sprint-dust')).length,
      textures:scene.textures.filter(t=>t.name==='santi-sprint-dust-1k').length};
  }finally{w.sprintDust.update=originalUpdate;scene.getAnimationRatio=ratio;}
  // A second scene verifies final-owner disposal, without destroying the game screenshot.
  const isolated=new B.Scene(w.engine),owned=new SantiSprintDust(isolated);
  const texture=owned._shared.texture;isolated.dispose();owned.dispose();
  assert(owned._disposed&&texture.getInternalTexture()===null,'scene dispose leaked dust');
  report.disposed=true;
  return report;
})()
