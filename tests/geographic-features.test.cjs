const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode,VertexBuffer}=require('@babylonjs/core');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {MAINLAND,ROAD_RESERVATIONS,isLand,sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {MAIN_RIVER,LAKE_ISLANDS,LAKE_RESERVATIONS,WATERFALL,bridgeDeckAt,isInlandWater,waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const {POINTS_OF_INTEREST}=require('../.test-build/world/pointsOfInterest.js');
const {mapPercent}=require('../.test-build/world/mapProjection.js');

for(let i=1;i<MAIN_RIVER.length;i++)assert.ok(MAIN_RIVER[i].level<=MAIN_RIVER[i-1].level,'river never flows uphill');
for(let i=1;i<MAIN_RIVER.length;i++){
  const a=MAIN_RIVER[i-1],b=MAIN_RIVER[i],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/6);
  for(let j=0;j<=count;j++){
    const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,water=waterSurfaceAt(x,z);
    assert.ok(water&&sampleMainlandHeight(x,z)<water.level-.035,'river surface covers a continuous carved bed');
  }
}
for(const [x,z] of [[WATERFALL.x,WATERFALL.topZ],[WATERFALL.x,WATERFALL.bottomZ],[WATERFALL.x,WATERFALL.z]]){
  const water=waterSurfaceAt(x,z);
  assert.ok(water&&water.kind==='river');
  assert.ok(sampleMainlandHeight(x,z)<water.level,'waterfall surface has a carved bed');
}
for(const z of [WATERFALL.z,WATERFALL.bottomZ]){
  const level=waterSurfaceAt(WATERFALL.x,z).level;
  for(const side of [-1,1]){
    const bank=sampleMainlandHeight(WATERFALL.x+side*27,z);
    assert.ok(bank>level+.25,'both waterfall banks rise above the water surface');
  }
}
assert.ok(isInlandWater(335,-255,sampleMainlandHeight(335,-255)),'Nácar basin is flooded');
assert.ok(isInlandWater(800,-610,sampleMainlandHeight(800,-610)),'wetland basin is flooded');
for(const island of LAKE_ISLANDS){
  assert.ok(sampleMainlandHeight(island.x,island.z)>LAKE_RESERVATIONS[0].level,'lake island is dry');
}
assert.ok(bridgeDeckAt(155,-133)>waterSurfaceAt(155,-133).level,'bridge is above the stream');
assert.equal(isInlandWater(155,-133,sampleMainlandHeight(155,-133)),false,'bridge can be crossed');

for(const route of ROAD_RESERVATIONS.filter(r=>r.existing)){
  for(let i=1;i<route.points.length;i++){
    const [ax,az]=route.points[i-1],[bx,bz]=route.points[i];
    const count=Math.ceil(Math.hypot(bx-ax,bz-az)/5);
    for(let j=0;j<=count;j++){
      const t=j/count,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      assert.ok(!isInlandWater(x,z,sampleMainlandHeight(x,z)),`route ${route.name} remains dry or bridged`);
    }
  }
}
assert.equal(new Set(POINTS_OF_INTEREST.map(p=>p.id)).size,6,'POI ids are unique');
for(const place of POINTS_OF_INTEREST){
  assert.ok(isLand(place.x,place.z)&&!isInlandWater(place.x,place.z,sampleMainlandHeight(place.x,place.z)),`${place.name} has a dry approach`);
  const mapped=mapPercent(place.x,place.z);
  assert.ok(mapped.left>0&&mapped.left<100&&mapped.top>0&&mapped.top<100,'POI fits the regional map');
}

const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('continent',scene);
const stream=new GeographyStream(scene,root);
assert.equal(stream.activeCount,0,'no water chunks are generated at startup');
const cells=[{cx:6,cz:-14},{cx:7,cz:-14}];
stream.setActiveChunks(cells,504,-1000);
stream.update();stream.update();
const a=scene.getMeshByName('agua-chunk-6--14'),b=scene.getMeshByName('agua-chunk-7--14');
assert.ok(a&&b,'water crosses two streamed terrain cells');
const edge=mesh=>{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),colors=mesh.getVerticesData(VertexBuffer.ColorKind),out=new Map();
  for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i]-504)<1e-5){
    const alpha=colors[(i/3)*4+3];
    if(alpha>.01)out.set(Math.round(positions[i+2]*1000),positions[i+1]);
  }
  return out;
};
const left=edge(a),right=edge(b);
let common=0;
for(const [z,y] of left)if(right.has(z)){
  assert.ok(Math.abs(y-right.get(z))<1e-4,'water height is continuous at chunk border');
  common++;
}
assert.ok(common>0,'both cells have a shared water border');
stream.setActiveChunks([],1100,-900);
assert.equal(stream.activeCount,0,'distant water chunks are released');
stream.dispose();scene.dispose();engine.dispose();
console.log('✓ Accidentes: cauces descendentes, islas, caminos, POI y continuidad del agua entre chunks');
