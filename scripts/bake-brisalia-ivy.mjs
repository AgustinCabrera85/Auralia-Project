// Rebuild the B28 Rev5 ivy attachment cache. Requires Vite on localhost:5173.
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const profile=path.join(root,'.test-build',`ivy-chrome-${Date.now()}`);await mkdir(profile,{recursive:true});
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1600,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
chrome.stderr.on('data',chunk=>process.stderr.write(chunk));
chrome.on('error',error=>{throw error;});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,time=120000){const start=Date.now();while(Date.now()-start<time){try{const v=await fn();if(v)return v;}catch{}await delay(250);}throw new Error('Timed out');}
let socket;
try{
 const info=await until(async()=>{const s=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');return s.trim().split(/\r?\n/);},30000);
 socket=new WebSocket(`ws://127.0.0.1:${info[0]}${info[1]}`);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map(),errors=[];
 socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){errors.push(m.params);console.log('BROWSER ERROR',JSON.stringify(m.params).slice(0,1800));}const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:'http://127.0.0.1:5173/tests/brisalia-ivy.html?bakeIvy=1'},sessionId);
 await until(()=>evaluate('window.ivyReview?.ready'),150000);
 console.log(JSON.stringify(await evaluate('window.ivyReview.report')));

 const baked=await evaluate('({info:window.ivyReview.village.castleIvy.volume.attachmentInfo,samples:window.ivyReview.village.castleIvy.volume.attachmentSamples})');
 const bytes=Buffer.alloc(16+baked.samples.length*2);
 bytes.writeUInt32LE(0x49565932,0);bytes.writeUInt32LE(baked.info.version,4);
 bytes.writeUInt32LE(baked.info.sourceHash,8);bytes.writeUInt32LE(baked.samples.length,12);
 baked.samples.forEach((value,i)=>bytes.writeUInt16LE(value,16+i*2));
 if(errors.length)throw new Error('Browser validation failed; attachment cache was not saved.');
 await writeFile(path.join(root,'public/assets/ivy/brisalia-attachments.bin'),bytes);
 console.log('Baked validated ivy attachments',baked.info,'bytes',bytes.length);
 await evaluate('window.ivyReview.village.dispose(); window.ivyReview.environment.dispose(); window.ivyReview.scene.dispose();');
}finally{socket?.close();chrome.kill();}
