/** Isolated real-game browser QA. No access to the user's Chrome profile or saves. */
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out='artifacts/reino-igneo';await mkdir(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv.includes('--start')){
  const profile=process.cwd()+'/.test-build/igneous-chrome';await mkdir(profile,{recursive:true});
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new','--remote-debugging-port=9227',`--user-data-dir=${profile}`,
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--window-size=1280,720','about:blank'],{windowsHide:true,detached:true,stdio:'ignore'});child.unref();
  await delay(2000);
}
const page=(await (await fetch('http://127.0.0.1:9227/json/list')).json()).find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let serial=0;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);
  if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m);
  if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
try{
  await call('Runtime.enable');
  if(process.argv.includes('--reload')){
    await call('Runtime.discardConsoleEntries');errors.length=0;
    await call('Page.reload',{ignoreCache:false});console.log('Game reloaded; previous console entries cleared.');
  }
  if(process.argv.includes('--start')){
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:5173/?qa=1&reinoIgneo=1'});console.log('Isolated game browser started on 9227.');
  }
  const file=process.argv.find(a=>a.startsWith('--eval='))?.slice(7);
  if(file){const expression=await readFile(file,'utf8'),result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
    const video=process.argv.find(a=>a.startsWith('--video='))?.slice(8),report=process.argv.find(a=>a.startsWith('--report='))?.slice(9);
    if(video){await writeFile(out+'/'+video+'.webm',Buffer.from(result.result.value,'base64'));console.log(out+'/'+video+'.webm');}
    else if(report){await writeFile(out+'/'+report+'.json',JSON.stringify(result.result.value,null,2));console.log(out+'/'+report+'.json');}
    else console.log(JSON.stringify(result.result.value,null,2));}
  const name=process.argv.find(a=>a.startsWith('--capture='))?.slice(10);
  if(name){const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));console.log(out+'/'+name+'.png');}
}finally{if(errors.length){await writeFile(out+'/browser-errors.json',JSON.stringify(errors,null,2));console.error('Browser errors:',errors.length);}ws.close();}
