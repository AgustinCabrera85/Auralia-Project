import assert from 'node:assert/strict';
import {renderResolution,readRenderQuality,saveRenderQuality} from '../src/game/renderResolution.ts';

const size=(w,h,dpr,quality='balanced')=>renderResolution(w,h,dpr,quality);
assert.deepEqual(size(2560,1313,1),{width:1920,height:984,hardwareScalingLevel:4/3});
assert.deepEqual(size(2560,1313,1,'performance'),{width:1600,height:820,hardwareScalingLevel:1.6});
assert.deepEqual(size(2560,1313,1,'native'),{width:2560,height:1313,hardwareScalingLevel:1});
assert.deepEqual(size(1280,720,1),{width:1280,height:720,hardwareScalingLevel:1},
  'small windows are not upscaled');
assert.deepEqual(size(1280,720,2),{width:1920,height:1080,hardwareScalingLevel:2/3},
  'high DPI stays within the physical pixel budget');
assert.deepEqual(size(1280,720,2,'native'),{width:2560,height:1440,hardwareScalingLevel:.5});
for(const [w,h,dpr] of [[3840,2160,1],[2560,1440,2],[3440,1440,1],[720,1280,3],[2560,1313,.8]]){
  const r=size(w,h,dpr);
  assert.ok(Math.max(r.width,r.height)<=1920&&Math.min(r.width,r.height)<=1080);
  assert.ok(r.width<=w*dpr&&r.height<=h*dpr,'never supersample beyond native');
  assert.ok(Math.abs(r.width-r.height*w/h)<=Math.max(1,w/h),'preserve aspect ratio within rounding');
}
assert.equal(size(2560,1313,NaN).width,1920);
assert.equal(size(0,0,0).width,1);
const stored=new Map();
globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
assert.equal(readRenderQuality(),'balanced');
saveRenderQuality('performance');assert.equal(readRenderQuality(),'performance');
stored.set('auralia-render-quality-v1','invalid');assert.equal(readRenderQuality(),'balanced');
globalThis.localStorage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};
assert.equal(readRenderQuality(),'balanced');assert.doesNotThrow(()=>saveRenderQuality('native'));
delete globalThis.localStorage;
console.log('Render resolution: pixel budgets, DPI, aspect ratios, native mode and persistence OK');
