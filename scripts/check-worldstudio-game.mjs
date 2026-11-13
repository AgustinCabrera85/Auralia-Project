import {checkPlayableGame} from './worldstudio-functional.mjs';
import {checkStudioRivers,checkRiverTraversal} from './worldstudio-river-check.mjs';
import {checkWaterUnion} from './worldstudio-water-union-check.mjs';
import {checkNacar} from './worldstudio-nacar-check.mjs';
import {checkForest} from './worldstudio-forest-check.mjs';
import {checkLakeShore} from './worldstudio-lake-shore-check.mjs';
/** Authorized integration test in a disposable Chrome profile; no user saves. */
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv.includes('--run'))throw new Error('Use --run for the isolated browser integration test.');
const views=process.argv.find(a=>a.startsWith('--water-views='))?.slice(14).split(',');
const nacar=process.argv.includes('--nacar');
const forest=process.argv.includes('--forest'),forestBefore=process.argv.includes('--forest-before');
const bakeSprites=process.argv.includes('--bake-tree-sprites');
const lakeShore=process.argv.includes('--lake-shore');
const riverMetrics=process.argv.includes('--river-metrics'),nativeOnly=process.argv.includes('--water-native'),waterUnion=process.argv.includes('--water-union')||nativeOnly||!!views,waterMovement=process.argv.includes('--water-movement');
const root=process.cwd(),legacy=process.argv.includes('--legacy'),metrics=process.argv.includes('--metrics')||riverMetrics,riverReview=process.argv.includes('--rivers'),persistenceOnly=process.argv.includes('--persistence-only'),out=path.join(root,lakeShore?'artifacts/geographic-source/lake-shore/'+(process.argv.includes('--lake-shore-before')?'before':'after'):forest?'artifacts/geographic-source/forest/'+(forestBefore?'before':'after'):nacar?'artifacts/geographic-source/nacar-depth/browser':(waterUnion||waterMovement)?'artifacts/geographic-source/water-union/browser':riverReview?'artifacts/geographic-source/rivers/browser':riverMetrics?'artifacts/geographic-source/rivers/performance':persistenceOnly?'artifacts/geographic-source/realm-persistence':metrics?'artifacts/geographic-source/comparison/'+(legacy?'legacy':'worldstudio'):'artifacts/geographic-source/game');await mkdir(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=150000){const start=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-start>ms)throw new Error('Readiness timed out');await delay(250);}}
class CDP{
  constructor(url){this.id=0;this.pending=new Map();this.errors=[];this.socket=new WebSocket(url);this.open=new Promise((r,j)=>{this.socket.onopen=r;this.socket.onerror=j;});this.socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')this.errors.push(m);const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};}
  async send(method,params={},sessionId){await this.open;return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  async evaluate(expression,sessionId){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
}
const profile=path.join(root,'.test-build','game-chrome-'+Date.now());await mkdir(profile,{recursive:true});
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--enable-precise-memory-info','--window-size=1600,900','about:blank'],{windowsHide:true,stdio:'ignore'});
let cdp;
try{
  const port=await until(async()=>{try{const [port,p]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);return {port,p};}catch{return null;}},45000);
  cdp=new CDP(`ws://127.0.0.1:${port.port}${port.p}`);await cdp.open;
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  await cdp.send('Page.enable',{},sessionId);await cdp.send('Runtime.enable',{},sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  if(bakeSprites){
    await cdp.send('Page.navigate',{url:'http://127.0.0.1:5173/scripts/bake-tree-sprites.html'},sessionId);await delay(1000);
    const baked=await cdp.evaluate("import('/scripts/bake-tree-sprites.ts').then(m=>m.bakeTreeSprites())",sessionId);
    await mkdir(path.join(root,'public/assets/world/vegetation/impostors'),{recursive:true});
    await writeFile(path.join(root,'public/assets/world/vegetation/impostors/v4-trees.png'),Buffer.from(baked.png,'base64'));
    await writeFile(path.join(root,'src/world/treeSpriteData.ts'),'// Generated by scripts/bake-tree-sprites.ts from unchanged V4 GLBs.\nexport const TREE_SPRITES='+JSON.stringify(baked.metadata,null,2)+' as const;\n');
    console.log('Baked eight 256px views for each V4 tree',baked.metadata);
  }else{
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:5173/?qa=1'+(legacy?'':'&world=worldstudio')},sessionId);
  await until(()=>{if(cdp.errors.length)throw new Error(JSON.stringify(cdp.errors.at(-1)));return cdp.evaluate('!!window.__auraliaGame',sessionId);});
  if(metrics)await cdp.evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');w.camera.alpha=Math.PI/2;w.camera.beta=1.22;w.camera.radius=11.5;
    const b=window.__gameMeasure={frames:[],cpu:[],generation:[],started:performance.now(),previous:0,begin:0};
    w.engine.onBeginFrameObservable.add(()=>{b.begin=performance.now();});
    w.engine.onEndFrameObservable.add(()=>{const now=performance.now();b.cpu.push(now-b.begin);if(b.previous)b.frames.push(now-b.previous);b.previous=now;if(w.mainland.generationMs>0)b.generation.push(w.mainland.generationMs);});})()`,sessionId);
  await until(async()=>{
    if(cdp.errors.length)throw new Error(JSON.stringify(cdp.errors.at(-1)));
    return cdp.evaluate('window.__auraliaGame?.world.geographicStatus.ready',sessionId);
  });
  await delay(12000);
  const snapshot=await cdp.evaluate(`(()=>{const a=window.__auraliaGame,w=a.world;return {...w.geographicStatus,sceneReady:w.scene.isReady(),fps:w.engine.getFps(),heapBytes:performance.memory?.usedJSHeapSize,triangles:w.scene.getActiveIndices()/3,saveKeys:Object.keys(localStorage),nearbyMeshes:w.scene.meshes.filter(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()).map(m=>{const b=m.getBoundingInfo().boundingBox;return {name:m.name,material:m.material?.name,lo:b.minimumWorld.asArray(),hi:b.maximumWorld.asArray()};}).filter(b=>b.lo[0]<w.player.position.x+30&&b.hi[0]>w.player.position.x-30&&b.lo[2]<w.player.position.z+30&&b.hi[2]>w.player.position.z-30)};})()`,sessionId);
  console.log(JSON.stringify({...snapshot,nearbyMeshes:undefined}));await writeFile(path.join(out,'startup.json'),JSON.stringify(snapshot,null,2));
  if(!persistenceOnly&&!riverReview){const png=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(out,(waterUnion||waterMovement)?'startup-brisalia.png':'brisalia.png'),Buffer.from(png.data,'base64'));}
  if(metrics){
    await until(async()=>{if(cdp.errors.length)throw new Error(JSON.stringify(cdp.errors.at(-1)));
      return cdp.evaluate('!window.__auraliaGame.world.geography.pending.length&&!window.__auraliaGame.world.geography.activeBuild',sessionId);});
    await cdp.send('HeapProfiler.collectGarbage',{},sessionId);await delay(2000);
    await cdp.evaluate('window.__gameMeasure.frames=[];window.__gameMeasure.cpu=[]',sessionId);await delay(10000);
    const result=await cdp.evaluate(`(()=>{const w=window.__auraliaGame.world,b=window.__gameMeasure;
      const summary=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
      return {source:w.geographicStatus.source,viewport:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],camera:{radius:w.camera.radius,alpha:w.camera.alpha,beta:w.camera.beta,targetHeight:w.camera.target.y-w.player.position.y},fps:w.engine.getFps(),frameMs:summary(b.frames),cpuFrameMs:summary(b.cpu),generationMs:summary(b.generation),heapBytes:performance.memory.usedJSHeapSize,terrainGeometryBytes:w.mainland.approxGeometryBytes,triangles:w.scene.getActiveIndices()/3,status:w.geographicStatus};})()`,sessionId);
    const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');const ids=processInfo.map(p=>p.id).filter(n=>Number.isInteger(n)&&n>0);
    result.processes=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
    await writeFile(path.join(out,'metrics.json'),JSON.stringify(result,null,2));console.log('Metrics',JSON.stringify({...result,status:undefined,processes:undefined}));
    if(riverReview){const png=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(out,'brisalia.png'),Buffer.from(png.data,'base64'));}
  }
  const capture=async name=>{if(persistenceOnly)return;const png=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(out,name+'.png'),Buffer.from(png.data,'base64'));};
  if(riverReview)await checkStudioRivers(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)));
  if(waterUnion)await checkWaterUnion(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)),nativeOnly,views);
  if(waterMovement)await checkRiverTraversal(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)));
  if(nacar)await checkNacar(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)));
  if(forest)await checkForest(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)),()=>cdp.send('HeapProfiler.collectGarbage',{},sessionId));
  if(lakeShore)await checkLakeShore(expression=>cdp.evaluate(expression,sessionId),capture,
    (name,result)=>writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)));
  if(process.argv.includes('--realms')){
    for(const id of ['albor','umbrael']){await cdp.evaluate(`window.__auraliaGame.world.travelFloating('${id}')`,sessionId);await delay(3500);console.log(id,await cdp.evaluate('window.__auraliaGame.world.geographicStatus',sessionId));await capture(id);}
    let savedRealm;
    if(persistenceOnly){
      await cdp.evaluate("window.__auraliaGame.world.setVirtualKey('w',true)",sessionId);await delay(1000);
      await cdp.evaluate("window.__auraliaGame.world.setVirtualKey('w',false)",sessionId);await delay(500);
      savedRealm=await cdp.evaluate(`(()=>{const a=window.__auraliaGame,p=a.world.geographicStatus.position;a.store.setPlayerPosition('brisalia',p.x,p.z,'umbrael');return p;})()`,sessionId);
      if(Math.hypot(savedRealm.x-5200,savedRealm.z+3700)<2)throw new Error('No walking movement on Umbrael');
    }
    await cdp.send('Page.reload',{},sessionId);await delay(2000);await until(()=>cdp.evaluate('window.__auraliaGame?.world.geographicStatus.ready',sessionId));await delay(3000);
    const reloaded=await cdp.evaluate('window.__auraliaGame.world.geographicStatus',sessionId);
    if(reloaded.realm!=='umbrael'||reloaded.mode!=='grounded')throw new Error('Realm reload failed '+JSON.stringify(reloaded));
    if(savedRealm&&Math.hypot(savedRealm.x-reloaded.position.x,savedRealm.z-reloaded.position.z)>.1)throw new Error('Realm reload lost moved position');
    await writeFile(path.join(out,'realm-reload.json'),JSON.stringify({...reloaded,savedPosition:savedRealm},null,2));

  }
  if(process.argv.includes('--functional')){
    const results=await checkPlayableGame(expression=>cdp.evaluate(expression,sessionId),capture,results=>writeFile(path.join(out,'functional-progress.json'),JSON.stringify(results,null,2)));
    await cdp.send('Page.reload',{},sessionId);await delay(1500);await until(()=>cdp.evaluate('window.__auraliaGame?.world.geographicStatus.ready',sessionId));await delay(3000);
    const reload=await cdp.evaluate(`(()=>{const a=window.__auraliaGame;return {structures:a.store.state.structures.length,lantern:a.store.state.inventory.lantern,drawn:a.world.built.size,old:localStorage.getItem('auralia:poc:save:v1')};})()`,sessionId);
    if(reload.structures!==3||reload.drawn!==3||reload.lantern!==1||reload.old!=='legacy-isolation-sentinel')throw new Error('Reload failed '+JSON.stringify(reload));
    results.push({name:'page reload preserves playable progress',ok:true,detail:reload});
    await cdp.evaluate(`(()=>{const a=window.__auraliaGame;a.store.reset();a.world.refreshFromSave();})()`,sessionId);await delay(2500);await until(()=>cdp.evaluate('window.__auraliaGame.world.geographicStatus.ready',sessionId));
    const reset=await cdp.evaluate(`(()=>{const a=window.__auraliaGame;return {structures:a.store.state.structures.length,position:a.world.geographicStatus.position,mode:a.world.geographicStatus.mode,old:localStorage.getItem('auralia:poc:save:v1')};})()`,sessionId);
    if(reset.structures!==0||Math.hypot(reset.position.x+1249,reset.position.z-1953)>1||reset.mode!=='grounded'||reset.old!=='legacy-isolation-sentinel')throw new Error('Reset failed '+JSON.stringify(reset));
    results.push({name:'reset only new world and restores spawn',ok:true,detail:reset});

    await writeFile(path.join(out,'functional.json'),JSON.stringify(results,null,2));console.log('Functional',JSON.stringify(results));
  }
  if(process.argv.includes('--travel')){
    for(const [id,x,z] of [['laguna',-2670,-694],['nacimiento',-3889.024,-2586.63],['ladera',-3650,-2420],['desembocadura',1710,-1340],['isla-nacar',1373,-438],['nacar',400,-400],['costa',-1217,3700],['brisalia',-1249,1953]]){
      await cdp.evaluate(id==='costa'?`(()=>{const w=window.__auraliaGame.world,p=w.geographicWorld.dock;return w.travelGeographic(p.x,p.z,'Costa de Brisalia');})()`:`window.__auraliaGame.world.travelGeographic(${x},${z},${JSON.stringify(id)})`,sessionId);
      await until(async()=>{if(cdp.errors.length)throw new Error(JSON.stringify(cdp.errors.at(-1)));return cdp.evaluate('window.__auraliaGame.world.geographicStatus.ready',sessionId);});
      await cdp.evaluate(`window.__auraliaGame.world.camera.alpha=${id==='costa'?-1:1}*Math.PI/2;window.__auraliaGame.world.camera.beta=1.22`,sessionId);await delay(8000);const status=await cdp.evaluate('window.__auraliaGame.world.geographicStatus',sessionId);console.log(id,JSON.stringify(status));
      await writeFile(path.join(out,id+'.json'),JSON.stringify(status,null,2));
      const png=await cdp.send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(out,id+'.png'),Buffer.from(png.data,'base64'));
    }
  }
  if(cdp.errors.length)throw new Error('Runtime errors: '+JSON.stringify(cdp.errors));
  }
}finally{
  if(cdp){await writeFile(path.join(out,'errors.json'),JSON.stringify(cdp.errors,null,2));try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}
  child.kill();
}
