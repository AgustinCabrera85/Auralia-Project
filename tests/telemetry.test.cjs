const assert=require('node:assert/strict');
const {TelemetryHistory,TelemetryMemoryHistory,TELEMETRY_COLUMNS,T}=require('../.test-build/game/telemetryData.js');
const frame=(time,interval,phases={})=>{
  const values=new Float64Array(TELEMETRY_COLUMNS.length);
  values[T.timeMs]=time;values[T.frameMs]=interval;values[T.gpuMs]=NaN;
  for(const [name,value] of Object.entries(phases))values[T[name]]=value;
  return values;
};
const history=new TelemetryHistory(4);
history.push(frame(10,10));history.push(frame(20,10));history.push(frame(30,10));
history.push(frame(150,120,{terreno:85,updateMs:92,renderMs:8}));
let stats=history.summary(150);
assert.equal(stats.max,120,'a long hitch is retained without the 45 ms simulation clamp');
assert.equal(stats.p95,120);assert.equal(stats.p99,120);
assert.equal(stats.over50,1);assert.equal(stats.over100,1);
assert.ok(Math.abs(stats.fps-1000/37.5)<1e-9,'FPS follows actual frame intervals');
assert.equal(stats.gpuMs,null,'unsupported GPU timers are unavailable, not zero');
assert.equal(history.slowFrames(150)[0].label,'Terreno/streaming');
assert.equal(history.slowFrames(150)[0].costMs,85);
history.push(frame(166,16,{renderMs:8,gpuMs:5}));
assert.deepEqual(history.exportRows().map(row=>row.timeMs),[20,30,150,166],
  'bounded recording wraps in chronological order');
assert.equal(history.summary(166).gpuMs,5);
stats=history.summary(10200);
assert.equal(stats.count,0,'old hitches expire from the rolling statistics');
assert.equal(stats.fps,0);
assert.equal(history.exportRows()[0].gpuMs,null,'JSON represents missing GPU data explicitly');
history.push(frame(180,NaN));history.push(frame(180,0));
assert.equal(history.count,4,'invalid intervals are ignored');
history.clear();assert.equal(history.count,0);assert.deepEqual(history.exportRows(),[]);
history.push(frame(1000,140,{updateMs:4,renderMs:3}));
assert.equal(history.slowFrames(1000)[0].label,'Sin pico CPU claro',
  'an inter-frame stall is not incorrectly blamed on a tiny CPU phase');
console.log('Telemetry: real frame intervals, bounded history, percentiles, GPU availability and hitch attribution OK');

history.clear();history.push(frame(2000,75,{oceano:60,movimiento:2,renderMs:8}));
assert.equal(history.slowFrames(2000)[0].label,'Océano','ocean hitches are separated from player movement');
assert.equal(history.exportRows()[0].oceano,60);

const memory=new TelemetryMemoryHistory(3);
const memorySample=timeMs=>({timeMs,jsUsedBytes:null,jsAllocatedBytes:null,jsLimitBytes:null,
  meshes:10,geometries:8,textures:4,materials:3,skeletons:1,morphManagers:1,
  animationGroups:35,animatables:195,x:1,z:10});
for(let time=0;time<=4000;time+=5)memory.push(memorySample(time));
assert.equal(memory.count,3,'high-FPS sessions cannot grow the memory history');
assert.deepEqual(memory.exportRows().map(row=>row.timeMs),[2000,3000,4000],
  'memory samples retain chronological seconds independently of frame rate');
assert.equal(memory.push(memorySample(3990)),false,'out-of-order samples are ignored');
assert.equal(memory.due(NaN),false);
assert.equal(memory.exportRows()[0].jsUsedBytes,null,'unsupported heap readings are not reported as zero');
const exported=memory.exportRows();exported[0].meshes=999;
assert.equal(memory.exportRows()[0].meshes,10,'exported data cannot alter stored resource counts');
memory.clear();assert.equal(memory.count,0);
const sample=memorySample(0);sample.jsUsedBytes=128*1024*1024;
assert.equal(memory.push(sample),true,'reset allows a new relative clock');
sample.jsUsedBytes=0;
assert.equal(memory.exportRows()[0].jsUsedBytes,128*1024*1024,'samples own their historical values');
console.log('Telemetry memory: bounded history, one-second sampling, missing readings and reset OK');
