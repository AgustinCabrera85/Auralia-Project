const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const output=path.join(os.tmpdir(),'auralia-hud-audio');await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'auralia-hud-audio-chrome-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
 try{
  let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100);}}
  if(!port)throw Error('Chrome unavailable');const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/?qa'});
  let ready;for(let i=0;i<480;i++){ready=await evaluate('!!window.__auraliaGame?.world.geographicStatus.avatarReady && window.__auraliaGame.world.geographicStatus.ready');if(ready)break;await sleep(500);}
  if(!ready)throw Error('Game initialization timed out: '+JSON.stringify(await evaluate('window.__auraliaGame?.world.geographicStatus')));
  await evaluate(`(()=>{const a=window.__auraliaGame;a.world.climate.setElapsedHours(10);a.world.engine.maxFPS=30;})()`);
  const before=await evaluate('window.__auraliaGame.music.status');
  if(before.state!=='waiting'||before.time!==0)throw Error('Music must wait for interaction: '+JSON.stringify(before));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:720,y:450,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:720,y:450,button:'left',clickCount:1});
  for(let i=0;i<40;i++){if((await evaluate('window.__auraliaGame.music.status')).state==='playing')break;await sleep(250);}
  await sleep(1400);const playing=await evaluate('window.__auraliaGame.music.status');
  if(playing.state!=='playing'||playing.time<.5||playing.volume<=0)throw Error('Music failed: '+JSON.stringify(playing));
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  await capture('hud-desktop');
  await evaluate(`document.querySelector('.main-actions [data-panel="sound"]').click()`);await sleep(300);await capture('sound-desktop');
  await evaluate(`(()=>{const el=document.querySelector('[data-volume="music"]');el.value='27';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(850);const reduced=await evaluate('window.__auraliaGame.music.status');
  if(Math.abs(reduced.volume-.8*.27)>.005)throw Error('Music slider not applied: '+JSON.stringify(reduced));
  await evaluate(`document.querySelector('.sound-panel [data-sound="mute"]').click()`);await sleep(100);
  const muted=await evaluate('window.__auraliaGame.music.status');if(!muted.muted||muted.volume!==0)throw Error('Global mute not applied');
  await evaluate(`document.querySelector('.sound-panel [data-sound="mute"]').click();document.querySelector('[data-sound="music"]').click()`);
  const paused=await evaluate('window.__auraliaGame.music.status');await sleep(400);const still=await evaluate('window.__auraliaGame.music.status');
  if(paused.state!=='paused'||still.time!==paused.time)throw Error('Pause does not stop the track');
  await evaluate(`document.querySelector('[data-sound="music"]').click()`);await sleep(900);
  if((await evaluate('window.__auraliaGame.music.status')).time<=still.time)throw Error('Music did not resume');
  await evaluate('window.__auraliaGame.music.media.currentTime=window.__auraliaGame.music.status.duration-.2');await sleep(1100);
  const loop=await evaluate('window.__auraliaGame.music.status');if(loop.state!=='playing'||loop.time>4)throw Error('Track did not loop');
  // Production ambience adapter responds to the same independent preference bus.
  const mixer=await evaluate(`(async()=>{const {audioSettings}=await import('/src/audio/AudioSettings.ts');const w=window.__auraliaGame.world;audioSettings.set({ambience:.25,master:.5});return {volume:w.climate.precipitation.audio.volume,prefs:audioSettings.current};})()`);
  if(Math.abs(mixer.volume-.125)>1e-6)throw Error('Ambience mixer is disconnected');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(350);await capture('sound-mobile');
  const overflow=await evaluate(`(()=>{const p=document.querySelector('#panel-window');return {scroll:p.scrollWidth,width:p.clientWidth};})()`);
  if(overflow.scroll>overflow.width+1)throw Error('Sound panel overflows on mobile');
  await evaluate('window.__auraliaGame.hud.close()');await sleep(200);await capture('hud-mobile');
  if(!await evaluate('document.querySelector(".quest-card").classList.contains("is-collapsed")'))throw Error('Mobile quest must leave the world visible');
  const nav=await evaluate(`(()=>{const a=[...document.querySelectorAll('.main-actions button')];return a.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});})()`);
  if(!nav)throw Error('Mobile navigation clips');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await sleep(200);await capture('hud-laptop');
  const panels=await evaluate(`(()=>{const h=window.__auraliaGame.hud;const results=[];for(const name of ['map','equip','craft','build','graphics','help','sound']){h.open(name);results.push({name,open:!document.getElementById('panel-backdrop').hidden,content:document.getElementById('panel-content').textContent.length});h.close();}return results;})()`);
  if(panels.some(p=>!p.open||p.content<20))throw Error('A game panel lost its content');
  const result={playing,reduced,muted,paused,loop,mixer,overflow,nav,panels};
  await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,result}));
  await send('Browser.close');
 }finally{ws?.close();chrome.kill();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('auralia-hud-audio-chrome-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
