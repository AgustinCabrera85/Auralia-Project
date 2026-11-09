const assert=require('node:assert/strict');
const {Effect,NullEngine,Scene,ShaderMaterial,TransformNode,Vector3,VertexBuffer}=require('@babylonjs/core');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {WATERFALL_CUT,waterfallGroundAt}=require('../.test-build/world/water/WaterfallGeometry.js');
const {OceanWater}=require('../.test-build/world/water/OceanWater.js');
const {sampleRiverFlow,visualWaterLevel,visualWaterSurfaceAt}=require('../.test-build/world/water/riverFlow.js');
const {MAINLAND,ROAD_RESERVATIONS,isLand,sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const {MAIN_RIVER,LAKE_ISLANDS,LAKE_RESERVATIONS,WATERFALL,bridgeDeckAt,isInlandWater,riverSample,waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const {POINTS_OF_INTEREST}=require('../.test-build/world/pointsOfInterest.js');
const {mapPercent}=require('../.test-build/world/mapProjection.js');
const {createBridgeRoutes,bridgeSurfaceAt}=require('../.test-build/world/mountainRoutes.js');
const mountainBridges=createBridgeRoutes((x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight));

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
      const bridge=bridgeSurfaceAt(mountainBridges,x,z);
      assert.ok(!isInlandWater(x,z,sampleMainlandHeight(x,z))||
        bridge&&bridge.height>(waterSurfaceAt(x,z)?.level??-Infinity),
        `route ${route.name} remains dry or bridged (${x}, ${z})`);
    }
  }
}
assert.equal(new Set(POINTS_OF_INTEREST.map(p=>p.id)).size,POINTS_OF_INTEREST.length,'POI ids are unique');
assert.ok(POINTS_OF_INTEREST.some(p=>p.id==='bosque-ilustrado'),'forest reachable from map');
assert.ok(POINTS_OF_INTEREST.some(p=>p.id==='pradera-florida-v4'),'flower meadow reachable from map');
for(const place of POINTS_OF_INTEREST){
  assert.ok(isLand(place.x,place.z)&&!isInlandWater(place.x,place.z,sampleMainlandHeight(place.x,place.z)),`${place.name} has a dry approach`);
  const mapped=mapPercent(place.x,place.z);
  assert.ok(mapped.left>0&&mapped.left<100&&mapped.top>0&&mapped.top<100,'POI fits the regional map');
}

const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('continent',scene);
const stream=new GeographyStream(scene,root);
function advanceUntil(done,label){
  for(let i=0;i<20000&&!done();i++)stream.update();
  assert.ok(done(),label);
}
function singleBuildSlice(){
  const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
  let clock=0;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock+=5});
  try{stream.update();}finally{
    if(descriptor)Object.defineProperty(performance,'now',descriptor);
    else delete performance.now;
  }
}
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
assert.ok(sampleRiverFlow(501,-999,'river').turbulence>sampleRiverFlow(501,-975,'river').turbulence+.3,
  'waterfall impact settles promptly into the downstream river');
