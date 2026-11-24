// Isolated browser/profile. Screenshots and timing reports stay in the temp dir.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const output=path.join(os.tmpdir(),'auralia-southern-ocean');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'auralia-ocean-chrome-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
   let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100);}}
   if(!port)throw Error('Test Chrome unavailable');
   const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(t=>t.type==='page').webSocketDebuggerUrl);
   await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
   let id=0;const pending=new Map();
   ws.addEventListener('message',event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')console.error(r.params.args.map(a=>a.value??a.description).join(' ').slice(0,2000));});
   const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
   const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
   await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
   const report=[];
   for(const view of (process.argv[2]?[process.argv[2]]:['shore','overview','beach','underwater'])){
     await send('Page.navigate',{url:`http://localhost:5173/tests/southern-ocean.html?view=${encodeURIComponent(view)}`});
     let ready;for(let i=0;i<360;i++){ready=await evaluate('document.body?.dataset.ready');if(ready)break;await sleep(500);}
     if(ready!=='true')throw Error(await evaluate('window.oceanFailure || document.querySelector("#status")?.textContent')||'Ocean timed out');
     const result=await evaluate('window.oceanReview.result');
     assert.deepEqual(result.errors,[]);assert.equal(result.glError,0);assert.equal(result.pending,0);assert.ok(result.sampledColors>100);assert.ok(result.residentTiles<=9);
     const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,view+'.png'),Buffer.from(shot.data,'base64'));
     report.push(result);console.log(JSON.stringify(result));
   }
   const transmission=await evaluate("import('/tests/ocean-transmission.browser.mjs').then(m=>m.verifyOceanTransmission())");
   console.log(JSON.stringify({transmission}));
   const dryCoast=await evaluate("import('/tests/ocean-transmission.browser.mjs').then(m=>m.verifyDistantDryCoast())");
   console.log(JSON.stringify({dryCoast}));
   await fs.writeFile(path.join(output,process.argv[2]?process.argv[2]+'.json':'report.json'),JSON.stringify({views:report,transmission,dryCoast},null,2));
   await send('Browser.close');
 }finally{ws?.close();chrome.kill();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-ocean-chrome-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
