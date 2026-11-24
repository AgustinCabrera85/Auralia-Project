const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const label='ui';
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
  const pauses=[];ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Fetch.requestPaused')pauses.push(r.params.requestId);});
  await send('Fetch.enable',{patterns:[{urlPattern:'*src/main.ts*',requestStage:'Request'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/?qa'});
  for(let i=0;i<40&&!pauses.length;i++)await sleep(100);
  if(!pauses.length)throw Error('Game-module interception failed');
  await capture('loading-mobile');
  const layout=await evaluate(`(()=>{const r=document.querySelector('.loading-content').getBoundingClientRect();return {inert:document.querySelector('#app').inert,busy:document.querySelector('#loading-screen').getAttribute('aria-busy'),fits:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,progress:document.querySelector('#loading-progress').getAttribute('aria-valuenow')};})()`);
  if(!layout.inert||!layout.fits||layout.busy!=='true')throw Error(JSON.stringify(layout));
  await send('Fetch.failRequest',{requestId:pauses.shift(),errorReason:'ConnectionFailed'});
  for(let i=0;i<40;i++){if(await evaluate(`document.querySelector('#loading-screen').dataset.stage==='error'`))break;await sleep(100);}
  const error=await evaluate(`document.querySelector('#loading-screen').dataset.stage==='error'&&!document.querySelector('#loading-retry').hidden&&document.querySelector('#app').inert`);
  if(!error)throw Error('Module failure did not expose retry');await capture('loading-retry-mobile');
  await evaluate(`document.querySelector('#loading-retry').click()`);
  for(let i=0;i<40&&!pauses.length;i++)await sleep(100);
  if(!pauses.length)throw Error('Retry did not start a fresh load');
  console.log(JSON.stringify({layout,error,retry:true,output}));await send('Browser.close');
 }finally{ws?.close();chrome.kill();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-startup-chrome-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
