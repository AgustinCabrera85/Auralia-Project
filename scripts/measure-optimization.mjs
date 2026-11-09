// Run with a dedicated Chrome remote-debugging profile and the landscape-review
// fixture already open. Refuses other pages; never controls the player's tab.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const port=Number(process.env.AURALIA_CDP_PORT??9343);
const output=process.argv[2]??'artifacts/optimization/baseline';
const repetitions=Number(process.env.AURALIA_REPETITIONS??3);
const seconds=Number(process.env.AURALIA_SECONDS??30);
const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const tab=tabs.find(t=>t.type==='page'&&new URL(t.url).pathname==='/tests/landscape-review.html');
if(!tab)throw new Error('Open the isolated landscape-review fixture in a dedicated debug Chrome first.');
const ws=new WebSocket(tab.webSocketDebuggerUrl);let next=0;
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
const pending=new Map(),errors=[];
ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  if(!m.id)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);
  m.error?p.reject(m.error):p.resolve(m.result);
});
const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){
  const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const percentile=(a,p)=>a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;
function summarize(run){
  const rows=run.snapshot.frames,metrics={};
  for(const key of Object.keys(rows[0]??{})){
    const values=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);
    metrics[key]={samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.at(-1)??null};
  }
  return {frames:rows.length,actualMs:run.actualMs,startPose:run.startPose,endPose:run.endPose,
    resolution:run.snapshot.resolution,viewportCss:run.snapshot.viewportCss,
    scaling:run.snapshot.hardwareScalingLevel,metrics,
    over50:rows.filter(r=>r.frameMs>50).length,over100:rows.filter(r=>r.frameMs>100).length,
    resources:run.snapshot.memory.samples.at(-1),copyCostsMs:run.copyCostsMs};
}
await fs.mkdir(output,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sourceFiles=git('ls-files','--cached','--others','--exclude-standard','-z').split('\0')
  .filter(f=>f && (f.startsWith('src/')||f.startsWith('tests/')||f.startsWith('scripts/')||['package.json','package-lock.json','vite.config.ts'].includes(f)));
const sourceHashes={};
for(const file of sourceFiles)sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const source={head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),dirty:git('status','--porcelain'),sha256:sourceHashes};
await fs.writeFile(path.join(output,'source.json'),JSON.stringify(source,null,2));
await command('Runtime.enable');
try{
  await evaluate(`import('/tests/optimization.browser.mjs?capture=${Date.now()}').then(module=>{window.optimization=module;return true})`);
  const env=await evaluate('optimization.environment()');
  const baseline={version:1,head:source.head,sourceManifest:'source.json',startedAt:new Date().toISOString(),environment:{...env,
    os:`${os.type()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model,ramBytes:os.totalmem(),node:process.version},
    conditions:{server:'Vite development',quality:'balanced',weather:'clear',hour:14,clockScale:0,repetitions,seconds,telemetry:true,
      sampleDrainSeconds:5,save:'ephemeral newGame, no player save'},runs:[],errors};
  const selected=process.env.AURALIA_SCENARIOS?.split(',');
  const scenarios=(await evaluate('optimization.scenarios')).filter(s=>!selected||selected.includes(s.id));
  for(const scenario of scenarios){
    const setup=await evaluate(`optimization.prepare(${JSON.stringify(scenario.id)})`);
    console.log(`${scenario.id}: warmed ${Math.round(setup.warmupMs)} ms, settled=${setup.settled}`);
    if(!setup.settled)throw new Error(`Streaming did not settle in ${scenario.id}`);
    for(let repetition=1;repetition<=repetitions;repetition++){
      const run=await evaluate(`optimization.measure(${seconds})`),file=`${scenario.id}-${repetition}.json.gz`;
      await fs.writeFile(path.join(output,file),gzipSync(JSON.stringify(run)));
      const result={scenario:scenario.id,repetition,setup,raw:file,...summarize(run)};
      baseline.runs.push(result);
      await fs.writeFile(path.join(output,'baseline.json'),JSON.stringify(baseline,null,2));
      console.log(`${scenario.id} #${repetition}: p50 ${result.metrics.frameMs.p50}, p95 ${result.metrics.frameMs.p95}, p99 ${result.metrics.frameMs.p99} ms; GPU p50 ${result.metrics.gpuMs.p50}`);
    }
    const screenshot=await command('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(output,`${scenario.id}.png`),Buffer.from(screenshot.data,'base64'));
  }
  baseline.finalEnvironment=await evaluate('optimization.environment()');
  await fs.writeFile(path.join(output,'baseline.json'),JSON.stringify(baseline,null,2));
  console.log(`Saved ${baseline.runs.length} measurements; browser exceptions=${errors.length}`);
}finally{ws.close();}
