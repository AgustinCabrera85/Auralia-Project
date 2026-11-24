const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const output=path.join(os.tmpdir(),'auralia-dogo-refined');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'auralia-dogo-chrome-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
 try{
  let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100);}}
  if(!port)throw Error('Chrome unavailable');const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/tests/dogo-refined.html'+'?view='+encodeURIComponent(process.argv[2]||'idle')+(process.argv.includes('--side')?'&side=1':'')});
  let ready;for(let i=0;i<360;i++){ready=await evaluate('document.body?.dataset.ready');if(ready)break;await sleep(500);}
  if(ready!=='true')throw Error(await evaluate('window.dogoFailure')||'Review timed out');
  const result=await evaluate('window.dogoReview.result');if(result.errors.length)throw Error(JSON.stringify(result));
  const shot=await send('Page.captureScreenshot',{format:'png'}),name=process.argv[2]||'idle';
  await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,result}));
  if(process.argv.includes('--side'))for(let i=0;i<4;i++){
    await evaluate(`window.dogoReview.pose(${i/4})`);
    const phase=await send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(output,`${name}-phase-${i}.png`),Buffer.from(phase.data,'base64'));
  }
  await send('Browser.close');
 }finally{ws?.close();chrome.kill();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-dogo-chrome-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
