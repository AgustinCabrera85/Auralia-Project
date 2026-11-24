import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {RainFX,RAIN_QUALITY} from '../src/world/climate/RainFX.js';
import {RainAudio} from '../src/world/climate/RainAudio.ts';
const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('test',new Vector3(20,8,30),scene);
let calls=0;const sample=(x,z)=>{calls++;return x<0?null:{height:3+z*.1,kind:x>25?'water':'ground'};};
const baseline={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length};
for(const quality of ['low','medium','high']){
 const fx=new RainFX(scene,{quality,intensity:0,getSurfaceAt:sample,surfaceBudget:128});
 const rain=scene.getMeshByName('auralia-rain-drops'),positions=rain.getVerticesData('position'),geometry=rain.geometry;
 fx.update(1/60,camera);assert.equal(calls,0);assert.equal(fx.getStats().drawCalls,0);
 fx.setIntensity(.8,1);
 for(let frame=0;frame<120;frame++){
  const before=calls;fx.update(1/60,camera);assert.ok(calls-before<=128);
  assert.equal(rain.geometry,geometry);assert.equal(rain.getVerticesData('position'),positions);
 }
 assert.ok(Math.abs(fx.intensity-.8)<1e-6);assert.equal(fx.getStats().drawCalls,2);
 assert.equal(rain.getTotalVertices(),RAIN_QUALITY[quality].drops*4);
 assert.equal(rain.material.disableDepthWrite,true);assert.equal(rain.renderingGroupId,0);
 const beforePause=calls,clock=fx.clock;fx.setPaused(true);fx.update(.1,camera);
 assert.equal(calls,beforePause);assert.equal(fx.clock,clock);fx.setPaused(false);
 fx.invalidateSurfaces();fx.update(1/60,camera);assert.equal(calls-beforePause,128);
 fx.reset();assert.equal(fx.getStats().surfaceReady,false);assert.equal(fx.getStats().drawCalls,0);
 fx.setIntensity(0,0);fx.update(1/60,camera);const zero=calls;fx.update(1/60,camera);assert.equal(calls,zero);
 fx.dispose();fx.dispose();calls=0;
 assert.equal(scene.meshes.length,baseline.meshes);assert.equal(scene.materials.length,baseline.materials);assert.equal(scene.textures.length,baseline.textures);
}
// Test the audio's actual gain/lifecycle contract without requiring a speaker.
const listeners=new Map();globalThis.window={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
let contexts=0,stopped=0,closed=0,lastGain=0;
const node=()=>({connect(){return this;}});
globalThis.AudioContext=class{
 sampleRate=100;currentTime=0;
 constructor(){contexts++;}
 createBuffer(){return {getChannelData:()=>new Float32Array(300)};}
 createBufferSource(){return {...node(),start(){},stop(){stopped++;}};}
 createBiquadFilter(){return {...node(),frequency:{value:0}};}
 createGain(){return {...node(),gain:{value:0,setTargetAtTime(v){lastGain=v;}}};}
 resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}
};
const audio=new RainAudio();listeners.get('pointerdown')();listeners.get('keydown')();assert.equal(contexts,1);
audio.update(1,false);assert.equal(lastGain,.13);audio.update(.5,false);assert.equal(lastGain,.065);
audio.update(1,true);assert.equal(lastGain,0);audio.dispose();audio.dispose();assert.equal(listeners.size,0);assert.equal(stopped,1);assert.equal(closed,1);
scene.dispose();engine.dispose();console.log('RainFX: bounded cache, smooth intensity, GPU buffers, pause/reset/dispose, 3 qualities and audio lifecycle OK.');