assert.ok(sampleRiverFlow(501,-1004,'river').turbulence>sampleRiverFlow(501,-1020,'river').turbulence,
  'the strongest foam stays at the actual fall');
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
// The rounded northern substrate puts this bank near X=438; X=430 is
// already above water. Exercise the wet apron and the first dry bank.
for(const [wetX,dryX,z] of [[440,430,-1703],[430,410,-1626]]){
  assert.equal(waterSurfaceAt(wetX,z),null,'the canonical narrow channel is preserved');
  const visible=visualWaterSurfaceAt(wetX,z,sampleMainlandHeight(wetX,z));
  assert.ok(visible&&visible.level>sampleMainlandHeight(wetX,z)+.05,
    'upper river reaches the existing valley bank instead of ending as a wall');
  assert.equal(visualWaterSurfaceAt(dryX,z,sampleMainlandHeight(dryX,z)),null,
    'upper river stops at the first high bank');
}
for(const z of [-1180,-1150,-1130]){
  const eastBank=sampleMainlandHeight(540,z),river=riverSample(540,z);
  assert.ok(eastBank>river.level+.75,'the raised east bank contains the upper river');
  assert.equal(visualWaterSurfaceAt(540,z,eastBank),null,
    'rendered water stops before crossing the bank above the falls');
  const channel=waterSurfaceAt(515,z);
  assert.ok(channel&&sampleMainlandHeight(515,z)<channel.level,
    'the river bed remains submerged inside the channel');
}
for(const z of [-1152,-1146,-1143,-1140]){
  for(let x=528;x<=532;x+=.5){
    const ground=sampleMainlandHeight(x,z),river=riverSample(x,z);
    const surface=visualWaterSurfaceAt(x,z,ground);
    const clearance=river.level-ground;
    if(clearance>.12)
      assert.ok(surface&&Math.abs(surface.level-river.level)<1e-6,
        'the upper river remains level until the ground meets the water');
    if(clearance<-.1)
      assert.equal(surface,null,
        'the upper river stops where the ground rises above the water');
  }
}
assert.equal(stream.activeCount,0,'no water chunks are generated at startup');
const cells=[{cx:6,cz:-15},{cx:7,cz:-15},{cx:6,cz:-14},{cx:7,cz:-14}];
stream.setActiveChunks(cells,504,-1000);
singleBuildSlice();
assert.equal(stream.activeCount,0,'a partial build does not publish incomplete geometry');
const building=stream.activeBuild.steps;
stream.setActiveChunks(cells,504,-1000);
assert.equal(stream.activeBuild.steps,building,'repeated focus updates preserve in-progress work');
advanceUntil(()=>cells.every(c=>scene.getMeshByName(`agua-chunk-${c.cx}-${c.cz}`)),
  'near water completes over multiple frames');
const a=scene.getMeshByName('agua-chunk-6--14'),b=scene.getMeshByName('agua-chunk-7--14');
assert.ok(a&&b,'water crosses two streamed terrain cells');
const waterfall=scene.getMeshByName('auralia-waterfall');
assert.ok(waterfall&&waterfall.material instanceof ShaderMaterial,'the waterfall has its own mesh and shader');
assert.equal(scene.meshes.filter(mesh=>mesh.metadata?.waterfall).length,1,'exactly one waterfall is active');
assert.equal(waterfall.material.needAlphaBlending(),false,'the waterfall keeps the opaque depth-writing water model');
assert.ok(a.material instanceof ShaderMaterial,'inland water uses the river shader');
assert.equal(a.material.needAlphaBlending(),false,'inland water hides the ocean beneath it');
assert.ok(a.getVerticesData(VertexBuffer.UVKind).length>0,'inland water provides UVs to the Water Lab shader');
assert.ok(a.getVerticesData(VertexBuffer.UV2Kind).some(value=>Math.abs(value)>.01),'river mesh carries flow direction');
const waterNormals=a.getVerticesData(VertexBuffer.NormalKind);
assert.ok(waterNormals.every((value,index)=>index%3!==1||value>0),'river surface normals face the sky');
const fallPositions=waterfall.getVerticesData(VertexBuffer.PositionKind);
const fallColors=waterfall.getVerticesData(VertexBuffer.ColorKind);
const fallNormals=waterfall.getVerticesData(VertexBuffer.NormalKind);
let dryFallVertices=0;
for(let i=0;i<fallPositions.length;i+=3){
  if(fallColors[i/3*4]<.999||fallColors[i/3*4+1]>0)continue;
  dryFallVertices++;
  assert.ok(fallPositions[i+1]<=nearTerrainHeightAt(fallPositions[i],fallPositions[i+2],sampleMainlandHeight)-.04,
    'dry waterfall shoreline stays below the rendered bank');
}
assert.ok(dryFallVertices>0,'waterfall shoreline contains dry vertices');
assert.ok(fallNormals.some((value,index)=>index%3===1&&value>0&&value<.8),
  'the independent waterfall has steep surface normals');
