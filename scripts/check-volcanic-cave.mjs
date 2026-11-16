// Local isolated Chrome QA session; never connects to the player's browser/profile.
import fs from 'node:fs/promises';
const out=process.env.CAVE_QA_OUT??'artifacts/volcanic-cave';
const targets=await (await fetch('http://127.0.0.1:9228/json/list')).json();
const page=targets.find(p=>p.type==='page');if(!page)throw Error('Start isolated headless Chrome on port 9228 first.');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let serial=0;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const capture=async name=>{await evaluate(`(async()=>{const w=window.__auraliaGame.world;for(let i=0;i<180;i++){w.engine.beginFrame();w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();w.engine.endFrame();await new Promise(r=>requestAnimationFrame(r));if(i>20&&w.scene.isReady()&&(w.volcanicCave.inside||w.geographicStatus.ready))break;}return true;})()`);const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'));};
await call('Page.enable');await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const mode=process.argv[2]??'start';
try{
  if(mode==='start')await call('Page.navigate',{url:'http://localhost:5173/?qa=1'});
  for(let i=0;i<150;i++){
    if(await evaluate('!!window.__auraliaGame?.world?.geographicStatus.avatarReady'))break;
    if(i===149)throw Error('Game not ready');await new Promise(r=>setTimeout(r,1000));
  }
  if(mode==='eval'){console.log(await evaluate(process.argv[3]));}
  else{
    await evaluate(`(async()=>{
      const w=window.__auraliaGame.world,d=await import('/src/world/volcanicCaveData.ts');w.engine.stopRenderLoop();
      w.climate.setElapsedHours(12);w.climate.clockScale=0;
      const frame=async(key)=>{w.pressed.clear();if(key)w.pressed.add(key);w.engine.beginFrame();w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();w.engine.endFrame();await new Promise(r=>requestAnimationFrame(r));};
      const go=async(id)=>{const p=d.caveWorldPoint(d.CAVE_NODES[id]);w.traversal.teleport(p.x,p.y+.1,p.z);w.player.position.set(p.x,p.y+.1,p.z);w.camera.setTarget(w.player.position.clone().addInPlaceFromFloats(0,3,0),false,false,true);await frame();};
      window.__caveQA={w,d,frame,go};
    })()`);
    if(mode==='start'){
      console.log(await evaluate(`(async()=>{const {w,d,frame}=window.__caveQA,e=d.VOLCANIC_CAVE.entrance;await w.travelGeographic(e.x,e.z+10);w.engine.stopRenderLoop();const y=w.geographicWorld.surface.heightAt(e.x,e.z-2);w.traversal.teleport(e.x,y+.1,e.z-2);w.player.position.set(e.x,y+.1,e.z-2);w.camera.setTarget(w.player.position.clone().addInPlaceFromFloats(0,3,0),false,false,true);w.camera.alpha=Math.PI/2-d.VOLCANIC_CAVE.entranceYaw;w.camera.beta=1.32;w.camera.radius=28;w.cameraPreferredRadius=28;for(let i=0;i<100;i++)await frame();return {ready:w.geographicStatus.ready,cave:w.volcanicCave.status};})()`));
      await capture('entrance');
      console.log('Entry transition:',await evaluate('(async()=>{const q=window.__caveQA;q.w.interact();await q.frame();return q.w.volcanicCave.inside;})()'));
      await capture('arrival');
    }else if(mode==='views'){
      for(const [name,id,alpha,beta,radius] of [['overlook','overlook',1.57,1.16,18],['bridge','bridgeWest',2.6,1.15,18],['under-bridge','under',1.9,1.3,15],['vault','vault',.65,1.18,17],['secret','secret',2.8,1.2,15],['ceiling','under',1.5,1.92,14],['exit','entry',-1.57,1.3,12]]){
        await evaluate(`(async()=>{const q=window.__caveQA;await q.go(${JSON.stringify(id)});q.w.camera.alpha=${alpha}-q.d.VOLCANIC_CAVE.entranceYaw;q.w.camera.beta=${beta};q.w.camera.radius=${radius};q.w.cameraPreferredRadius=${radius};})()`);await capture(name);
      }
    }else if(mode==='exterior'){
      await evaluate(`(async()=>{const q=window.__caveQA;await q.go('entry');q.w.interact();await q.frame();})()`);
      for(const [name,alpha,beta] of [['entrance-left',.8,1.4],['entrance-right',2.35,1.4],['entrance-above',1.57,.85]]){
        await evaluate(`(()=>{const q=window.__caveQA;q.w.camera.alpha=${alpha};q.w.camera.beta=${beta};q.w.camera.radius=28;q.w.cameraPreferredRadius=28;})()`);await capture(name);
      }
      await evaluate(`(async()=>{const q=window.__caveQA;q.w.interact();await q.frame();})()`);
    }else if(mode==='checks'){
      const result=await evaluate(`(async()=>{
        const {w,d,frame,go}=window.__caveQA,{store,hud,repository}=window.__auraliaGame;
        const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
        check(w.volcanicCave.inside,'E enters the cave');
        check(w.player.position.y<0,'interior loads separately behind the transition');
        check(!w.speedMotionBlur.optics.active,'dry interior has no water depth effects');
        check(store.state.discoveredPlaces.includes(d.VOLCANIC_CAVE.id),'discovery persisted');
        check(hud.mapMarkup().includes('data-landmark="caverna-del-crisol"'),'discovered cave appears on map');
        await go('vault');const before=store.state.inventory.fireCrystal,claimed=store.state.discoveredPlaces.includes(d.VOLCANIC_CAVE.rewardId);w.interact();
        check(store.state.inventory.fireCrystal===before+(claimed?0:5),'main reward collected once');w.interact();check(store.state.inventory.fireCrystal===before+(claimed?0:5),'reward cannot duplicate');
        check(!w.scene.getLightByName('sol').isEnabled(),'deep cave excludes outdoor sun from characters');
        check(w.scene.getActiveMeshCandidates().length<100,'interior limits mesh evaluation to cave and actors');
        await go('secret');w.interact();check(store.state.discoveredPlaces.includes(d.VOLCANIC_CAVE.secretId),'secret found');
        check(repository.load().discoveredPlaces.includes(d.VOLCANIC_CAVE.rewardId),'reward survives reload');
        const fallen={x:10,y:-430,z:10};w.traversal.teleport(fallen.x,fallen.y,fallen.z);w.player.position.set(fallen.x,fallen.y,fallen.z);await frame();
        check(w.player.position.y>-419,'fall recovery');
        await go('entry');check(w.volcanicCave.nearestAction(w.player.position)==='exit','exit interaction is reachable');
        w.interact();await frame();check(!w.volcanicCave.inside,'E exits to the hillside');
        check(w.zones.get('brisalia').root.isEnabled(),'landscape restored on exit');
        check(w.scene.getLightByName('sol').isEnabled(),'outdoor sun restored on exit');
        const y=w.geographicWorld.surface.heightAt(w.player.position.x,w.player.position.z);check(Math.abs(w.player.position.y-y)<.5,'exit aligns with the shared vestibule floor');
        const lights=w.scene.lights.length,materials=w.scene.materials.length;
        for(let i=0;i<2;i++){
          w.interact();await frame();check(w.volcanicCave.inside,'E revisit '+i);
          await go('vault');check(w.volcanicCave.nearestAction(w.player.position)===null,'claimed reward stays absent '+i);
          await go('entry');w.interact();await frame();
        }
        check(w.scene.lights.length===lights&&w.scene.materials.length===materials,'revisits release geometry and lights');
        await w.travelGeographic(w.geographicWorld.spawn.x,w.geographicWorld.spawn.z,'Brisalia');w.engine.stopRenderLoop();await frame();
        check(!w.volcanicCave.inside&&!w.geographicStatus.failure,'travel restores exterior streaming');
        check(!w.volcanicCave.loaded,'distant cave geometry released');
        return {checks,entrance:d.VOLCANIC_CAVE.entrance,transition:"E",terrain:"local walkable vestibule"};
      })()`);
      await fs.writeFile(`${out}/browser-checks.json`,JSON.stringify(result,null,2));console.log(result);
    }
  }
}finally{ws.close();}
