import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const dir=resolve('.test-build/audio');mkdirSync(dir,{recursive:true});
for(const name of ['AudioSettings','GameMusic']){
 const js=ts.transpileModule(readFileSync(`src/audio/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replaceAll("'./AudioSettings'","'./AudioSettings.mjs'");
 writeFileSync(resolve(dir,name+'.mjs'),js);
}
const {AudioSettings,SOUND_STORAGE_KEY}=await import(pathToFileURL(resolve(dir,'AudioSettings.mjs')));
const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
const settings=new AudioSettings(storage);settings.set({music:.27,ambience:.25,master:.5});
assert.equal(settings.gain('music'),.135);assert.equal(settings.gain('ambience'),.125);
assert.deepEqual(new AudioSettings(storage).current,settings.current,'preferences survive reload');
settings.set({muted:true});assert.equal(settings.gain('music'),0);assert.equal(settings.gain('ambience'),0);
settings.set({muted:false,music:Infinity,master:-1});assert.equal(settings.current.music,.27);assert.equal(settings.current.master,0);
storage.setItem(SOUND_STORAGE_KEY,'broken');assert.equal(new AudioSettings(storage).current.music,.6);
storage.setItem(SOUND_STORAGE_KEY,JSON.stringify({music:3,master:'loud',muted:'yes'}));
assert.equal(new AudioSettings(storage).current.music,1);assert.equal(new AudioSettings(storage).current.master,.8);assert.equal(new AudioSettings(storage).current.muted,false);
const blocked=new AudioSettings({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});blocked.set({music:.1});assert.equal(blocked.current.music,.1);

globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
globalThis.Element=class extends EventTarget{};
let serial=0;const frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial};globalThis.cancelAnimationFrame=id=>frames.delete(id);
const settleVolume=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(performance.now()+1000);};
class Media extends EventTarget{
 paused=true;volume=0;muted=false;currentTime=0;duration=180;plays=0;removed=false;fail=null;
 play(){this.plays++;if(this.fail){const e=this.fail;this.fail=null;return Promise.reject(e);}this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}
 pause(){this.paused=true;}load(){}removeAttribute(){this.removed=true;}
}
const {GameMusic}=await import(pathToFileURL(resolve(dir,'GameMusic.mjs')));
const prefs=new AudioSettings(),media=new Media(),music=new GameMusic(prefs,media);
music.setInGame(true);assert.equal(media.plays,0,'no autoplay before gesture');assert.equal(media.loop,true);
window.dispatchEvent(new Event('pointerdown'));await Promise.resolve();
// Input may arrive after the shared rAF timestamp of the current frame.
const early=[...frames.values()];frames.clear();for(const fn of early)fn(performance.now()-100);
assert.equal(media.volume,0,'an earlier rAF timestamp cannot produce negative volume');
settleVolume();
assert.equal(music.status.state,'playing');assert.equal(media.plays,1);assert.equal(media.volume,.48);
for(let i=0;i<50;i++)window.dispatchEvent(new Event('keydown'));assert.equal(media.plays,1,'one music element and no overlapping play calls');
prefs.set({music:.2});settleVolume();assert.ok(Math.abs(media.volume-.16)<1e-9);
prefs.set({muted:true});assert.equal(media.muted,true);assert.equal(media.volume,0);
prefs.set({muted:false});settleVolume();assert.ok(Math.abs(media.volume-.16)<1e-9);
media.currentTime=45;document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(media.paused,true);assert.equal(media.currentTime,45);
await new Promise(r=>setTimeout(r,0));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,0));settleVolume();
assert.equal(media.paused,false);assert.equal(media.currentTime,45,'visibility resumes from the same musical phrase');
prefs.set({musicEnabled:false});assert.equal(media.paused,true);window.dispatchEvent(new Event('keydown'));assert.equal(media.paused,true,'user pause survives later gestures');
prefs.set({musicEnabled:true});await new Promise(r=>setTimeout(r,0));assert.equal(media.paused,false);
music.setInGame(false);assert.equal(media.paused,true);music.dispose();assert.equal(media.removed,true);assert.equal(frames.size,0);
const calls=media.plays;window.dispatchEvent(new Event('pointerdown'));prefs.set({music:.8});assert.equal(media.plays,calls,'dispose removes gesture and settings listeners');
const denied=new Media();denied.fail={name:'NotAllowedError'};const retry=new GameMusic(new AudioSettings(),denied);retry.setInGame(true);
window.dispatchEvent(new Event('pointerdown'));await new Promise(r=>setTimeout(r,0));assert.equal(retry.status.state,'waiting');
window.dispatchEvent(new Event('keydown'));await new Promise(r=>setTimeout(r,0));assert.equal(retry.status.state,'playing');retry.dispose();
const hash=createHash('sha256').update(readFileSync('public/assets/audio/music/pueblo-brisalia.mp3')).digest('hex');
assert.equal(hash,'0c6f0e40e2402c0b9cba5e5cb7c94e627caf1d40bdcffcc031e2528639b7e4ca');
console.log('Audio: original MP3 integrity, persistent mixer, gesture unlock, pause/resume, tab visibility, volume, mute and disposal passed.');