const fallStride=Math.round((WATERFALL_CUT.maxX-WATERFALL_CUT.minX)/.25)+1;
const fallDrawZAt=(x,z)=>fallPositions[3*(Math.round((z-WATERFALL_CUT.minZ)/.25)*fallStride+
  Math.round((x-WATERFALL_CUT.minX)/.25))+2];
assert.ok(fallDrawZAt(501,-1004)>-1002&&fallDrawZAt(501,WATERFALL_CUT.minZ)===WATERFALL_CUT.minZ,
  'the waterfall leans downstream while its upstream connection stays fixed');
const fallHeightAt=(x,z)=>fallPositions[3*(Math.round((z-WATERFALL_CUT.minZ)/.25)*fallStride+
  Math.round((x-WATERFALL_CUT.minX)/.25))+1];
assert.ok(fallHeightAt(494,-1005)-fallHeightAt(506,-1005)>3,
  'the waterfall preserves the real difference between its two sides');
for(const z of [WATERFALL_CUT.minZ,WATERFALL_CUT.maxZ]){
  const x=500,expected=visualWaterLevel(x,z,waterSurfaceAt(x,z))+.035;
  assert.ok(Math.abs(fallHeightAt(x,z)-expected)<.001,'waterfall connects to the canonical river level');
}
for(let i=0;i<fallPositions.length;i+=3){
  const shore=fallColors[(i/3)*4];
  if(shore>.96)continue;
  const ground=waterfallGroundAt(fallPositions[i],fallPositions[i+2]);
  assert.ok(fallPositions[i+1]-.05>ground-.001,
    'visible waterfall vertices stay above the rendered terrain after bank shading');
  if(shore<.2)assert.ok(fallPositions[i+1]>ground+.02,
    'deep waterfall vertices remain above the rendered terrain');
}
assert.ok(fallNormals.every((value,index)=>index%3!==1||fallColors[Math.floor(index/3)*4]>.96||value>0),
  'visible waterfall triangles do not fold over');
const fallUV=waterfall.getVerticesData(VertexBuffer.UVKind);
const uvAt=(x,z)=>fallUV[2*(Math.round((z-WATERFALL_CUT.minZ)/.25)*fallStride+
  Math.round((x-WATERFALL_CUT.minX)/.25))+1];
assert.ok(uvAt(500,WATERFALL_CUT.maxZ)-uvAt(500,WATERFALL_CUT.minZ)>7,
  'waterfall UV follows distance travelled down the drop');
const riverMeshes=()=>scene.meshes.filter(mesh=>mesh.metadata?.waterLod);
const trianglesInsideCut=mesh=>{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
  for(let i=0;i<indices.length;i+=3){
    const x=(positions[indices[i]*3]+positions[indices[i+1]*3]+positions[indices[i+2]*3])/3;
    const z=(positions[indices[i]*3+2]+positions[indices[i+1]*3+2]+positions[indices[i+2]*3+2])/3;
    if(x>WATERFALL_CUT.minX+1e-5&&x<WATERFALL_CUT.maxX-1e-5&&
      z>WATERFALL_CUT.minZ+1e-5&&z<WATERFALL_CUT.maxZ-1e-5)return true;
  }
  return false;
};
assert.ok(riverMeshes().every(mesh=>!trianglesInsideCut(mesh)),
  'the near river has no triangles under the waterfall');
const boundaryHeights=(mesh,axis,value)=>{
  const p=mesh.getVerticesData(VertexBuffer.PositionKind),c=mesh.getVerticesData(VertexBuffer.ColorKind),out=new Map();
  const fixed=axis==='x'?0:2,other=axis==='x'?2:0;
  for(let i=0;i<p.length;i+=3)if(Math.abs(p[i+fixed]-value)<1e-5&&c[(i/3)*4]<.96)
    out.set(Math.round(p[i+other]*1000),p[i+1]);
  return out;
};
for(const [axis,value] of [['z',WATERFALL_CUT.minZ],['z',WATERFALL_CUT.maxZ],
  ['x',WATERFALL_CUT.minX],['x',WATERFALL_CUT.maxX]]){
  const fallEdge=boundaryHeights(waterfall,axis,value);
  let matches=0;
  for(const mesh of riverMeshes())for(const [coordinate,height] of boundaryHeights(mesh,axis,value)){
    if(!fallEdge.has(coordinate))continue;
    assert.ok(Math.abs(height-fallEdge.get(coordinate))<.001,
      `waterfall ${axis}=${value} meets the adjacent river`);
    matches++;
  }
  assert.ok(matches>0||(axis==='x'&&fallEdge.size===0),
    `waterfall ${axis}=${value} connects where the bank is wet`);
}
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
advanceUntil(()=>scene.getMeshByName('agua-far-chunk-7--14')&&
  scene.getMeshByName('agua-far-chunk-6--15'),'far replacement completes');
