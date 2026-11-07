const assert=require('node:assert/strict');
const {TelemetryHistory,TELEMETRY_COLUMNS,T}=require('../.test-build/game/telemetryData.js');
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
