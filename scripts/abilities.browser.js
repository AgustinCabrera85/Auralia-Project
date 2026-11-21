(async()=>{
  const g=window.__auraliaGame;if(!g)throw Error('Game is not loaded');
  const {world:w,store}=g,a=w.abilities;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const before=JSON.stringify({inventory:store.state.inventory,abilities:store.state.abilities,places:store.state.discoveredPlaces});
  a.development('sandbox');a.development('unlock','forest_roots');a.select('forest_roots');
  for(let i=0;i<400&&(!w.santi.isReady||a.presentation.roots.diagnostics.state==='loading');i++)await wait(50);
  assert(a.presentation.roots.diagnostics.state==='ready',JSON.stringify(a.presentation.roots.diagnostics));
  w.engine.stopRenderLoop();window.dispatchEvent(new Event('focus'));
  const step=(time)=>{for(let left=time;left>1e-7;left-=.025){w.update(Math.min(left,.025));w.scene.render();}};
  step(.1);
  const press=(key,repeat=false,target=window)=>target.dispatchEvent(new KeyboardEvent('keydown',{key,repeat,bubbles:true}));
  press('x',true);assert(!a.manager.execution,'autorepeat should not start');
  const input=document.createElement('input');document.body.append(input);press('x',false,input);input.remove();
  assert(!a.manager.execution,'typing should not start');
  const report={levels:[],assets:a.presentation.roots.diagnostics,controls:{repeat:true,typing:true}};
  for(const level of [1,2,3,4]){
    a.development('level',String(level));a.development('cooldown');a.development('targets');
    press('x');assert(a.manager.execution,'X did not start: '+a.manager.status('forest_roots').reason);
    const id=a.manager.execution.id;press('x');assert(a.manager.execution.id===id,'double activation');
    assert(w.santi.special?.name==='Sword And Shield Casting','wrong character clip');
    step(.425);assert(a.manager.execution?.committed,'did not commit: '+document.getElementById('toast').textContent);
    const e=a.manager.execution,center={...e.plan.center};
    const sequence=[],shakePulses=[],inclinations=[];
    for(const ring of e.profile.rings){
      step(Math.max(0,e.timeline.fx[0]+ring.delay+.03-e.elapsed));
      const visible=a.presentation.roots.pool.filter(p=>p.root.isEnabled()).length;
      const expected=e.plan.placements.filter(p=>p.delay<=ring.delay).length;
      assert(visible===expected,'rings did not emerge in sequence');sequence.push(visible);
      const tremor=w.camera.targetScreenOffset.length();
      assert(tremor>.001&&tremor<=.16,'missing ring camera tremor');shakePulses.push(tremor);
      const ringIndex=e.profile.rings.indexOf(ring),index=e.plan.placements.findIndex(p=>p.ring===ringIndex);
      const instance=a.presentation.roots.pool[index],placement=e.plan.placements[index],before=instance.root.position.clone();
      step(.12);assert(instance.root.position.equalsWithEpsilon(before,1e-8),'root base moved while leaning');
      instance.root.computeWorldMatrix(true);
      const normal=before.clone().set(placement.normal.x,placement.normal.y,placement.normal.z);
      const tangent=before.clone().set(-(placement.z-center.z),0,placement.x-center.x).normalize();
      const dot=tangent.x*normal.x+tangent.y*normal.y+tangent.z*normal.z;
      tangent.subtractInPlace(normal.scale(dot)).normalize();
      const up=instance.root.getDirection(before.clone().set(0,1,0)).normalize();
      const inclination=up.x*tangent.x+up.y*tangent.y+up.z*tangent.z;
      assert(Math.sign(inclination)===(ringIndex%2===0?1:-1),'tip inclination did not alternate');inclinations.push(inclination);
    }
    step(e.timeline.impacts.at(-1)+.05-e.elapsed);assert(a.testHits.length>0,'no gameplay impact');
    assert(new Set(a.testHits.map(h=>h.id)).size===a.testHits.length,'duplicate damage');
    assert(a.testHits.every(h=>h.damage===[10,13,16,20][level-1]),'wrong damage');
    const rootMeshes=w.scene.meshes.filter(m=>m.name.startsWith('root-')&&m.morphTargetManager);
    assert(new Set(rootMeshes.map(m=>m.morphTargetManager.uniqueId)).size===rootMeshes.length,'shared morph state');
    report.levels.push({level,id,center,placements:e.plan.placements.length,hits:[...a.testHits],
      fx:{...a.presentation.roots.diagnostics},clip:w.santi.special.name,
      morph:rootMeshes[0]?.morphTargetManager.getTarget(0).influence,
      activeRoots:a.presentation.roots.pool.filter(p=>p.root.isEnabled()).length,sequence,shakePulses,inclinations,
      rings:e.profile.rings,
      placementsValid:e.plan.placements.every(p=>p.normal.y>.7)});
    step(e.timeline.release+.05-e.elapsed);assert(!a.manager.controlLocked&&!w.santi.special,'control/animation not released');
    assert(a.presentation.roots.diagnostics.active===0,'FX left active');
    assert(w.camera.targetScreenOffset.length()<1e-8,'camera tremor did not settle');
    assert(a.manager.status('forest_roots').cooldown>0,'cooldown missing');
  }
  const count=a.presentation.roots.diagnostics.instances;
  for(let i=0;i<4;i++){a.development('cooldown');press('x');step(3.1);}
  assert(a.presentation.roots.diagnostics.instances===count,'pool grew after warm-up');
  report.poolStable=count;
  a.development('cooldown');press('x');step(.2);window.dispatchEvent(new Event('blur'));
  assert(!a.manager.execution&&!w.santi.special,'blur did not cancel');window.dispatchEvent(new Event('focus'));
  report.controls.blur=true;
  a.development('cooldown');press('x');step(.45);a.resetScene();
  assert(w.camera.targetScreenOffset.length()<1e-8,'scene reset left camera displaced');
  assert(a.presentation.roots.diagnostics.active===0&&!a.manager.controlLocked,'scene reset failed');
  report.sceneReset=true;
  const after=JSON.stringify({inventory:store.state.inventory,abilities:store.state.abilities,places:store.state.discoveredPlaces});
  assert(before===after,'sandbox changed persistent progression');report.savedProgressUnchanged=true;
  // Leave a real rendered N4 attack visible for a screenshot.
  a.development('cooldown');press('x');step(1.55);
  return report;
})()