const coarse=scene.meshes.find(mesh=>mesh.metadata?.waterLod==='far');
assert.ok(coarse&&coarse.getTotalVertices()<nearVertices,'distant river keeps a lower resolution water mesh');
const farNeighbor=scene.getMeshByName('agua-far-chunk-7--14');
assert.ok(farNeighbor,'far water continues across the adjacent chunk');
assert.equal(scene.getMeshByName('auralia-waterfall'),waterfall,'LOD replacement keeps the same waterfall');
assert.ok(riverMeshes().every(mesh=>!trianglesInsideCut(mesh)),
  'the far river also leaves the waterfall footprint empty');
for(const z of [WATERFALL_CUT.minZ,WATERFALL_CUT.maxZ]){
  const fallEdge=boundaryHeights(waterfall,'z',z);
  let matches=0;
  for(const mesh of riverMeshes().filter(mesh=>mesh.metadata.waterLod==='far'))
    for(const [x,height] of boundaryHeights(mesh,'z',z))if(fallEdge.has(x)){
      assert.ok(Math.abs(height-fallEdge.get(x))<.001,'far river joins waterfall at the same height');
      matches++;
    }
  assert.ok(matches>0,'far river has a populated waterfall connection');
}
stream.setActiveChunks([{cx:6,cz:-14}],504,-1000);
const oldLod=scene.getMeshByName('agua-far-chunk-6--14');
singleBuildSlice();
assert.ok(oldLod&&!oldLod.isDisposed(),'old water remains visible during partial LOD replacement');
advanceUntil(()=>scene.getMeshByName('agua-chunk-6--14'),'near LOD replaces far water');
assert.ok(oldLod.isDisposed(),'old water is released only after its replacement is ready');
let lodBorder=0;
for(const [z,y] of edge(scene.getMeshByName('agua-chunk-6--14'))){
  const other=edge(farNeighbor).get(z);
  if(other!==undefined){assert.ok(Math.abs(y-other)<1e-4,'near and far water meet at the same height');lodBorder++;}
}
assert.ok(lodBorder>0,'near and far water share a populated border');
stream.setActiveChunks([],3000,3000);
assert.equal(stream.activeCount+stream.farActiveCount,0,'water chunks are released outside the far radius');
assert.equal(scene.getMeshByName('auralia-waterfall'),null,'the waterfall mesh is released outside coverage');
assert.equal(scene.getMaterialByName('auralia-waterfall-material'),null,'the waterfall material is released outside coverage');
stream.setActiveChunks([{cx:4,cz:-4}],335,-255);
singleBuildSlice();
const cancelled=stream.activeBuild.steps;
stream.setActiveChunks([],3000,3000);
assert.equal(stream.activeBuild,null,'moving away releases the partial water build');
assert.equal(cancelled.next().done,true,'cancelled builds cannot publish obsolete meshes');
assert.equal(stream.activeCount+stream.farActiveCount,0);
stream.setActiveChunks([{cx:4,cz:-4}],335,-255);
advanceUntil(()=>scene.getMeshByName('agua-chunk-4--4'),'lake water completes');
const nacar=scene.getMeshByName('agua-chunk-4--4');
assert.ok(nacar,'Nácar water is streamed in its existing chunk');
assert.equal(nacar.material.name,'water_pool','Nacar uses the Water Lab pool profile');
const lakePositions=nacar.getVerticesData(VertexBuffer.PositionKind),lakeColors=nacar.getVerticesData(VertexBuffer.ColorKind);
for(let i=0;i<lakePositions.length;i+=3){
  if(sampleMainlandHeight(lakePositions[i],lakePositions[i+2])>=LAKE_RESERVATIONS[0].level){
    assert.ok(lakeColors[i/3*4]>.99,'dry lake-island corners are transparent');
    assert.ok(lakePositions[i+1]<=nearTerrainHeightAt(lakePositions[i],lakePositions[i+2],sampleMainlandHeight)-.04,
      'dry lake-island water stays below the rendered terrain');
  }
}
stream.setActiveChunks([{cx:5,cz:-23}],430,-1626);
advanceUntil(()=>scene.getMeshByName('agua-chunk-5--23'),'upper river water completes');
const upperMesh=scene.getMeshByName('agua-chunk-5--23');
assert.ok(upperMesh,'the expanded upper bank is streamed across the adjacent chunk');
const upperPositions=upperMesh.getVerticesData(VertexBuffer.PositionKind);
assert.ok(upperPositions.some((_,i)=>i%3===0&&upperPositions[i]>429&&upperPositions[i]<432&&
  Math.abs(upperPositions[i+2]+1626)<1&&
  upperPositions[i+1]>sampleMainlandHeight(upperPositions[i],upperPositions[i+2])+.2),
  'the visible upper river reaches the valley bank');
