// Disposable headless Chrome profile; never connects to the user's browser/save.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const label=process.argv[2]??'current',out=path.join(os.tmpdir(),'auralia-mountain-review');
 await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'auralia-mountain-chrome-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--enable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
 ],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let port;
  for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100);}}
  if(!port)throw Error('Headless Chrome did not expose its test port');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map();
  ws.addEventListener('message',event=>{const reply=JSON.parse(event.data),job=pending.get(reply.id);if(job){pending.delete(reply.id);reply.error?job.reject(Error(JSON.stringify(reply.error))):job.resolve(reply.result);}else if(reply.method==='Runtime.consoleAPICalled'&&reply.params.type==='error')console.error(reply.params.args.map(a=>a.value??a.description).join(' ').slice(0,3000));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});ws.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const report=[];
  for(const night of [false,true]){
   const query=new URLSearchParams();if(night)query.set('night','1');
   if(process.argv.includes('--close')){query.set('x','-2250');query.set('z','-2990');}
   await send('Page.navigate',{url:`http://localhost:5173/tests/mountain-material.html?${query}`});
   let ready;
   for(let i=0;i<360;i++){ready=await evaluate('document.body?.dataset.ready');if(ready)break;await sleep(500);}
   if(ready!=='true')throw Error(await evaluate('window.mountainFailure || document.querySelector("#status")?.textContent')||'Terrain review timed out');
   const result=await evaluate('window.mountainReview.result');assert.deepEqual(result.errors,[]);assert.equal(result.glError,0);assert.equal(result.pending,0);assert.ok(result.triangles>1000);assert.ok(result.sampledColors>100,'terrain pixels are visible');
   const screenshot=await send('Page.captureScreenshot',{format:'png'}),name=`${label}-${night?'night':'day'}.png`;
   await fs.writeFile(path.join(out,name),Buffer.from(screenshot.data,'base64'));
   report.push({...result,screenshot:path.join(out,name)});console.log(JSON.stringify(report.at(-1)));
  }
  await fs.writeFile(path.join(out,label+'.json'),JSON.stringify(report,null,2));
  if(label==='after'){
   const before=JSON.parse(await fs.readFile(path.join(out,'before.json'),'utf8'));
   for(let i=0;i<report.length;i++){
    for(const field of ['triangles','drawCalls','textureBytes'])assert.equal(report[i][field],before[i][field],`unchanged ${field}`);
    console.log(JSON.stringify({night:report[i].night,gpuBeforeMs:before[i].gpuMs.median,gpuAfterMs:report[i].gpuMs.median}));
   }
  }
  await send('Browser.close');
 }finally{ws?.close();chrome.kill();
  // Only the disposable profile created by this run can be removed.
  if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-mountain-chrome-'))
   await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
