// Inspect the isolated landscape fixture through its dedicated local Chrome.
import fs from 'node:fs/promises';
import path from 'node:path';

const port=Number(process.env.AURALIA_CDP_PORT??9343);
const output=process.argv[2]??'artifacts/optimization/phase1/mesh-breakdown.json';
const ids=(process.env.AURALIA_SCENARIOS??'brisalia,bosque-ilustrado,pradera-florida').split(',');
const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const tab=tabs.find(t=>t.type==='page'&&new URL(t.url).pathname==='/tests/landscape-review.html');
if(!tab)throw new Error('Open the isolated landscape-review fixture in a dedicated debug Chrome first.');
const ws=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map();
let next=0;
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
ws.addEventListener('message',event=>{
  const message=JSON.parse(event.data),request=pending.get(message.id);
  if(!request)return;
  pending.delete(message.id);
  message.error?request.reject(message.error):request.resolve(message.result);
});
const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;
  pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){
  const response=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
try{
  await command('Runtime.enable');
  const deadline=Date.now()+120000;
  while(!await evaluate('Boolean(window.review?.world)')){
    if(Date.now()>deadline)throw new Error('Landscape fixture did not become ready.');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await evaluate(`import('/tests/optimization.browser.mjs?mesh=${Date.now()}').then(module=>{window.optimization=module;return true})`);
  const profile={capturedAt:new Date().toISOString(),
    head:process.env.AURALIA_HEAD??null,
    environment:await evaluate('optimization.environment()'),scenes:[]};
  for(const id of ids){
    const setup=await evaluate(`optimization.prepare(${JSON.stringify(id)})`);
    if(!setup.settled)throw new Error(`Streaming did not settle in ${id}`);
    const meshes=await evaluate('optimization.meshBreakdown()');
    profile.scenes.push({id,setup,meshes});
    console.log(`${id}: ${meshes.activeMeshes} active meshes, ${Math.round(meshes.sceneActiveTriangles)} scene triangles`);
  }
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(profile,null,2));
  console.log(`Saved ${output}`);
}finally{ws.close();}
