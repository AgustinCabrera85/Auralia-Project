/** Explicit opt-in local Chrome benchmark. Runs only after authorization to use
 * Chrome headless instead of Computer Use. Uses a fresh, workspace-owned profile;
 * no connection to the user's existing browser, accounts or saves.
 * node scripts/benchmark-world-preview-browser.mjs --run
 */
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv.includes('--run'))throw new Error('Explicit --run is required; this starts an isolated Chrome test browser.');
const root=process.cwd(),origin='http://127.0.0.1:5173';
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.split('=')[1];
const modes=(option('modes')??'baseline,stream,main').split(',');
const views=(option('views')??'costa,isla,ladera,vegetacion,nacimiento,desembocadura').split(',');
const textureReview=process.argv.includes('--textures');
if(modes.some(mode=>!['baseline','stream','main','legacy-terrain','hybrid'].includes(mode))||views.some(view=>!['costa','isla','ladera','vegetacion','nacimiento','desembocadura','sector','detalle','borde'].includes(view)))throw new Error('Unknown benchmark mode/view');
const output=path.join(root,textureReview?'artifacts/geographic-source/texture-scale':process.argv.includes('--geographic')?'artifacts/geographic-source/browser':`artifacts/world-preview/${process.argv.includes('--review')?'browser-reviewed':'browser'}`);await mkdir(output,{recursive:true});
if(textureReview&&modes.some(mode=>!['legacy-terrain','hybrid'].includes(mode)))throw new Error('--textures uses --modes=legacy-terrain,hybrid');
const chrome=process.env.AURALIA_TEST_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=120000){const start=Date.now();for(;;){try{const result=await fn();if(result)return result;}catch{}if(Date.now()-start>timeout)throw new Error('Benchmark readiness timed out');await delay(200);}}
class CDP{
  constructor(url){this.id=0;this.pending=new Map();this.errors=[];this.socket=new WebSocket(url);this.open=new Promise((resolve,reject)=>{this.socket.onopen=resolve;this.socket.onerror=reject;});this.socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown'||m.method==='Log.entryAdded'&&m.params.entry.level==='error'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')this.errors.push(m);const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);};}
  async send(method,params={},sessionId){await this.open;return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},120000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  async evaluate(expression,sessionId){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  close(){this.socket.close();}
}
function processMemory(ids){
  if(process.platform!=='win32')return null;
  const safe=ids.filter(Number.isSafeInteger).filter(id=>id>0);if(!safe.length)return null;
  try{return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${safe.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64,PeakWorkingSet64 | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));}catch{return null;}
}
const results=[];
for(const mode of modes){
  const profile=path.join(root,'.test-build',`preview-chrome-${mode}-${Date.now()}`);await mkdir(profile,{recursive:true});
  const child=spawn(chrome,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--enable-precise-memory-info','--window-size=1600,900','about:blank'],{windowsHide:true,stdio:'ignore'});
  let cdp;
  try{
    const port=await until(async()=>{const [port,wsPath]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);return {port,wsPath};},45000);
    cdp=new CDP(`ws://127.0.0.1:${port.port}${port.wsPath}`);await cdp.open;
    const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    await cdp.send('Page.enable',{},sessionId);await cdp.send('Runtime.enable',{},sessionId);
    await cdp.send('Log.enable',{},sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    const geographic=mode==='legacy-terrain'||mode==='hybrid';
    const route=geographic?`/world-preview.html?source=${mode==='hybrid'?'worldstudio-hybrid':'legacy'}`:mode==='main'?'/tests/world-preview-main-reference.html':`/world-preview.html?source=import-reference&qa=costa${mode==='baseline'?'&geometry=baseline':''}`;
    await cdp.send('Page.navigate',{url:origin+route},sessionId);
    const api=geographic?'window.__geographicValidation':mode==='main'?'window.mainReference':'window.__auraliaPreviewDebug?.inspection';
    await until(()=>cdp.evaluate(`!!(${api})`,sessionId));
    for(const view of views){
      await cdp.evaluate(`${api}.go(${JSON.stringify(view)})`,sessionId);
      await until(()=>cdp.evaluate(geographic?`${api}.ready()`:mode==='main'?'window.mainReference.ready()':`!window.__auraliaPreviewDebug.terrainStream || window.__auraliaPreviewDebug.terrainStream.settled`,sessionId));
      if(textureReview){
        await until(()=>cdp.evaluate(`${api}.terrain.material.metadata?.biomeMaterials?.status==='ready'`,sessionId));
        for(const framing of ['game','walk']){
          await cdp.evaluate(`(()=>{const a=${api};a.setCameraMode('${framing}');
            if('${framing}'==='walk')a.scene.activeCamera.rotation.x=1.05;
            const r=document.getElementById('validation-resolution');r.value='1';r.dispatchEvent(new Event('change'));})()`,sessionId);
          await delay(2500);
          const measurement=await cdp.evaluate(`(()=>{const a=${api},m=a.terrain.material;return {...a.snapshot(),material:{name:m.name,
            status:m.metadata?.biomeMaterials?.status,textures:m.getActiveTextures().map(t=>({name:t.name,size:t.getSize(),anisotropy:t.anisotropicFilteringLevel}))}};})()`,sessionId);
          if(measurement.failure||measurement.material.status!=='ready'||measurement.framing.mode!==framing||measurement.framing.resolution!==1||measurement.framing.fov!==.8||measurement.viewport[0]!==1600)throw new Error('Texture framing validation failed '+JSON.stringify(measurement));
          if(framing==='walk'&&Math.abs(measurement.framing.eyeHeight-1.75)>.001)throw new Error('Incorrect eye height');
          if(view==='sector'&&framing==='game'&&Math.abs(measurement.framing.orbitRadius-11.5)>.001)throw new Error('Incorrect game framing');
          const grass=measurement.textureScale.layers.find(m=>m.id==='pradera_templada');
          if(Math.abs(grass.metresPerRepeat-1/.18)>.00001)throw new Error('Grass texture density differs from main');
          const label=`${mode}-${view}-${framing}`;
          const png=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},sessionId);
          await writeFile(path.join(output,label+'.png'),Buffer.from(png.data,'base64'));
          await writeFile(path.join(output,label+'.json'),JSON.stringify(measurement,null,2)+'\n');
          results.push({...measurement,mode,view:label});
          console.log(JSON.stringify({label,framing:measurement.framing,grassRepeat:grass.metresPerRepeat,material:measurement.material.status}));
        }
        continue;
      }
      // Baseline needs two scheduled sector checks; all modes then measure an
      // equal window after warmup. Capped FPS is reported separately from GPU.
      await delay(18000);
      const measurement=await cdp.evaluate(`${api}.snapshot()`,sessionId);
      if(geographic)measurement.mode=mode;
      const processes=await cdp.send('SystemInfo.getProcessInfo');
      measurement.processMemory=processMemory(processes.processInfo.map(p=>p.id));
      measurement.processTypes=processes.processInfo.map(({id,type})=>({id,type}));
      measurement.processMemoryScope='All processes of this isolated Chrome instance; working set/private bytes, not dedicated VRAM.';
      await cdp.evaluate("for(const id of ['ui','status','coords']){const e=document.getElementById(id);if(e)e.hidden=true;}",sessionId);
      const png=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},sessionId);
      await cdp.evaluate("for(const id of ['ui','status','coords']){const e=document.getElementById(id);if(e)e.hidden=false;}",sessionId);
      await writeFile(path.join(output,`${mode}-${view}.png`),Buffer.from(png.data,'base64'));
      await writeFile(path.join(output,`${mode}-${view}.json`),JSON.stringify(measurement,null,2)+'\n');
      results.push(measurement);console.log(JSON.stringify({mode,view,frame:measurement.frameMs,gpu:measurement.gpuMs,triangles:measurement.visibleSceneTriangles,renderer:measurement.graphics?.renderer}));
    }
    if(geographic&&mode==='hybrid'&&process.argv.includes('--walk')){
      await cdp.evaluate(`${api}.go('borde')`,sessionId);
      await cdp.evaluate(`${api}.setCameraMode('walk')`,sessionId);
      await until(()=>cdp.evaluate(`${api}.ready()`,sessionId));
      await cdp.evaluate(`(()=>{const a=${api};window.__geographicWalk={start:{...a.controller.position},maxSupportError:0,missingNearFrames:0,maxResidentTiles:0,frames:0};window.__geographicWalkObserver=a.scene.onAfterRenderObservable.add(()=>{const s=window.__geographicWalk,p=a.controller.position;s.frames++;s.maxSupportError=Math.max(s.maxSupportError,Math.abs(p.y-a.surface.heightAt(p.x,p.z)));if(a.terrain.coverageAt(p.x,p.z)!=='near')s.missingNearFrames++;s.maxResidentTiles=Math.max(s.maxResidentTiles,a.source.stats.residentTiles);});a.move('s',true);})()`,sessionId);
      await delay(10000);
      await cdp.evaluate(`${api}.move('s',false)`,sessionId);await delay(1000);
      const walk=await cdp.evaluate(`(()=>{const a=${api};a.scene.onAfterRenderObservable.remove(window.__geographicWalkObserver);return {...window.__geographicWalk,end:{...a.controller.position},measurement:a.snapshot()};})()`,sessionId);
      walk.crossedR16Boundary=walk.start.x>-1400&&walk.end.x<-1400;
      walk.horizontalMetres=Math.hypot(walk.end.x-walk.start.x,walk.end.z-walk.start.z);
      await writeFile(path.join(output,'hybrid-walk.json'),JSON.stringify(walk,null,2)+'\n');
      console.log(JSON.stringify({mode,walkMetres:walk.horizontalMetres,crossedR16Boundary:walk.crossedR16Boundary,maxSupportError:walk.maxSupportError,missingNearFrames:walk.missingNearFrames}));
      if(!walk.crossedR16Boundary||walk.maxSupportError>.1||walk.missingNearFrames)throw new Error('Geographic walk validation failed');
    }
    await writeFile(path.join(output,`${mode}-errors.json`),JSON.stringify(cdp.errors,null,2)+'\n');
    if(cdp.errors.length)throw new Error('Browser runtime errors: '+JSON.stringify(cdp.errors));
    await cdp.send('Browser.close');
  }finally{if(cdp)await writeFile(path.join(output,`${mode}-errors.json`),JSON.stringify(cdp.errors,null,2)+'\n');cdp?.close();child.kill();}
}
// A filtered rerun updates only its selected views and retains other valid data.
let previous=[];try{previous=JSON.parse(await readFile(path.join(output,'comparison.json'),'utf8'));}catch{}
const combined=new Map(previous.map(r=>[`${r.mode}:${r.view}`,r]));
for(const r of results)combined.set(`${r.mode}:${r.view}`,r);
await writeFile(path.join(output,'comparison.json'),JSON.stringify([...combined.values()],null,2)+'\n');
