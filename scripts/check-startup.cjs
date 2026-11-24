const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const label=process.argv[2]||'after',baseline=label==='before';
 const output=path.join(os.tmpdir(),'auralia-startup');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'auralia-startup-chrome-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
 try{
  let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100);}}
  if(!port)throw Error('Chrome unavailable');const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  if(label==='profile'){await send('Profiler.enable');await send('Profiler.start');}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__startupProbe={tasks:[],samples:[]};performance.setResourceTimingBufferSize(10000);new PerformanceObserver(list=>{for(const t of list.getEntries())window.__startupProbe.tasks.push({at:t.startTime,duration:t.duration});}).observe({type:'longtask',buffered:true});setInterval(()=>{const w=window.__auraliaGame?.world;const s=w?.geographicStatus;const p=window.__startupProbe;if(p.samples.length<1800)p.samples.push({at:performance.now(),world:!!w,avatar:s?.avatarReady,ready:s?.ready,loading:s?.loading,pending:w?.mainland.pendingCount,stage:document.querySelector('#loading-screen')?.dataset.stage,progress:document.querySelector('#loading-progress')?.getAttribute('aria-valuenow')});},200);`});
  await send('Page.navigate',{url:'http://localhost:5173/?qa'});
  if(!baseline){await sleep(500);await capture(label+'-loading');}
  let ready;for(let i=0;i<480;i++){
   ready=await evaluate(`!!window.__auraliaGame?.world.geographicStatus.avatarReady && window.__auraliaGame.world.geographicStatus.ready ${baseline?'':"&& document.querySelector('#loading-screen')?.hidden"}`);
   if(!baseline&&await evaluate(`document.querySelector('#loading-screen')?.dataset.stage==='error'`))break;
   if(ready)break;await sleep(500);
  }
  const result=await evaluate(`(()=>{const s=window.__auraliaGame?.world.geographicStatus;const r=performance.getEntriesByType('resource');return {now:performance.now(),paints:performance.getEntriesByType('paint').map(p=>({name:p.name,at:p.startTime})),marks:performance.getEntriesByType('mark').map(p=>({name:p.name,at:p.startTime})),status:s,probe:window.__startupProbe,resources:r.length,largest:r.map(r=>({name:r.name.replace(location.origin,''),start:r.startTime,end:r.responseEnd,size:r.decodedBodySize})).sort((a,b)=>b.size-a.size).slice(0,25)};})()`);
  result.errors=errors;await fs.writeFile(path.join(output,label+'.json'),JSON.stringify(result,null,2));
  if(label==='profile'){const {profile:cpu}=await send('Profiler.stop');await fs.writeFile(path.join(output,'cpu.json'),JSON.stringify(cpu));}
  console.log(JSON.stringify({output,label,ready,now:result.now,paints:result.paints,marks:result.marks,firstWorld:result.probe.samples.find(s=>s.world),firstAvatar:result.probe.samples.find(s=>s.avatar),firstReady:result.probe.samples.find(s=>s.ready),longestTasks:result.probe.tasks.sort((a,b)=>b.duration-a.duration).slice(0,8),largest:result.largest.slice(0,8),errors}));
  if(!ready)throw Error('Startup timed out');
  if(!baseline){
   if(!await evaluate(`document.querySelector('#loading-screen').hidden && !document.querySelector('#app').inert`))throw Error('Loading screen did not release game');
   const progress=result.probe.samples.map(s=>Number(s.progress)).filter(Number.isFinite);
   if(progress.some((p,i)=>i>0&&p<progress[i-1]))throw Error('Progress moved backwards');
   await capture(label+'-game');
   if(label==='palace'){
    console.log(JSON.stringify({visit:await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.visit())`)}));
    const palaceViews=['overview','front','court','hall','upper','stairs','ceiling','audience','audience-ceiling','flag','facade-close','stair-top','gallery-close','beam-joint','gallery-rail','roof-below','gallery-night','stair-side','portico-support','stair-landing','stair-arrival','gallery-floor','column-close','facade-standing','facade-jump','court-eave-low','court-eave-upper','court-eave-above','court-eave-corner','column-base','column-capital'];
    for(const view of process.argv[3]?process.argv[3].split(','):palaceViews){
     if(!palaceViews.includes(view))throw Error('Unknown palace review view: '+view);
     await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.view('${view}'))`);await capture('brisalia-palace-'+view);
    }
    console.log(JSON.stringify({roofProbe:await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.roofProbe())`)}));
    console.log(JSON.stringify({roofContinuity:await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.roofContinuity())`)}));
    console.log(JSON.stringify({surfaceProbe:await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.surfaceProbe())`)}));
    const palace=await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.check())`);
    console.log(JSON.stringify({palace}));await fs.writeFile(path.join(output,'brisalia-palace.json'),JSON.stringify(palace,null,2));
    const performance=await evaluate(`import('/tests/brisalia-palace.browser.mjs').then(m=>m.performanceCheck())`);console.log(JSON.stringify({performance}));await fs.writeFile(path.join(output,'brisalia-palace-performance.json'),JSON.stringify(performance,null,2));
    if(errors.length)throw Error('Palace runtime errors: '+JSON.stringify(errors));
   }
   if(label==='nacar'){
    console.log(JSON.stringify({visit:await evaluate(`import('/tests/nacar-palace.browser.mjs').then(m=>m.visitPalace())`)}));
    await sleep(1000);await capture('nacar-arrival');
    const palace=await evaluate(`import('/tests/nacar-palace.browser.mjs').then(m=>m.checkPalace())`);
    console.log(JSON.stringify({palace}));await fs.writeFile(path.join(output,'nacar-palace.json'),JSON.stringify(palace,null,2));
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry('gate',true))`);await sleep(600);await capture('nacar-gate');
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry('hall',true))`);await sleep(600);await capture('nacar-hall');
    await evaluate(`import('/tests/nacar-palace.browser.mjs').then(m=>m.viewPalaceOverview())`);await capture('nacar-overview');
   }
   if(label==='final'){
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry())`);await sleep(500);await capture('palace-entry');
    const checked=await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.checkArrival())`);
    console.log(JSON.stringify({arrival:checked}));
    await fs.writeFile(path.join(output,'arrival.json'),JSON.stringify(checked,null,2));
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry())`);await sleep(500);await capture('palace-entry');
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry('gate'))`);await sleep(500);await capture('fortress-entry');
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry('hall',true))`);await sleep(500);await capture('palace-front');
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewEntry('gate',true))`);await sleep(500);await capture('fortress-front');
    console.log(JSON.stringify({road:await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewRoad())`)}));await sleep(800);await capture('painted-road');
    await evaluate(`import('/tests/arrival.browser.mjs').then(m=>m.viewBridge())`);await sleep(500);await capture('bridge');
   }
  }
  await send('Browser.close');
 }finally{ws?.close();chrome.kill();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-startup-chrome-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
