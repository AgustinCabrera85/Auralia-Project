(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,m)=>{if(!ok)throw Error(m);};
 for(let i=0;i<600&&!window.__auraliaGame?.world.santi?.isReady;i++)await wait(50);
 const w=window.__auraliaGame.world;await w.village.ready;await w.doubleJumpFX.prepare();
 w.engine.stopRenderLoop();w.scene.activeCamera=w.camera;window.dispatchEvent(new Event('focus'));
 w.pressed.clear();w.abilities.resetScene();w.climate.forcedWeather='clear';w.climate.setElapsedHours(14);
 const town=w.geographicWorld.town;await w.travelGeographic(town.x+65,town.z+85,'QA doble salto v2.1');
 const ratio=w.scene.getAnimationRatio;w.scene.getAnimationRatio=()=>1;
 const step=async frames=>{for(let i=0;i<frames;i++){w.update(1/60);w.scene.render();if(i%8===0)await wait(2);}};
 await step(120);const start={...w.traversal.position},fx=w.doubleJumpFX;
 const reset=async()=>{
  w.pressed.clear();w.resetMovementEffects();w.sprintTap.reset();
  w.traversal.teleport(start.x,start.y,start.z);w.player.position.set(start.x,start.y,start.z);
  w.camera.alpha=.8;w.camera.beta=1.12;w.camera.radius=10;w.cameraPreferredRadius=w.cameraAppliedRadius=10;
  await step(45);
 };
 const active=()=>fx.getStats().activeBursts;
 const launch=async()=>{
  await reset();w.jumpRequested=true;await step(1);check(active()===0,'First jump emitted FX');
  await step(20);const before={...w.traversal.position};w.jumpRequested=true;await step(1);
  check(w.traversal.jumpCount===2&&active()===1,'Second jump did not trigger one burst');return before;
 };
 const textures=w.scene.textures.length,before=await launch(),origin=fx._slots.find(s=>s.active).origin.clone();
 let apex=w.traversal.position.y;const serial=fx._serial;
 for(let i=0;i<12;i++){
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',repeat:true}));await step(1);
 }
 window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' '}));
 check(fx._serial===serial,'Held key duplicated the burst');
 check(fx._slots.find(s=>s.active).origin.equals(origin),'Burst follows the avatar instead of staying at takeoff');
 w.jumpRequested=true;await step(1);check(w.traversal.jumpCount===2,'Third jump allowed');
 for(let i=0;i<100;i++){await step(1);apex=Math.max(apex,w.traversal.position.y);if(w.traversal.mode==='grounded')break;}
 check(apex-before.y>3.6,'Double-jump physics changed');check(active()===0,'Burst did not expire');
 await reset();w.jumpRequested=true;await step(1);await step(20);
 w.airKickRequested=true;await step(1);
 check(w.traversal.jumpCount===2&&active()===0,'Q changed or emitted the Space-only FX');
 await launch();window.dispatchEvent(new Event('blur'));check(active()===0,'Blur retained FX');window.dispatchEvent(new Event('focus'));
 await launch();const blocked=w.blocked;w.blocked=()=>true;await step(1);w.blocked=blocked;check(active()===0,'Pause retained FX');
 await launch();w.activateZone(window.__auraliaGame.store.state.zone);check(active()===0,'Zone switch retained FX');
 const resources=()=>({meshes:w.scene.meshes.filter(m=>/^double-jump-(ring|wind)-\d/.test(m.name)).length,
  textures:w.scene.textures.length,systems:w.scene.particleSystems.filter(p=>p.name.startsWith('double-jump-motes')).length});
 fx.reset();const allocated=resources();
 for(let i=0;i<9;i++){fx.trigger({x:start.x+i*.2,y:start.y+2,z:start.z},{x:1,z:0});fx.update(.025);w.scene.render();}
 check(active()===3&&fx.getStats().particles<=72,'Pool exceeded its budget');
 check(JSON.stringify(resources())===JSON.stringify(allocated),'Repeated bursts grew resources');
 check(allocated.meshes===6&&allocated.systems===3,'Old emitter remains or pool is duplicated');
 const extra=new fx.constructor(w.scene);extra.dispose();extra.dispose();
 check(JSON.stringify(resources())===JSON.stringify(allocated),'Disposal leaked resources or shared texture');
 check(w.scene.textures.length===textures,'Texture count grew during repeated jumps');
 window.__jumpV21Capture=async(hour=14)=>{w.climate.setElapsedHours(hour);await launch();await step(8);await w.scene.whenReadyAsync();w.scene.render();return fx.getStats();};
 await window.__jumpV21Capture();w.scene.getAnimationRatio=ratio;
 return {firstJumpUnchanged:true,secondRise:apex-before.y,heldKeySingleBurst:true,worldAnchored:true,noThirdJump:true,
  airKickCompatible:true,blurReset:true,pauseReset:true,zoneReset:true,poolReuse:true,disposal:true,resources:allocated,stats:fx.getStats()};
})()
