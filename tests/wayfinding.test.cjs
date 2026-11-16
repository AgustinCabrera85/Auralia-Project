const assert=require('node:assert/strict');
const {traceRoadRoute,brisaliaWayfinding}=require('../.test-build/world/wayfindingData.js');
const {BRISALIA_ROADS,inBrisaliaFootprint,distanceToRoad}=require('../.test-build/world/brisaliaLayout.js');
const roads=[{points:[[0,0],[10,0]]},{points:[[5,-10],[5,10]]}];
assert.deepEqual(traceRoadRoute(roads,[0,0],[5,10]),[[0,0],[5,0],[5,10]],'Crossings split road segments');
assert.deepEqual(traceRoadRoute([{points:[[0,0],[10,0]]},{points:[[5,0],[15,0]]}],[2,0],[14,0]),[[2,0],[5,0],[10,0],[14,0]],'Overlapping approaches connect');
assert.throws(()=>traceRoadRoute([{points:[[0,0],[1,0]]},{points:[[10,0],[11,0]]}],[0,0],[11,0]),/connected/);
const origin={x:-1250,z:1943},sites=brisaliaWayfinding(origin);
assert.equal(sites.length,7);assert.equal(new Set(sites.map(s=>s.asset)).size,4);
for(const s of sites){
 const x=s.at[0]-origin.x,z=s.at[1]-origin.z;
 assert.ok(!inBrisaliaFootprint(x,z,1.2),s.id+' outside buildings');
 assert.ok(Math.min(...BRISALIA_ROADS.map(r=>distanceToRoad(x,z,r)-r.width/2))>1,s.id+' leaves road clear');
 for(const route of s.routes)assert.ok(route.points.length>=2&&route.distance>0,s.id+' connected destination');
}
const central=sites.find(s=>s.id==='central'),castle=central.routes.find(r=>r.label==='Castillo');
assert.ok(castle.points[1][0]>castle.points[0][0]&&Math.abs(castle.points[1][1]-castle.points[0][1])<.001,'Castle first turn follows east road');
assert.ok(castle.distance>Math.hypot(castle.points.at(-1)[0]-castle.points[0][0],castle.points.at(-1)[1]-castle.points[0][1])+20,'Castle route respects the bend around buildings');
const bend=sites.find(s=>s.id==='south-bend');
for(const [i,[nativeX,nativeZ]] of [[0,[0,1]],[1,[-.699,-.715]]]){
 const r=bend.routes[i],dx=r.points[1][0]-r.points[0][0],dz=r.points[1][1]-r.points[0][1],length=Math.hypot(dx,dz);
 const x=Math.cos(bend.yaw)*nativeX+Math.sin(bend.yaw)*nativeZ,z=-Math.sin(bend.yaw)*nativeX+Math.cos(bend.yaw)*nativeZ;
 assert.ok((x*dx+z*dz)/Math.hypot(x,z)/length>.98,'Authored pointer agrees with path direction');
}
console.log(JSON.stringify({passed:true,sites:sites.length,assetTypes:4,routes:sites.reduce((n,s)=>n+s.routes.length,0)}));