stream.setActiveChunks([{cx:7,cz:-17},{cx:7,cz:-16}],536,-1152);
advanceUntil(()=>scene.getMeshByName('agua-chunk-7--17')&&
  scene.getMeshByName('agua-chunk-7--16'),'bank water completes');
let dryBankVertices=0;
for(const mesh of [scene.getMeshByName('agua-chunk-7--17'),scene.getMeshByName('agua-chunk-7--16')]){
  assert.ok(mesh,'river bank chunks are streamed near the reported edge');
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind);
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    if(x<528||x>537||z< -1161||z> -1149||colors[i/3*4]<.999||colors[i/3*4+3]>.001)continue;
    dryBankVertices++;
    assert.ok(y<=riverSample(x,z).level+.001,
      `dry river shoreline does not climb above the waterline at ${x}, ${z}: ${y}`);
    assert.ok(y<=nearTerrainHeightAt(x,z,sampleMainlandHeight)-.04,
      'dry river shoreline stays below the rendered bank');
  }
}
assert.ok(dryBankVertices>0,'reported river bank has dry shoreline vertices');
const ocean=new OceanWater(scene);
function settleOcean(position){
  for(let i=0;i<2000;i++){
    ocean.update(1/60,position);
    if(!ocean.pendingPatch)return;
  }
  assert.fail('ocean mask finishes within a bounded number of updates');
}
settleOcean(new Vector3(0,0,200));
const near=scene.getMeshByName('auralia-ocean-near'),far=scene.getMeshByName('auralia-ocean-far');
assert.ok(near&&far&&near.material instanceof ShaderMaterial&&far.material instanceof ShaderMaterial,'ocean has distinct near and far shader surfaces');
assert.notEqual(near.material,a.material,'ocean and river have separate materials');
const labShader=(profile,stage)=>{
  const key=Object.keys(Effect.ShadersStore).find(name=>
    name.startsWith(`auraliaWaterLabV4_${profile}_`)&&name.endsWith(`${stage}Shader`));
  assert.ok(key,`${profile} uses the Water Lab v4 ${stage} shader`);
  return Effect.ShadersStore[key];
};
assert.ok(labShader('ocean','Vertex').includes('patchFade'),'ocean waves fade at the near patch edge');
assert.ok(labShader('river','Fragment').includes('vWorldWaterInfo'),'river shader reads the canonical bank mask');
assert.ok(labShader('pool','Fragment').includes('waterfallImpact'),'lakes use the Water Lab pool profile');
assert.ok(labShader('fall','Fragment').includes('collisionGapDebug'),'waterfall uses the Water Lab fall profile');
assert.equal(near.position.z,192,'ocean near patch follows player in 32m blocks');
settleOcean(new Vector3(335,0,-255));
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
