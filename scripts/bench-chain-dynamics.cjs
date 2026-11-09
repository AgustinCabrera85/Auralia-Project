const fs=require('node:fs'),os=require('node:os');
const {ChainDynamics}=require('../.test-build/physics/ChainDynamics.js');
const {ChainCurve}=require('../.test-build/physics/ChainCurve.js');
const focus={x:0,y:2,z:0},q=(a,p)=>a.slice().sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
const results=[];
for(const count of [10,100,500,1000,2000])for(const layout of ['sparse','dense'])for(const variant of ['B-naive','C-index','E-index-lod']){
  const times=[],curves=[],totals={candidates:0,tests:0,contacts:0,potentialPairs:0,integrationMs:0,constraintsMs:0,collisionMs:0,broadPhaseMs:0,narrowPhaseMs:0,pairMs:0};
  let metrics,maxError=0,peakProjection=0,residualPenetration=0;
  for(let repeat=0;repeat<2;repeat++){
    const w=new ChainDynamics();w.useIndex=variant!=='B-naive';w.useLod=variant==='E-index-lod';
    const spacing=layout==='dense'?.18:8;
    for(let i=0;i<count;i++){const x=(i%50-25)*spacing,z=(Math.floor(i/50)-10)*spacing;
      const c=w.add({points:Array.from({length:6},(_,k)=>({x,y:3-k*.45,z})),iterations:3});c.setWind(.4,.1);}
    for(let i=0;i<16;i++)w.setCollider({id:i,kind:'sphere',x:(i%4-2)*(layout==='dense'?.4:12),y:.5,z:(Math.floor(i/4)-2)*(layout==='dense'?.4:12),radius:.75,group:1,mask:1,friction:.2,restitution:0});
    const curve=new ChainCurve();
    for(let frame=0;frame<72;frame++){
      w.advance(1/60,focus);const start=performance.now();
      for(const c of w.chains.values())if(c.lod<2)curve.update(c,w.alpha);
      const reconstruct=performance.now()-start;
      if(frame>=12){times.push(w.metrics.simulationMs);curves.push(reconstruct);for(const key in totals)totals[key]+=w.metrics[key];maxError=Math.max(maxError,w.metrics.maxLengthError);peakProjection=Math.max(peakProjection,w.metrics.maxPenetration);}
    }
    residualPenetration=Math.max(residualPenetration,w.measureResiduals().penetration);
    metrics={...w.metrics};w.dispose();
  }
  for(const key in totals)totals[key]/=times.length;
  const result={count,layout,variant,samples:times.length,medianMs:q(times,.5),p95Ms:q(times,.95),p99Ms:q(times,.99),reconstructionMedianMs:q(curves,.5),reconstructionP95Ms:q(curves,.95),...totals,maxLengthError:maxError,maxPenetrationBeforeProjection:peakProjection,residualPenetration,bufferBytes:metrics.bufferBytes,active:metrics.active,culled:metrics.culled};
  results.push(result);console.log(`${count} ${layout} ${variant}: ${result.medianMs.toFixed(2)} ms; p95 ${result.p95Ms.toFixed(2)}; curve ${result.reconstructionMedianMs.toFixed(2)}`);
}
fs.writeFileSync('artifacts/physics/chains.json',JSON.stringify({date:new Date().toISOString(),cpu:os.cpus()[0].model,node:process.version,conditions:'Node CPU, deterministic grid, 120 Hz, 6 points, 3 iterations, 16 sphere colliders, 12 warmup frames and 60 measured frames x 2 runs; no rendering/GPU/rigid-body equivalent',results},null,2)+'\n');
