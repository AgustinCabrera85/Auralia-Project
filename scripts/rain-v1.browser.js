(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,m)=>{if(!ok)throw Error(m);};
 const until=async(fn,ms=60000)=>{const end=performance.now()+ms;while(!fn()){if(performance.now()>end)throw Error('Rain QA timeout');await wait(50);}};
 await until(()=>window.__auraliaGame?.world.santi?.isReady);
 const w=window.__auraliaGame.world;await w.village.ready;window.dispatchEvent(new Event('focus'));
 const p=w.climate.precipitation,rain=p.rain,town=w.geographicWorld.town;
 await w.travelGeographic(town.x+20,town.z-15,'QA lluvia');await wait(1500);
 w.climate.forcedWeather='storm';w.climate.setElapsedHours(14);
 const times=[],original=rain.update.bind(rain);rain.update=(...args)=>{const t=performance.now();original(...args);times.push(performance.now()-t);};
 await until(()=>rain.getStats().surfaceReady&&rain.intensity>.99);await wait(1000);
 const roof=w.village.buildings.get('B19'),meshes=roof.meshes;
 const boxes=meshes.filter(m=>m.metadata?.buildingCollision!==false).map(m=>m.getBoundingInfo().boundingBox);
 const x=roof.root.position.x,z=roof.root.position.z,roofY=w.village.rainHeight(x,z),surface=w.rainSurfaceAt(x,z);
 check(roofY!==null&&surface.height>=roofY-.01,'Roof omitted from exposed rain surface');
 check(w.rainSurfaceAt(100000,100000)===null,'Unloaded region invented a rain surface');
 const before=rain.clock;w.onBlur();await wait(350);check(rain.clock===before,'Rain kept simulating while unfocused');
 window.dispatchEvent(new Event('focus'));await wait(100);
 const sampleResources=()=>({meshes:w.scene.meshes.filter(m=>m.name.startsWith('auralia-rain-')).length,textures:w.scene.textures.filter(t=>t.name==='auralia-rain-surface-cache').length,oldRain:w.scene.meshes.filter(m=>m.name==='auralia-rain-field').length});
 check(sampleResources().oldRain===0,'Old rain overlaps new rain');
 w.climate.forcedWeather='clear';await until(()=>rain.intensity<.0001);check(rain.getStats().drawCalls===0,'Zero intensity still draws');
 w.climate.forcedWeather='rain';await until(()=>Math.abs(rain.intensity-.68)<.002);
 const light=rain.intensity;w.climate.forcedWeather='storm';await until(()=>rain.intensity>.99);
 check(light<rain.intensity,'Intensity parameter ignored');
 const sorted=times.toSorted((a,b)=>a-b);
 const allBatches=[...w.village.buildings.values()].flatMap(b=>b.meshes).filter(m=>m.metadata?.buildingCollision!==false);
 // Roof and roof edge agree with the actual vertical collision, including slope.
 let compared=0;
 for(let dx=-8;dx<=8;dx+=2)for(let dz=-8;dz<=8;dz+=2){
  const wx=x+dx,wz=z+dz,indexed=w.village.rainHeight(wx,wz),full=w.village.ground(wx,wz,767,1023);
  if(indexed!==null&&full){check(Math.abs(indexed-full.height)<.03,'Indexed roof differs from scene');compared++;}
 }
 rain.update=original;
 const callbacks=[...w.engine._activeRenderLoops];
 const capture=async(hour=14)=>{for(const cb of callbacks)w.engine.runRenderLoop(cb);w.climate.setElapsedHours(hour);await wait(350);w.engine.stopRenderLoop();return rain.getStats();};
 await capture();window.__rainQA={w,p,rain,capture,callbacks,resources:sampleResources};
 return {quality:rain.quality,stats:rain.getStats(),resources:sampleResources(),roof:{id:'B19',x,z,height:roofY,sampled:surface.height,indexedComparisons:compared,solidBatches:allBatches.length},unloadedNull:true,pause:true,lightIntensity:light,
  cpuMs:{samples:times.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)}};
})()
