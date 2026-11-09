// Broad+narrow stress with actual segment capsules, including the dense worst
// case. Static snapshot: not a claim about a fully coupled cloth/rope solver.
const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {SpatialHash}=require('../.test-build/physics/SpatialHash.js');
const {closestSegments}=require('../.test-build/physics/DistanceFields.js');
const results=[],hit={s:0,t:0,distance:0,nx:0,ny:0,nz:0},ids=[];
for(const n of [10,100,500,1000,2000])for(const dense of [false,true]){
  const segments=[],grid=new SpatialHash(2);
  for(let i=0;i<n;i++){
    const x=dense?Math.sin(i*2.4)*.2:(i%50)*4,z=dense?Math.cos(i*2.4)*.2:Math.floor(i/50)*4;
    const theta=i*2.4,dx=Math.cos(theta),dz=Math.sin(theta);
    const p=[x-dx,0,z-dz,x+dx,0,z+dz],b={minX:Math.min(p[0],p[3])-.1,maxX:Math.max(p[0],p[3])+.1,minY:-.1,maxY:.1,minZ:Math.min(p[2],p[5])-.1,maxZ:Math.max(p[2],p[5])+.1};
    segments.push({p,b});grid.upsert(i,b);
  }
  let reference;
  for(const index of [false,true]){
    const times=[];let tests=0,contacts=0;
    for(let repeat=0;repeat<12;repeat++){
      tests=contacts=0;const start=performance.now();
      for(let i=0;i<n;i++){
        grid.query(segments[i].b,ids,!index);
        for(const id of ids){if(id<=i)continue;tests++;closestSegments(...segments[i].p,...segments[id].p,hit);if(hit.distance<.2)contacts++;}
      }
      if(repeat>=2)times.push(performance.now()-start);
    }
    if(!index)reference=contacts;else assert.equal(contacts,reference,'no missed or duplicate pair contacts');
    times.sort((a,b)=>a-b);
    results.push({n,layout:dense?'dense':'sparse',index,potential:n*(n-1)/2,tests,contacts,medianMs:times[4],p95Ms:times[9]});
  }
}
fs.writeFileSync('artifacts/physics/segment-pairs.json',JSON.stringify({cpu:os.cpus()[0].model,node:process.version,conditions:'Capsule snapshot, 2 warmups + 10 measurements, 0.1 m radius, identical contacts asserted',results},null,2)+'\n');
console.log('Segment pair benchmark saved; exhaustive and indexed contacts agree in every sparse/dense case.');
