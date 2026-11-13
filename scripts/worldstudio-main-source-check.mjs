/** The sole playable continent resumes its own save; historical saves stay intact. */
export async function checkMainSource(evaluate,capture,save){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const snapshot=()=>evaluate(`(()=>{const a=window.__auraliaGame,w=a.world;return {source:w.geographicStatus.source,position:w.geographicStatus.position,mode:w.geographicStatus.mode,wood:a.store.state.inventory.wood,slot:a.repository.key,sourceSelector:!!document.querySelector('select[aria-label="Mundo"]'),url:location.search};})()`);
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 async function navigate(action){
  const previous=await evaluate('performance.timeOrigin');
  await evaluate(`setTimeout(()=>{${action}},0);true`);
  await pause(500);
  for(let i=0;i<1200;i++){
   let ready=false;
   try{ready=await evaluate(`performance.timeOrigin!==${previous}&&window.__auraliaGame?.world.geographicStatus.source==='worldstudio-playable-v1'&&window.__auraliaGame.world.geographicStatus.ready`);}
   catch(error){if(!/context|navigat/i.test(String(error)))throw error;}
   if(ready){await pause(2500);return;}
   await pause(250);
  }
  throw Error('Continent navigation did not settle');
 }
 const initial=await snapshot();
 check(initial.source==='worldstudio-playable-v1'&&!initial.sourceSelector&&!new URLSearchParams(initial.url).has('world'),'Root must start the sole continent without a world selector or query override');
 const legacyFixture=await evaluate(`(async()=>{const {newGame}=await import('/src/domain/types.ts'),old=newGame();old.inventory.wood=31;const raw=JSON.stringify(old);localStorage.setItem('auralia:poc:save:v1',raw);if(!window.__auraliaGame.store.collect('wood',7))throw Error('Invalid test harvest');return raw;})()`);
 await navigate('location.reload();');
 const reloaded=await snapshot();
 check(reloaded.wood===7&&reloaded.slot==='auralia:worldstudio-playable-v1:save:v1'&&!reloaded.sourceSelector,'Reload must resume the existing continent save');
 check(await evaluate(`localStorage.getItem('auralia:poc:save:v1')===${JSON.stringify(legacyFixture)}`),'Continent changed the historical save');
 await capture('continente-principal');
 await navigate("location.href='/?qa=1&world=legacy';");
 const obsoleteLink=await snapshot();
 check(obsoleteLink.source==='worldstudio-playable-v1'&&obsoleteLink.wood===7&&!obsoleteLink.sourceSelector,'An obsolete world query must not restore the old map or its save');
 await capture('partida-recargada');
 await evaluate('(()=>{const a=window.__auraliaGame;a.store.reset();a.world.refreshFromSave();})()');
 for(let i=0;i<600;i++){
  if(await evaluate('window.__auraliaGame.world.geographicStatus.ready'))break;
  if(i===599)throw Error('Reset did not settle');await pause(250);
 }
 const reset=await snapshot();
 check(reset.wood===0&&Math.hypot(reset.position.x+1249,reset.position.z-1953)<1,'Reset must restore the continent spawn');
 check(await evaluate(`localStorage.getItem('auralia:poc:save:v1')===${JSON.stringify(legacyFixture)}`),'Reset deleted or migrated the historical save');
 await save('source-selection',{passed:true,initial,reloaded,obsoleteLink,reset,historicalSaveUntouched:true});
}
