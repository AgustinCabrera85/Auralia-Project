/** Fixed daytime camera and frame samples; only used in a disposable QA profile. */
export async function checkGrass(evaluate,capture,save,lightingOnly=false){
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');w.climate.setElapsedHours(10);const update=w.climate.update.bind(w.climate);w.climate.update=()=>update(0);})()`);
 if(!lightingOnly){
 await evaluate(`window.__auraliaGame.world.travelGeographic(2121,-1211,'Pastizal de las Cumbres')`);
 for(let i=0;i<1800;i++){
  if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.mainland.pendingCount&&!w.geography.pending.length&&!w.geography.activeBuild&&!(w.grass.pendingCount>0);})()'))break;
  if(i===1799)throw Error('Grass streaming did not settle');await pause(200);
 }
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=3.37;w.camera.beta=1.2;w.camera.radius=11.5;})()`);
 await pause(2500);await capture('cumbres');
 await save('height',await evaluate(`(()=>{const w=window.__auraliaGame.world;return w.scene.meshes.filter(m=>m.metadata?.grassSource).map(m=>{const positions=m.getVerticesData('position'),ys=[];for(let i=1;i<positions.length;i+=3)ys.push(positions[i]);const h=Math.max(...ys)-Math.min(...ys),scales=m.thinInstanceGetWorldMatrices().map(m=>m.m[5]*h);return {variant:m.metadata.grassSource,geometryHeight:h,instances:scales.length,min:Math.min(...scales),max:Math.max(...scales)};});})()`));
 await evaluate(`(()=>{const w=window.__auraliaGame.world,b=window.__grassMeasure={cpu:[],frame:[],last:0,start:0};b.begin=w.engine.onBeginFrameObservable.add(()=>b.start=performance.now());b.end=w.engine.onEndFrameObservable.add(()=>{const now=performance.now();b.cpu.push(now-b.start);if(b.last)b.frame.push(now-b.last);b.last=now;});})()`);
 await pause(10000);
 await save('metrics',await evaluate(`(()=>{const w=window.__auraliaGame.world,b=window.__grassMeasure;w.engine.onBeginFrameObservable.remove(b.begin);w.engine.onEndFrameObservable.remove(b.end);const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};return {fps:w.engine.getFps(),frameMs:stats(b.frame),cpuFrameMs:stats(b.cpu),heapBytes:performance.memory?.usedJSHeapSize,sceneTriangles:w.scene.getActiveIndices()/3,grass:{instances:w.grass.instanceCount,triangles:w.grass.triangleCount,draws:w.grass.drawCallsEstimate,sectors:w.grass.activeSectorCount,...w.grass.metrics},status:w.geographicStatus};})()`));
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.beta=.9;w.camera.radius=6;})()`);
 await pause(1000);await capture('detalle');
 await evaluate(`window.__auraliaGame.world.setVirtualKey('w',true)`);await pause(2800);
 await evaluate(`window.__auraliaGame.world.setVirtualKey('w',false)`);await pause(2500);
 await capture('recorrido');
 await save('movement',await evaluate(`(()=>{const w=window.__auraliaGame.world;return {position:w.geographicStatus.position,grass:w.grass.metrics};})()`));
 await evaluate(`window.__auraliaGame.world.travelGeographic(-3024,-1153,'Pastizal de la laguna')`);
 for(let i=0;i<1800;i++){
  if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.mainland.pendingCount&&!w.geography.pending.length&&!w.geography.activeBuild&&!(w.grass.pendingCount>0)&&!w.authoredAssets.inFlight.size;})()'))break;
  if(i===1799)throw Error('Lagoon grass streaming did not settle');await pause(200);
 }
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=5.27;w.camera.beta=1.2;w.camera.radius=11.5;})()`);await pause(2000);await capture('laguna');
 }
 await evaluate(`window.__auraliaGame.world.travelGeographic(-3218,-184,'Prueba de luz del pastizal')`);
 for(let i=0;i<1800;i++){
  if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.mainland.pendingCount&&!w.geography.pending.length&&!w.geography.activeBuild&&!(w.grass.pendingCount>0);})()'))break;
  if(i===1799)throw Error('Grass lighting view did not settle');await pause(200);
 }
 await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=3.2;w.camera.beta=1.2;w.camera.radius=11.5;})()`);
 for(const [name,hour] of [['dia',10],['atardecer',18.5],['noche',3]]){
  await evaluate(`window.__auraliaGame.world.climate.setElapsedHours(${hour})`);await pause(800);await capture('luz-'+name);
 }
 await evaluate(`window.__auraliaGame.world.travelFloating('albor')`);await pause(1500);
 const outside=await evaluate(`(()=>{const w=window.__auraliaGame.world;return {instances:w.grass.instanceCount,triangles:w.grass.triangleCount};})()`);
 await save('outside',outside);if(outside.instances!==0)throw Error('Grass did not unload on realm travel');
}
