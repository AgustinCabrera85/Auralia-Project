const assert=require('node:assert/strict');
const baseline=require('./fixtures/brisalia-relief-baseline.json');
const {sampleMainlandHeight,MAINLAND,isLand}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt,nearTerrainSurfaceAt,TERRAIN_LOD_CONFIG}=require('../.test-build/world/terrainLod.js');
const {applyRegionalRelief}=require('../.test-build/world/regionalRelief.js');
const {FAROLES_RELIEF}=require('../.test-build/world/regionalReliefData.js');
const {STREAMS,isInlandWater}=require('../.test-build/world/geographicFeatures.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {slopeAllowed}=require('../.test-build/game/traversalRules.js');
const {LocalStorageSaveRepository}=require('../.test-build/persistence/SaveRepository.js');
const {newGame}=require('../.test-build/domain/types.js');
const {applyLagoonRelief,lagoonWaterAt}=require('../.test-build/world/lagoonData.js');
const height=(x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight);
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

// Captured before introducing P1, not generated from the implementation under test.
for(const group of ['anchors','roads','core','outside'])for(const p of baseline[group]){
  // These two undeveloped outer points now belong to the requested continental
  // redesign. All inhabited/water/geology/forest reference points stay exact.
  if(group==='outside'&&((p.x===-1200||p.x===1000)&&p.z===-1000)){
    assert.ok(sampleMainlandHeight(p.x,p.z)>p.height+25,'outer landscape gains substantial relief');
    continue;
  }
  // The new watershed intentionally crosses this former dry road. Its bridge
  // support is tested separately; all other historic heights stay exact.
  const watershed=applyLagoonRelief(p.x,p.z,p.height);
  if(Math.abs(watershed-p.height)>.00001){
    near(sampleMainlandHeight(p.x,p.z),watershed);
    if(lagoonWaterAt(p.x,p.z))assert.ok(Number.isFinite(height(p.x,p.z)));
    continue;
  }
  near(sampleMainlandHeight(p.x,p.z),p.height);
  const step=TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions;
  const x0=Math.floor(p.x/step)*step,z0=Math.floor(p.z/step)*step;
  const watershedTouchesSupport=[[x0,z0],[x0+step,z0],[x0,z0+step],[x0+step,z0+step]]
    .some(([x,z])=>Math.abs(applyLagoonRelief(x,z,p.height)-p.height)>.00001);
  if(watershedTouchesSupport)assert.ok(Number.isFinite(height(p.x,p.z)),
    'watershed-adjacent terrain support remains finite');
  else near(height(p.x,p.z),p.support);
}
assert.equal(MAINLAND.terrainSubdivisions,12);
assert.deepEqual([TERRAIN_LOD_CONFIG.nearRadius,TERRAIN_LOD_CONFIG.midRadius,TERRAIN_LOD_CONFIG.farRadius],[252,720,1700]);
assert.deepEqual([MAINLAND.radiusX,MAINLAND.radiusZ],[2000,1500]);

// The new landforms must be substantial and connected, not texture changes.
const town=sampleMainlandHeight(0,-23),top=sampleMainlandHeight(-270,-95);
assert.ok(top-town>=65&&top-town<=90,'expanded plateau has a 65–90 m rise above the town');
assert.ok(sampleMainlandHeight(-38,-352)>sampleMainlandHeight(-20,-220)+14,'ridge frames the basin');
assert.ok(sampleMainlandHeight(90,-260)>sampleMainlandHeight(126,-270)+12,'gorge has a visible bank above its existing bed');
for(const p of STREAMS[0].points)near(applyRegionalRelief(p.x,p.z,7,0),7);

// No height or first-derivative seam at the regional support boundary.
const b=FAROLES_RELIEF.bounds;
for(let q=0;q<=1;q+=.05)for(const [x,z,nx,nz] of [
  [b.minX,b.minZ+(b.maxZ-b.minZ)*q,1,0],
  [b.maxX,b.minZ+(b.maxZ-b.minZ)*q,-1,0],
  [b.minX+(b.maxX-b.minX)*q,b.minZ,0,1],
  [b.minX+(b.maxX-b.minX)*q,b.maxZ,0,-1]
]){
  near(applyRegionalRelief(x,z,11,0),11);
  near(applyRegionalRelief(x-nx,z-nz,11,0),11);
  assert.ok(Math.abs(applyRegionalRelief(x+nx*.01,z+nz*.01,11,0)-11)<.0001);
}
for(let z=b.minZ;z<=b.maxZ;z+=18)for(let x=b.minX;x<=b.maxX;x+=18){
  const y=sampleMainlandHeight(x,z);
  assert.ok(Number.isFinite(y));
  assert.ok(Math.abs(y-sampleMainlandHeight(x+.001,z))<.01);
  assert.ok(Math.abs(y-sampleMainlandHeight(x,z+.001))<.01);
}

const world={
  ground(x,z,origin,max){const h=height(x,z),d=.55;
    return h<=origin+.001&&h>=origin-max-.001?{height:h,
      normalY:1/Math.hypot(1,(height(x+d,z)-height(x-d,z))/(2*d),
        (height(x,z+d)-height(x,z-d))/(2*d))}:null;},
  solidTop:()=>null,wall:()=>null,headroom:()=>true,
  canMove:(x,z)=>isLand(x,z)&&!isInlandWater(x,z,sampleMainlandHeight(x,z)),
  fallbackHeight:height
};
const input=(x,z,run,jumpPressed=false)=>({moveX:x,moveZ:z,forwardX:x,forwardZ:z,
  horizontal:0,vertical:1,run,sprint:false,jumpPressed});
const results=[];
for(const path of FAROLES_RELIEF.approaches){
  let maxGrade=0;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=0;d<=length;d+=1){
      const x=a[0]+(b[0]-a[0])*d/length,z=a[1]+(b[1]-a[1])*d/length;
      const s=nearTerrainSurfaceAt(x,z,sampleMainlandHeight);
      const grade=Math.hypot(s.slopeX,s.slopeZ);maxGrade=Math.max(grade,maxGrade);
      assert.ok(slopeAllowed(1/Math.hypot(1,grade)),`${path.id}: unwalkable at ${x},${z}`);
    }
  }
  for(const reverse of [false,true])for(const run of [false,true]){
    const points=reverse?[...path.points].reverse():path.points;
    const avatar=new CharacterTraversalController();
    avatar.teleport(points[0][0],height(points[0][0],points[0][1]),points[0][1]);
    let waypoint=1,frames=0;
    while(waypoint<points.length&&frames<15000){
      const p=points[waypoint],dx=p[0]-avatar.position.x,dz=p[1]-avatar.position.z,l=Math.hypot(dx,dz);
      if(l<.55){waypoint++;continue;}
      avatar.step(1/60,input(dx/l,dz/l,run),world);frames++;
    }
    assert.equal(waypoint,points.length,`${path.id}: controller stuck at ${JSON.stringify(avatar.position)}`);
    assert.ok(Math.abs(avatar.position.y-height(avatar.position.x,avatar.position.z))<.5);
    results.push({path:path.id,reverse,run,seconds:+(frames/60).toFixed(1)});
  }
  assert.ok(maxGrade<.84,`${path.id}: retain margin below the 42 degree limit`);
}
// Jump and landing at the summit use the same visible triangles as movement.
const jumper=new CharacterTraversalController();jumper.teleport(-270,height(-270,-95),-95);
jumper.step(1/60,input(0,0,false,true),world);
assert.equal(jumper.mode,'airborne');
for(let i=0;i<240;i++)jumper.step(1/60,input(0,0,false),world);
assert.equal(jumper.mode,'grounded');near(jumper.position.y,height(-270,-95));

// Load an actual old v1 shape: no anchor/baseY, same IDs and unchanged support.
const save=newGame();save.structures=[{id:'old-wall',type:'wall',zone:'brisalia',x:-29,z:18,rotation:0}];
save.playerPosition={zone:'brisalia',x:-29,z:18};
global.localStorage={getItem:()=>JSON.stringify(save)};
const loaded=new LocalStorageSaveRepository().load();
assert.equal(loaded.structures[0].id,'old-wall');assert.equal(loaded.structures[0].legacy,true);
assert.deepEqual(loaded.playerPosition,save.playerPosition);
near(sampleMainlandHeight(-29,18),baseline.anchors.find(p=>p.id==='hogar').height);
delete global.localStorage;
console.log('✓ Regional relief: historical support, compact transitions, water, walking/running ascent and return, jump and legacy save');
console.log(JSON.stringify(results));
