// Validate normal X/Q input on the real render loop; no injected impact or animation seek.
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,m)=>{if(!ok)throw Error(m);};
 const until=async(fn,ms=15000)=>{const end=performance.now()+ms;while(!fn()){if(performance.now()>end)throw Error('Gameplay timeout');await wait(25);}};
 await until(()=>window.__auraliaGame?.world.santi?.isReady,60000);
 const w=window.__auraliaGame.world;await w.village.ready;await w.groundImpactFX.prepare();
 window.dispatchEvent(new Event('focus'));w.pressed.clear();w.store.state.equippedItem='sword';
 w.abilities.development('sandbox');w.abilities.development('unlock','forest_roots');w.abilities.select('forest_roots');
 await until(()=>w.abilities.manager.status('forest_roots').available);
 const input=key=>{window.dispatchEvent(new KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key,code:'Key'+key.toUpperCase(),bubbles:true}));};
 const events=[],fx=w.groundImpactFX,original=fx.trigger.bind(fx);let phase='normal-Q';
 fx.trigger=(p,n,o)=>{const e=w.abilities.manager.execution,accepted=original(p,n,o);events.push({phase,accepted,point:{...p},normal:{...n},radius:o.radius,level:e?.profile.level,
  elapsed:e?.elapsed,marker:e?.definition.animation.groundStrikeAt,frame:w.santi.special?.getCurrentFrame(),animation:w.santi.special?.name});return accepted;};
 const town=w.geographicWorld.town;
 await w.travelGeographic(town.x+65,town.z+85,'QA impacto X');await until(()=>!w.geographyLoading&&w.traversal.mode==='grounded');await wait(1000);
 w.climate.forcedWeather='clear';w.climate.setElapsedHours(14);
 const level=async n=>{w.abilities.development('level',String(n));w.santi.setSwordLevel(n);await w.santi.swordVisual.whenReady();await wait(100);};
 await level(3);input('q');check(w.santi.combat,'Q did not run');await until(()=>!w.santi.combat);check(events.length===0,'Q emitted the special FX');
 const cast=async(label,cancel=false)=>{
  phase=label;w.abilities.development('cooldown');w.resetMovementEffects();input('x');check(w.abilities.manager.execution,'X did not start');
  if(cancel){await wait(300);input('escape');}
  await until(()=>!w.abilities.manager.execution);await wait(50);
  const hits=events.filter(e=>e.phase===label);check(hits.length===(cancel?0:1),`${label}: expected ${cancel?0:1} impact, got ${hits.length}`);
  if(hits.length){check(hits[0].elapsed>=hits[0].marker&&hits[0].elapsed<hits[0].marker+.05,'Ground-strike marker out of sync');check(hits[0].accepted,'FX rejected');}
 };
 for(const n of [1,2,3,4]){await level(n);await cast('flat-X-level-'+n);}
 await cast('cancelled-X',true);
 const resources=()=>({meshes:fx.meshes.filter(m=>!m.isDisposed()).length,textures:w.scene.textures.filter(t=>t.name==='ground-slam-dust-1k').length});
 const stable=resources();await cast('repeat-X');
 check(JSON.stringify(stable)===JSON.stringify(resources()),'Repeated cast grew impact resources');
 const callbacks=[...w.engine._activeRenderLoops];
 const capture=async(hour=14,age=.16)=>{
  for(const callback of callbacks)w.engine.runRenderLoop(callback);
  await until(()=>!w.abilities.manager.execution);await wait(250);w.resetMovementEffects();w.climate.setElapsedHours(hour);phase='capture-X';
  w.camera.alpha=w.player.rotation.y-Math.PI/2+.65;w.camera.beta=1.13;w.camera.radius=13;w.cameraPreferredRadius=w.cameraAppliedRadius=13;
  let frozen=false;
  const observer=w.scene.onAfterRenderObservable.add(()=>{
   if(fx._slots.some(s=>s.active&&s.age>=age)){w.scene.onAfterRenderObservable.remove(observer);w.engine.stopRenderLoop();frozen=true;}
  });
  w.abilities.development('cooldown');input('x');await until(()=>frozen);
  return {event:events.at(-1),stats:fx.getStats(),age:fx._slots.find(s=>s.active)?.age};
 };
 const captured=await capture(14,0);window.__groundImpactQA={w,events,capture,callbacks,original};
 return {normalQNoEffect:true,levels:[1,2,3,4],oneImpactPerX:true,cancelBeforeImpact:true,stableResources:stable,events,captured};
})()
