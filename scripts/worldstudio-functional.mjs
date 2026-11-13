/** Uses the real controller, interaction targets, recipes and build picking in
 * the isolated game tab. Teleports shorten travel; no inventory is injected. */
export async function checkPlayableGame(evaluate,capture,report=()=>{}){
 const results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const run=async(fn,...args)=>evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
 const check=(ok,name,detail)=>{results.push({name,ok,detail});report(results);console.log(name,ok);if(!ok)throw new Error(name+': '+JSON.stringify(detail));};
 const ready=async()=>{for(let i=0;i<600;i++){if(await evaluate('window.__auraliaGame.world.geographicStatus.ready'))return;await sleep(250);}throw new Error('World not ready');};
 const place=async(x,z)=>{await run((x,z)=>{const {world:w,hud}=window.__auraliaGame;hud.close();hud.closeDialogue();
   const y=w.walkHeightAt(x,z);w.traversal.teleport(x,y,z);w.player.position.set(x,y,z);w.lastSafePosition={x,z};w.streamMainland(x,z);},x,z);await sleep(800);};
 await run(()=>{localStorage.setItem('auralia:poc:save:v1','legacy-isolation-sentinel');});
 const start=await evaluate('window.__auraliaGame.world.geographicStatus.position');
 await run(()=>window.__auraliaGame.world.setVirtualKey('w',true));await sleep(900);
 await run(()=>window.__auraliaGame.world.setVirtualKey('w',false));
 const moved=await evaluate('window.__auraliaGame.world.geographicStatus.position');check(Math.hypot(moved.x-start.x,moved.z-start.z)>2,'walking',moved);
 await run(()=>window.__auraliaGame.world.setVirtualKey('space',true));await sleep(180);
 const jump=await evaluate('window.__auraliaGame.world.geographicStatus');check(jump.mode==='airborne'&&jump.position.y>moved.y+.2,'jump',jump.mode);
 await run(()=>window.__auraliaGame.world.setVirtualKey('space',false));await sleep(1800);
 async function useNode(id){
   const node=await run(id=>{const w=window.__auraliaGame.world,n=w.zones.get(w.store.state.zone).nodes.find(n=>n.id===id);return {x:n.localPosition.x,z:n.localPosition.z};},id);
   for(const [dx,dz] of [[0,2.7],[2.7,0],[-2.7,0],[0,-2.7]]){
     const isIsland=await evaluate("window.__auraliaGame.store.state.zone==='luciernagas'");
     if(isIsland){await run((x,z)=>{const w=window.__auraliaGame.world,zone=w.zones.get('luciernagas'),y=w.y(zone,x,z);w.traversal.teleport(x,y,z);w.player.position.set(zone.offset.x+x,y,zone.offset.z+z);},node.x+dx,node.z+dz);await sleep(500);}
     else await place(node.x+dx,node.z+dz);
     const target=await run(()=>{const w=window.__auraliaGame.world;w.findNearest();return {id:w.interactTarget?.id,mode:w.traversal.mode};});
     if(target.id===id){await run(()=>window.__auraliaGame.world.interact());return;}
   }throw new Error('Cannot interact with '+id);
 }
 async function harvest(resource,amount){
   const ids=await run(resource=>{const w=window.__auraliaGame.world;return w.zones.get(w.store.state.zone).nodes.filter(n=>n.enabled&&n.resource===resource).map(n=>n.id);},resource);
   for(const id of ids){const n=await run(r=>window.__auraliaGame.store.state.inventory[r],resource);if(n>=amount)return;await useNode(id);}
   throw new Error('Insufficient harvest nodes for '+resource);
 }
 await harvest('wood',12);await harvest('stone',3);check(true,'resource interaction');
 const craft=await run(()=>{const a=window.__auraliaGame;a.hud.open('craft');document.querySelector('[data-recipe="hammer"]').click();a.hud.close();return a.store.state.inventory.hammer;});
 check(craft===1,'craft hammer through HUD',craft);
 const plot=await evaluate('window.__auraliaGame.world.plot');await place(plot.x+6,plot.z+8);
 for(const [type,rotation] of [['floor',0],['wall',1],['wall',0]]){
   const outcome=await run((type,rotation)=>{
     const w=window.__auraliaGame.world;w.beginPlacement(type);w.placement.rotation=rotation;
     const V=w.player.position.constructor,M=w.player.getWorldMatrix().constructor,x=w.plot.x,z=w.plot.z,y=w.walkHeightAt(x,z);
     w.camera.setTarget(new V(x,y,z));w.camera.radius=22;w.camera.beta=.7;w.scene.render();
     const p=V.Project(new V(x+.05,y,z+.05),M.Identity(),w.scene.getTransformMatrix(),w.camera.viewport.toGlobal(w.engine.getRenderWidth(),w.engine.getRenderHeight()));
     w.scene.pointerX=p.x;w.scene.pointerY=p.y;w.onPointerDown({button:0});
     const out={count:w.store.state.structures.length,preview:w.preview?.message};w.cancelPlacement();return out;
   },type,rotation);
   check(outcome.count===results.filter(r=>r.name.startsWith('build ')).length+1,'build '+type+' '+rotation,outcome);
 }
 check(await evaluate("window.__auraliaGame.store.milestone==='sail'"),'quest reaches sailing');await capture('built-home');
 const saved=await run(()=>({structures:window.__auraliaGame.repository.load().structures.length,old:localStorage.getItem('auralia:poc:save:v1')}));
 check(saved.structures===3&&saved.old==='legacy-isolation-sentinel','persisted construction and isolated saves',saved);
 const dock=await evaluate('window.__auraliaGame.world.geographicWorld.dock');
 await run((x,z)=>window.__auraliaGame.world.travelGeographic(x,z,'Muelle'),dock.x,dock.z);await ready();await useNode('embarcadero-brisalia');await sleep(2000);
 check(await evaluate("window.__auraliaGame.store.state.zone==='luciernagas'"),'boat to firefly island');
 await harvest('spark',2);
 const lantern=await run(()=>{const a=window.__auraliaGame;a.hud.open('craft');document.querySelector('[data-recipe="lantern"]').click();a.hud.close();return {lantern:a.store.state.inventory.lantern,milestone:a.store.milestone};});
 check(lantern.lantern===1&&lantern.milestone==='complete','lantern and complete quest',lantern);await capture('luciernagas');
 await useNode('muelle-luciernagas');await ready();check(await evaluate("window.__auraliaGame.store.state.zone==='brisalia'"),'boat return');
 // Native dry grotto portal, swim, mountain tunnel, then both original GLBs.
 await run(()=>window.__auraliaGame.world.teleportToLandmark('gruta-mirador'));await ready();await sleep(2000);
 await run(()=>window.__auraliaGame.world.interact());await sleep(1000);
 check(await evaluate('window.__auraliaGame.world.lagoon.inside'),'grotto enter');await capture('gruta');
 await run(()=>window.__auraliaGame.world.interact());await sleep(1000);check(await evaluate('!window.__auraliaGame.world.lagoon.inside'),'grotto exit');
 await run(()=>window.__auraliaGame.world.teleportToLandmark('gruta'));await ready();await sleep(1500);
 check(await evaluate("window.__auraliaGame.world.traversal.mode==='swimming'"),'swimming');
 await run(()=>window.__auraliaGame.world.teleportToLandmark('galeria'));await ready();await sleep(1500);await run(()=>window.__auraliaGame.world.interact());await sleep(500);
 check(await evaluate('window.__auraliaGame.world.mountainPasses.inside'),'mountain tunnel enter');await capture('galerias');
 await run(()=>window.__auraliaGame.world.interact());await sleep(500);check(await evaluate('!window.__auraliaGame.world.mountainPasses.inside'),'mountain tunnel exit');
 for(const id of ['albor','umbrael']){
   await run(id=>window.__auraliaGame.world.travelFloating(id),id);await ready();await sleep(2500);
   const state=await evaluate('window.__auraliaGame.world.geographicStatus');check(state.realm===id&&state.mode==='grounded'&&state.position.y>500,'visit '+id,{position:state.position,mode:state.mode});await capture(id);
 }
 await run(()=>window.__auraliaGame.world.teleportToLandmark('brisalia'));await ready();
 check(await evaluate("localStorage.getItem('auralia:poc:save:v1')==='legacy-isolation-sentinel'"),'legacy save untouched after journey');
 return results;
}
