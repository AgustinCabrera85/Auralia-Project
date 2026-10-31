const assert=require('node:assert/strict');
const {Effect,NullEngine,Scene,ShaderMaterial,TransformNode,Vector3,VertexBuffer}=require('@babylonjs/core');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {OceanWater}=require('../.test-build/world/water/OceanWater.js');
const {sampleRiverFlow,visualWaterLevel,visualWaterSurfaceAt}=require('../.test-build/world/water/riverFlow.js');
const {MAINLAND,ROAD_RESERVATIONS,isLand,sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {MAIN_RIVER,LAKE_ISLANDS,LAKE_RESERVATIONS,WATERFALL,bridgeDeckAt,isInlandWater,riverSample,waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
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
const calm=sampleRiverFlow(335,-255,'lake');
assert.equal(Math.hypot(calm.directionX,calm.directionZ),0,'Nácar stays still');
assert.equal(calm.velocity,0,'lake has no river current');
assert.equal(sampleRiverFlow(450,-320,'river').velocity,0,'river current settles inside Nácar');
const approachingLake=sampleRiverFlow(475,-320,'river').velocity;
assert.ok(approachingLake>0&&approachingLake<sampleRiverFlow(500,-320,'river').velocity,'flow slows gradually before Nácar');
const joiningRiver=waterSurfaceAt(456,-320);
assert.equal(joiningRiver.kind,'river');
assert.ok(Math.abs(visualWaterLevel(456,-320,joiningRiver)-LAKE_RESERVATIONS[0].level)<.001,'rendered river joins Nácar at lake height');
assert.ok(joiningRiver.level>LAKE_RESERVATIONS[0].level,'canonical river level is unchanged');
const upstream=MAIN_RIVER[2],downstream=MAIN_RIVER[3];
const flow=sampleRiverFlow((upstream.x+downstream.x)/2,(upstream.z+downstream.z)/2,'river');
assert.ok(flow.directionX*(downstream.x-upstream.x)+flow.directionZ*(downstream.z-upstream.z)>0,'river follows the descending route');
const bendIndex=MAIN_RIVER.findIndex(point=>point.x===500&&point.z===-320);
const before=MAIN_RIVER[bendIndex-1],turn=MAIN_RIVER[bendIndex],after=MAIN_RIVER[bendIndex+1];
const incoming=sampleRiverFlow(before.x+(turn.x-before.x)*.999,before.z+(turn.z-before.z)*.999,'river');
const outgoing=sampleRiverFlow(turn.x+(after.x-turn.x)*.001,turn.z+(after.z-turn.z)*.001,'river');
assert.ok(incoming.directionX*outgoing.directionX+incoming.directionZ*outgoing.directionZ>.95,'flow direction is continuous through a bend');
assert.ok(Math.abs(incoming.turbulence-outgoing.turbulence)<.1,'bend turbulence has no segment seam');
assert.ok(sampleRiverFlow(WATERFALL.x,WATERFALL.z,'river').turbulence>sampleRiverFlow(450,-500,'river').turbulence,'waterfall is more turbulent than calm river');
const fallWest=waterSurfaceAt(494,-1005),fallEast=waterSurfaceAt(506,-1005);
assert.ok(fallWest.level-fallEast.level>4,'canonical waterfall banks keep their geographic samples');
assert.equal(visualWaterLevel(506,-1005,fallEast),fallEast.level,'rendered waterfall keeps the carved bed level');
const bankGround=sampleMainlandHeight(484,-1014);
const bankApron=visualWaterSurfaceAt(484,-1014,bankGround);
assert.equal(waterSurfaceAt(484,-1014),null,'the gameplay river width remains unchanged');
assert.ok(bankApron&&bankApron.level>bankGround&&bankApron.level<riverSample(484,-1014).level,
  'visual water tapers down into the already-carved bank');
assert.equal(visualWaterSurfaceAt(475,-1014,sampleMainlandHeight(475,-1014)),null,
  'the visual bank does not extend beyond the limited apron');
assert.equal(visualWaterSurfaceAt(490,-1204,sampleMainlandHeight(490,-1204)),null,
  'the river does not flood terrain far from its channel');
assert.equal(stream.activeCount,0,'no water chunks are generated at startup');
const cells=[{cx:6,cz:-14},{cx:7,cz:-14}];
stream.setActiveChunks(cells,504,-1000);
stream.update();stream.update();
const a=scene.getMeshByName('agua-chunk-6--14'),b=scene.getMeshByName('agua-chunk-7--14');
assert.ok(a&&b,'water crosses two streamed terrain cells');
assert.ok(a.material instanceof ShaderMaterial,'inland water uses the river shader');
assert.equal(a.material.needAlphaBlending(),false,'inland water hides the ocean beneath it');
assert.ok(a.getVerticesData(VertexBuffer.UV2Kind).some(value=>Math.abs(value)>.01),'river mesh carries flow direction');
const waterNormals=a.getVerticesData(VertexBuffer.NormalKind);
assert.ok(waterNormals.every((value,index)=>index%3!==1||value>0),'river surface normals face the sky');
assert.ok(waterNormals.some((value,index)=>index%3===1&&value<.8),
  'waterfall vertices include steep surface normals');
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
const nearVertices=a.getTotalVertices();
stream.setActiveChunks([],504,-1000);
for(let i=0;i<8&&!scene.getMeshByName('agua-far-chunk-7--14');i++)stream.update();
const coarse=scene.meshes.find(mesh=>mesh.metadata?.waterLod==='far');
assert.ok(coarse&&coarse.getTotalVertices()<nearVertices,'distant river keeps a lower resolution water mesh');
const farNeighbor=scene.getMeshByName('agua-far-chunk-7--14');
assert.ok(farNeighbor,'far water continues across the adjacent chunk');
stream.setActiveChunks([{cx:6,cz:-14}],504,-1000);
stream.update();
let lodBorder=0;
for(const [z,y] of edge(scene.getMeshByName('agua-chunk-6--14'))){
  const other=edge(farNeighbor).get(z);
  if(other!==undefined){assert.ok(Math.abs(y-other)<1e-4,'near and far water meet at the same height');lodBorder++;}
}
assert.ok(lodBorder>0,'near and far water share a populated border');
stream.setActiveChunks([],3000,3000);
assert.equal(stream.activeCount+stream.farActiveCount,0,'water chunks are released outside the far radius');
stream.setActiveChunks([{cx:4,cz:-4}],335,-255);
stream.update();
const nacar=scene.getMeshByName('agua-chunk-4--4');
assert.ok(nacar,'Nácar water is streamed in its existing chunk');
const lakePositions=nacar.getVerticesData(VertexBuffer.PositionKind),lakeColors=nacar.getVerticesData(VertexBuffer.ColorKind);
for(let i=0;i<lakePositions.length;i+=3){
  if(sampleMainlandHeight(lakePositions[i],lakePositions[i+2])>=LAKE_RESERVATIONS[0].level)
    assert.ok(lakeColors[i/3*4]>.99,'dry lake-island corners are transparent');
}
const ocean=new OceanWater(scene);
ocean.update(1/60,new Vector3(0,0,200));
const near=scene.getMeshByName('auralia-ocean-near'),far=scene.getMeshByName('auralia-ocean-far');
assert.ok(near&&far&&near.material instanceof ShaderMaterial&&far.material instanceof ShaderMaterial,'ocean has distinct near and far shader surfaces');
assert.notEqual(near.material,a.material,'ocean and river have separate materials');
assert.ok(Effect.ShadersStore.auraliaOceanVertexShader.includes('gerstner'),'ocean uses Gerstner waves');
assert.ok(!Effect.ShadersStore.auraliaRiverVertexShader.includes('gerstner'),'river has a separate motion model');
assert.ok(!Effect.ShadersStore.auraliaRiverVertexShader.includes('verticalRipple'),'river normals animate without opening mesh gaps');
assert.equal(near.position.z,192,'ocean near patch follows player in 32m blocks');
ocean.update(1/60,new Vector3(335,0,-255));
const oceanPositions=near.getVerticesData(VertexBuffer.PositionKind),oceanColors=near.getVerticesData(VertexBuffer.ColorKind);
let maskedLake=false;
for(let i=0;i<oceanPositions.length;i+=3){
  if(Math.hypot(near.position.x+oceanPositions[i]-335,near.position.z+oceanPositions[i+2]+255)<5&&oceanColors[i/3*4+1]>.9)
    maskedLake=true;
}
assert.ok(maskedLake,'ocean wave displacement is masked beneath Nácar');
ocean.dispose();
stream.dispose();scene.dispose();engine.dispose();
console.log('✓ Accidentes: cauces descendentes, islas, caminos, POI y continuidad del agua entre chunks');
