(async()=>{
 const w=window.__auraliaGame.world;await w.village.ready;
 const system=w.village.lanterns,check=(ok,m)=>{if(!ok)throw Error(m);};
 check(w.village.errors.length===0,w.village.errors.join('\n'));
 check(system.lamps.size===27,'Expected one lantern per Rev3 entrance');
 const mounts=[];
 for(const [id,l] of system.lamps){
  check(l.root.parent===w.village.buildings.get(id).root,`${id}: transform hierarchy`);
  check(l.mount.x+.18<l.mount.doorMin[0]||l.mount.x-.18>l.mount.doorMax[0],`${id}: door clearance`);
  check(l.meshes.every(m=>!m.isPickable&&!m.checkCollisions),`${id}: no added collision`);
  check(l.light.includedOnlyMeshes.length>0,`${id}: restricted light receivers`);
  mounts.push({id,local:l.root.position.asArray(),front:l.mount.front});
 }
 const position=system.lamps.get('B19').root.getAbsolutePosition();
 system.update(0,position,w.player,1);check([...system.lamps.values()].every(l=>!l.light.isEnabled()),'Daytime lights off');
 system.update(1,position,w.player,1);
 const active=[...system.lamps.values()].filter(l=>l.light.isEnabled());
 check(active.length>0&&active.length<=6,'Night light budget');
 check(system.lamps.get('B19').light.intensity>0,'Nearby doorway lit');
 for(const {light,receivers} of active){
  for(const mesh of receivers){
   const materials=mesh.material?.subMaterials??[mesh.material];
   for(const material of materials.filter(m=>m&&!m.disableLighting))
    check(mesh.lightSources.indexOf(light)>=0&&mesh.lightSources.indexOf(light)<material.maxSimultaneousLights,
     `${mesh.name}: entrance light excluded by material budget`);
  }
 }
 system.update(1,{x:100000,z:100000});check([...system.lamps.values()].every(l=>!l.light.isEnabled()),'Distant lights off');
 window.__brisaliaLanternView=async(id,detail='front',hour=20)=>{
  const focus=system.lamps.get(id).root.getAbsolutePosition();
  await w.geographicWorld.prepareAround(focus.x,focus.z);
  // QA pauses the render loop; advance its streaming work explicitly before
  // moving the review camera away from the player's original spawn.
  for(let i=0;i<2400&&(i===0||w.mainland.pendingCount);i++){
   w.streamMainland(focus.x,focus.z);if(i%8===0)await new Promise(r=>setTimeout(r,0));
  }
  check(w.mainland.coverageAt(focus.x,focus.z)==='near','Review terrain streamed');
  await window.__brisaliaRev3.view(id,detail);w.climate.setElapsedHours(hour);
  w.callbacks.onClimate(w.climate.frame);
  const p=system.lamps.get(id).root.getAbsolutePosition();system.update(w.climate.frame.night,p,w.player,1);
  await window.__brisaliaRev3.render();return {id,hour,night:w.climate.frame.night};
 };
 await window.__brisaliaLanternView('B19');
 return {count:27,dayOff:true,nightActive:active.length,maxActive:6,distanceOff:true,mounts};
})()
