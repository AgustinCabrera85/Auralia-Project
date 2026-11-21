/** Isolated Chrome profile; never connects to the user's browser/save. */
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const folder=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'abilities';
if(!/^[a-z0-9-]+$/i.test(folder))throw Error('Invalid output folder');
const out=`artifacts/${folder}`;await mkdir(out,{recursive:true});
if(process.argv.includes('--start')){
  const profile=process.cwd()+'/.test-build/abilities-chrome';await mkdir(profile,{recursive:true});
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new','--remote-debugging-port=9228',`--user-data-dir=${profile}`,
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--window-size=1280,720','about:blank'],{windowsHide:true,detached:true,stdio:'ignore'});child.unref();
  await new Promise(r=>setTimeout(r,2000));
}
const page=(await (await fetch('http://127.0.0.1:9228/json/list')).json()).find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let serial=0,onLoad;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);
  if(m.method==='Page.loadEventFired')onLoad?.();
  if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m);
  if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
try{
  await call('Runtime.enable');
  if(process.argv.includes('--gc'))await call('HeapProfiler.collectGarbage');
  if(process.argv.includes('--1080p'))await call('Emulation.setDeviceMetricsOverride',
    {width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  if(process.argv.includes('--start')){
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:5173/?qa=1'});console.log('Ability QA browser on 9228');
  }
  if(process.argv.includes('--reload')){
    await call('Page.enable');const loaded=new Promise(resolve=>{onLoad=resolve;});
    await call('Page.reload');await loaded;
  }
  const file=process.argv.find(a=>a.startsWith('--eval='))?.slice(7);
  if(file){const result=await call('Runtime.evaluate',{expression:await readFile(file,'utf8'),awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
    const report=process.argv.find(a=>a.startsWith('--report='))?.slice(9);
    if(report)await writeFile(`${out}/${report}.json`,JSON.stringify(result.result.value,null,2));
    console.log(JSON.stringify(result.result.value,null,2));
  }
  const capture=process.argv.find(a=>a==='--capture'||a.startsWith('--capture='));
  if(capture){
    const name=capture==='--capture'?'roots':capture.slice('--capture='.length);
    if(!/^[a-z0-9-]+$/i.test(name))throw Error('Invalid capture name');
    const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'));
  }
  if(process.argv.includes('--close'))await call('Browser.close');
}finally{if(errors.length){await writeFile(`${out}/browser-errors.json`,JSON.stringify(errors,null,2));console.error('Browser errors:',errors.length);}ws.close();}
