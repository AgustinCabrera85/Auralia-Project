// Repeatable CPU/frame pacing sample in an isolated Chrome profile on port 9228.
// Output goes to stdout; redirect outside the repository for before/after samples.
const targets=await fetch('http://127.0.0.1:9228/json/list').then(r=>r.json());
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl),pending=new Map();let serial=0;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
try{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://localhost:5173/?qa=1'});
  for(let i=0;i<150;i++){
    if(await evaluate('!!window.__auraliaGame?.world?.geographicStatus.avatarReady'))break;
    if(i===149)throw Error('Avatar did not load');await new Promise(r=>setTimeout(r,1000));
  }
  console.log(JSON.stringify(await evaluate(`(async()=>{
    const w=window.__auraliaGame.world;
    const d=await import('/src/world/volcanicCaveData.ts');
    const e=d.VOLCANIC_CAVE.entrance;
    await w.travelGeographic(e.x,e.z+10);w.engine.stopRenderLoop();
    const y=w.geographicWorld.surface.heightAt(e.x,e.z+5);
    w.traversal.teleport(e.x,y+.1,e.z+5);w.player.position.set(e.x,y+.1,e.z+5);
    for(let i=0;i<60;i++){w.update(1/60);await new Promise(r=>requestAnimationFrame(r));}
    w.interact();if(!w.volcanicCave.inside)throw Error('Cave entry failed');
    const {SceneInstrumentation}=await import('/node_modules/@babylonjs/core/Instrumentation/sceneInstrumentation.js');
    const instrumentation=new SceneInstrumentation(w.scene);
    instrumentation.captureActiveMeshesEvaluationTime=true;instrumentation.captureAnimationsTime=true;
    instrumentation.captureRenderTargetsRenderTime=true;instrumentation.captureRenderTime=true;
    const renderCosts={activeMeshes:0,animations:0,renderTargets:0,draw:0};
    const stats={},originals=[];let sample=false;
    for(const [o,key,name] of [[w,'update','update'],[w.scene,'render','render'],
      [w,'updateCameraOcclusion','camera'],[w.volcanicCave,'upwardHit','ceiling'],
      [w.volcanicCave.colliders,'hits','collision rays'],[w.volcanicCave.groundColliders,'hits','ground rays'],
      [w.volcanicCave,'update','cave lights'],[w.wayfinding,'update','outdoor signs'],
      [w.climate,'update','climate'],[w.traversal,'step','movement'],[w.dogo,'update','dogo'],
      [w.santi,'updateGroundContact','santi feet']]){
      if(!o)continue;const fn=o[key];originals.push(()=>o[key]=fn);stats[name]={ms:0,calls:0,max:0};
      o[key]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{if(sample){const elapsed=performance.now()-t,s=stats[name];s.ms+=elapsed;s.calls++;s.max=Math.max(s.max,elapsed);}}};
    }
    const samples=[];let meshes=0,active=0;
    try{
      for(const id of ['entry','bridgeWest','under']){
        const local=d.caveWorldPoint(d.CAVE_NODES[id]);if(id==='entry')local.z-=3;
        const p=local;
        w.traversal.teleport(p.x,p.y+.1,p.z);w.player.position.set(p.x,p.y+.1,p.z);
        w.camera.setTarget(w.player.position.clone().addInPlaceFromFloats(0,3,0),false,false,true);
        w.camera.alpha=1.57;w.camera.beta=1.2;w.camera.radius=12;
        let previous=performance.now();
        for(let i=0;i<210;i++){
          sample=i>=60;w.pressed.clear();
          if(i>=60&&i<90)w.pressed.add('w');else if(i>=90&&i<120)w.pressed.add('s');
          w.camera.alpha+=.006;await new Promise(r=>requestAnimationFrame(r));
          const begin=performance.now(),interval=begin-previous;previous=begin;
          w.engine.beginFrame();w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();w.engine.endFrame();
          if(sample){samples.push({id,cpu:performance.now()-begin,interval});
            renderCosts.activeMeshes+=instrumentation.activeMeshesEvaluationTimeCounter.current;
            renderCosts.animations+=instrumentation.animationsTimeCounter.current;
            renderCosts.renderTargets+=instrumentation.renderTargetsRenderTimeCounter.current;
            renderCosts.draw+=instrumentation.renderTimeCounter.current;
          }
        }
      }
      meshes=w.scene.meshes.length;active=w.scene.getActiveMeshes().length;
    }finally{w.pressed.clear();for(const restore of originals)restore();instrumentation.dispose();}
    const quantile=(key,p)=>{const values=samples.map(s=>s[key]).sort((a,b)=>a-b);return +values[Math.floor((values.length-1)*p)].toFixed(2);};
    return {frames:samples.length,resolution:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],meshes,active,
      cpu:{median:quantile('cpu',.5),p95:quantile('cpu',.95),p99:quantile('cpu',.99)},
      interval:{median:quantile('interval',.5),p95:quantile('interval',.95),p99:quantile('interval',.99)},
      over33:samples.filter(s=>s.interval>33.4).length,
      renderCosts:Object.fromEntries(Object.entries(renderCosts).map(([key,ms])=>[key,+(ms/samples.length).toFixed(3)])),
      costs:Object.fromEntries(Object.entries(stats).map(([name,s])=>[name,{perFrame:+(s.ms/samples.length).toFixed(3),calls:s.calls,max:+s.max.toFixed(3)}]))};
  })()`),null,2));
}finally{ws.close();}
