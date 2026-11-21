/** Chrome 9228 is an isolated QA profile. Measures native private footprints via CDP. */
import {writeFile,mkdir} from 'node:fs/promises';
const label=process.argv[2]??'measurement';if(!/^[a-z0-9-]+$/i.test(label))throw Error('Invalid label');
const endpoint=await(await fetch('http://127.0.0.1:9228/json/version')).json();
const ws=new WebSocket(endpoint.webSocketDebuggerUrl),pending=new Map();let serial=0,onEvent=()=>{};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else onEvent(m);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
try{
 const {processInfo}=await call('SystemInfo.getProcessInfo');const chunks=[];let finish;const done=new Promise(r=>finish=r);
 onEvent=m=>{if(m.method==='Tracing.dataCollected')chunks.push(...m.params.value);if(m.method==='Tracing.tracingComplete')finish();};
 await call('Tracing.start',{categories:'disabled-by-default-memory-infra',options:'record-until-full'});
 await call('Tracing.requestMemoryDump',{levelOfDetail:'detailed',deterministic:true});await call('Tracing.end');await done;
 const totals=new Map(chunks.filter(c=>c.args?.dumps?.process_totals).map(c=>[c.pid,c.args.dumps.process_totals]));
 const mib=n=>Math.round(n/1048576*10)/10;
 const processes=processInfo.map(p=>({type:p.type,pid:p.id,cpuSeconds:p.cpuTime,
  privateMiB:mib(parseInt(totals.get(p.id)?.private_footprint_bytes??'0',16))}));
 const renderer=processes.filter(p=>p.type==='renderer').sort((a,b)=>b.cpuSeconds-a.cpuSeconds)[0];
 const gpu=processes.find(p=>p.type==='GPU');
 const report={at:new Date().toISOString(),label,rendererMiB:renderer?.privateMiB,gpuProcessMiB:gpu?.privateMiB,
  rendererPlusGpuMiB:Math.round(((renderer?.privateMiB??0)+(gpu?.privateMiB??0))*10)/10,
  note:'Measured native private footprints in isolated Chrome; not the Chrome tab-hover figure. GPU process includes driver allocations.',processes};
 await mkdir('artifacts/memory-regression',{recursive:true});await writeFile(`artifacts/memory-regression/${label}-process.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{ws.close();}
