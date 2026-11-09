const assert=require('node:assert/strict');
const d=require('../.test-build/world/lagoonData.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const {waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {createBridgeRoutes,bridgeSurfaceAt,bridgeRailBlocks,MOUNTAIN_PORTALS}=require('../.test-build/world/mountainRoutes.js');
const input=(overrides={})=>({moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,
  run:false,sprint:false,jumpPressed:false,...overrides});
for(const route of d.LAGOON_CHANNELS)for(let i=1;i<route.length;i++){
  assert.ok(route[i].level<=route[i-1].level,'all tributaries and the outlet flow downhill');
}
assert.equal(sampleMainlandHeight(-160,-810),6,'18m deep lake shares its terrain datum');
assert.equal(waterSurfaceAt(-160,-810).level,24);
assert.equal(d.watershedDistance(-714,-1510),0,'upstream river loads even far from the lake centre');
for(const s of d.LAGOON_SPRINGS.filter(s=>s.kind==='aquifer')){
  assert.ok(sampleMainlandHeight(s.x,s.z)<s.level-2,'spring starts in a wet basin');
  assert.ok(sampleMainlandHeight(s.x-s.dx*s.mouthDistance,s.z-s.dz*s.mouthDistance)<s.level-.5,
    'rock opening meets the pool below its waterline, without an elevated water ramp');
  assert.ok(sampleMainlandHeight(s.x-s.dx*30,s.z-s.dz*30)>s.level+2,'headwall contains the source upstream');
  for(const side of [-1,1])assert.ok(sampleMainlandHeight(s.x-s.dx*20-s.dz*side*30,s.z-s.dz*20+s.dx*side*30)>s.level,
    'spring has dry banks, not an exposed rectangle');
}
assert.ok(d.watershedDistance(1,10)>350,'starting town does not load the whole watershed immediately');
// Check the visible triangles, not just the analytic centreline: both banks
// must contain the river while remaining rounded enough to walk out of it.
const ground=(x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight);
for(const routeIndex of [0,3]){
  const route=d.LAGOON_CHANNELS[routeIndex];
  for(let i=1;i<route.length;i++)for(const t of [.2,.4,.6,.8]){
    const a=route[i-1],b=route[i],x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    // Lake mouths and waterfall lips intentionally use their own section.
    if(d.lagoonRadius(x,z)<1.25||d.LAGOON_FALLS.some(f=>Math.hypot(x-f.x,z-f.z)<55))continue;
    const c=d.lagoonChannelAt(x,z),nx=-c.dz,nz=c.dx;
    assert.ok(c.level-ground(x,z)>4,`incised river bed at ${x},${z}`);
    for(const side of [-1,1]){
      const offset=c.width+14,xx=x+nx*side*offset,zz=z+nz*side*offset;
      assert.ok(ground(xx,zz)>d.lagoonChannelAt(xx,zz).level+3,
        `dry bank with freeboard at ${xx},${zz}`);
      for(let q=0;q<offset;q++){
        const lower=ground(x+nx*side*q,z+nz*side*q);
        const upper=ground(x+nx*side*(q+1),z+nz*side*(q+1));
        assert.ok(Math.abs(upper-lower)<1,'channel bank has no vertical step or pointed crest');
      }
    }
  }
}
// Both the historical terrain branch and the new northern terrain must carve
// the same basin. Previously their boundary left a huge triangular peninsula.
for(let x=-280;x<=-40;x+=12)for(let z=-915;z<=-705;z+=12){
  if(d.lagoonRadius(x,z)<.8)assert.ok(sampleMainlandHeight(x,z)<23.9,
    `continuous basin below its waterline at ${x},${z}`);
}
const bridges=createBridgeRoutes(sampleMainlandHeight);
assert.ok(bridgeSurfaceAt(bridges,-22.69,-530.38).height>waterSurfaceAt(-22.69,-530.38).level+6,
  'the historical road crosses the new outlet on a dry bridge');
for(const [x,z] of [[-670,-1320],[-420,-1040]]){
  const water=waterSurfaceAt(x,z);assert.ok(water,'a river crosses below each bridge');
  assert.ok(sampleMainlandHeight(x,z)<water.level-2);
  assert.ok(bridgeSurfaceAt(bridges,x,z).height>water.level+6,'bridge clears the river');
}
for(const p of MOUNTAIN_PORTALS)for(const b of bridges)
  if(Math.abs(p.z-b.points[0].z)<1)assert.equal(bridgeRailBlocks(b,p.x,p.z+4),false,'cave access has an opening');
for(const f of d.LAGOON_FALLS){
  for(let i=0;i<=40;i++){
    const t=i/40,x=f.x,z=f.z+f.run*t,y=f.top-(f.top-f.bottom)*t*t;
    assert.ok(sampleMainlandHeight(x,z)<y+.1,`${f.id}: water sheet must clear its rock bed (${t})`);
  }
  assert.ok(sampleMainlandHeight(f.x,f.z+f.run)<f.bottom-3,'plunge pool is below water');
}
const world={ground:(x,z,origin,max)=>{const h=sampleMainlandHeight(x,z);
  return h<=origin&&h>=origin-max?{height:h,normalY:1}:null;},
  fallbackHeight:sampleMainlandHeight,waterLevel:(x,z)=>d.lagoonWaterAt(x,z)?.level??null,
  solidTop:()=>null,wall:()=>null,headroom:()=>true,canMove:()=>true};
const c=new CharacterTraversalController();c.teleport(-160,28,-810);
for(let i=0;i<120;i++)c.step(1/60,input(),world);
assert.equal(c.mode,'swimming','falling into the lake enters swimming');
assert.equal(c.jumpCount,0);assert.equal(c.beginActionMotion('roll',1,0,10,1),false);
const surfaceY=c.position.y;
for(let i=0;i<120;i++)c.step(1/60,input({swimVertical:-1}),world);
assert.ok(c.position.y<surfaceY-6,'Ctrl dives');
for(let i=0;i<360;i++)c.step(1/60,input({swimVertical:1,jumpPressed:true}),world);
assert.ok(Math.abs(c.position.y-(24-1.65))<.01,'Space surfaces without jumping repeatedly');
// User-facing Space toggles once per press, then holds depth hands-free.
c.step(.045,input({jumpPressed:true}),world);
for(let i=0;i<240;i++)c.step(1/60,input(),world);
assert.ok(Math.abs(c.position.y-16)<.03,'one Space press dives to a stable depth');
assert.equal(c.swimSubmerged,true);
const heldDepth=c.position.y;
for(let i=0;i<120;i++)c.step(1/60,input(),world);
assert.ok(Math.abs(c.position.y-heldDepth)<.03,'releasing Space does not immediately float up');
c.step(.045,input({jumpPressed:true}),world);
for(let i=0;i<240;i++)c.step(1/60,input(),world);
assert.ok(Math.abs(c.position.y-22.35)<.03,'next Space press resurfaces');
assert.equal(c.swimSubmerged,false);
// Swim to a shallow beach and continue walking without teleporting or sticking.
for(let i=0;i<2400&&c.mode==='swimming';i++)c.step(1/60,input({moveX:-1,horizontal:-1}),world);
assert.equal(c.mode,'grounded','beach returns to grounded locomotion');
for(const [aa,bb] of d.GROTTO_LINKS){const a=d.GROTTO_NODES[aa],b=d.GROTTO_NODES[bb];
  const length=Math.hypot(b.x-a.x,b.z-a.z);
  for(let s=0;s<=length;s+=.5){const t=s/length,h=d.grottoSurfaceAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,.6);
    assert.ok(h,`${aa}-${bb} connected`);assert.ok(h.ceiling-h.height>3.8,'body fits through the siphon');
  }
}
// A rock cap must keep a constant texel density along both horizontal axes,
// including short/wide and tall/narrow columns. The former cylindrical fan
// stretched one texture row over the whole top (and collapsed at some heights).
const {LagoonSystem}=require('../.test-build/world/LagoonSystem.js');
let capDensity=null;
for(const [rx,height,rz] of [[10,3,11],[7,16,8],[3.5,9,4],[16,42,23]]){
  let geometry;
  LagoonSystem.prototype.rock.call({rockColliders:{registerGeneratedMesh(){}},
    mesh:(_name,p,indices,uv)=>{geometry={p,indices,uv};}},
    null,-747,150,-1526,rx,height,rz,13);
  const {p,indices,uv}=geometry;
  for(let i=indices.length-48;i<indices.length;i+=3){
    const tri=indices.slice(i,i+3);
    for(let edge=0;edge<3;edge++){
      const a=tri[edge],b=tri[(edge+1)%3];
      const worldLength=Math.hypot(p[a*3]-p[b*3],p[a*3+2]-p[b*3+2]);
      const textureLength=Math.hypot(uv[a*2]-uv[b*2],uv[a*2+1]-uv[b*2+1]);
      assert.ok(textureLength>0,'rock top does not collapse a texture edge');
      const density=textureLength/worldLength;
      capDensity??=density;
      assert.ok(Math.abs(density-capDensity)<1e-9,'uniform rock texture scale across cap triangles and rock sizes');
    }
  }
}
console.log('✓ Lagoon watershed, bridge crossings, three falls, swimming/diving, beach exit, seven cave links and rock-cap texture scale');

// Exercise real procedural triangles, their merged render mesh and the same
// collision queries consumed by Santi/camera (including stream ownership).
const {NullEngine,Scene,Mesh,StandardMaterial,TransformNode,Vector3}=require('@babylonjs/core');
const {RockColliderSystem}=require('../.test-build/world/RockColliderSystem.js');
const engine=new NullEngine(),scene=new Scene(engine);
const generated=new RockColliderSystem(()=>undefined);
const lagoon=Object.assign(Object.create(LagoonSystem.prototype),{scene,rockColliders:generated,
  stone:new StandardMaterial('test-rock',scene),wetStone:new StandardMaterial('test-wet',scene),
  floor:new StandardMaterial('test-floor',scene),glow:new StandardMaterial('test-glow',scene)});
const root=new TransformNode('streamed-rocks',scene);
lagoon.rock(root,0,-2,0,5,40,5,13);
lagoon.rock(root,35,-2,0,4,18,4,9);
lagoon.arch(root,70,0,0);
const count=generated.activeColliderCount;
assert.equal(count,5,'each boulder and hollow arch registers once');
const side=generated.queryWall(-12,2,0,1,0,20);
assert.ok(side&&side.distance>5&&side.distance<9,'wall matches the irregular shell');
const top=generated.querySolidTop(0,0,50,50);
assert.ok(top&&top.height>35&&top.height<40,'landing uses the actual rock cap');
assert.equal(generated.hasOverheadClearance(0,30,0,15),false,'jump cannot cross the roof');
assert.equal(generated.queryCameraObstruction(new Vector3(70,2,-8),new Vector3(70,2,8),.4),null,
  'the hollow arch stays open, no bounding-box wall');
assert.ok(generated.queryCameraObstruction(new Vector3(70,7,-8),new Vector3(70,7,8),.4)<8,
  'camera hits the stone vault above the opening');
const eye=new Vector3(-12,2,0),desired=new Vector3(10,2,0);
const beforeMerge=generated.queryCameraObstruction(eye,desired,.45);
assert.ok(beforeMerge>5&&beforeMerge<9,'camera finds the near shell');
lagoon.merge(root);
assert.equal(generated.activeColliderCount,count,'merging render geometry retains independent colliders');
assert.equal(root.getChildMeshes().filter(m=>m.isVisible).length,2,'rocks remain batched by material');
assert.equal(generated.queryCameraObstruction(eye,desired,.45),beforeMerge);

const collisionWorld={fallbackHeight:()=>0,canMove:()=>true,
  ground:(x,z,origin,max,radius)=>{
    const rock=generated.queryGround(x,z,origin,max,radius);
    return rock?{height:rock.height,normalY:rock.normal.y,rockId:rock.rockId}:
      origin>=0&&origin-max<=0?{height:0,normalY:1}:null;
  },
  wall:(x,y,z,dx,dz,reach)=>{
    const h=generated.queryWall(x,y,z,dx,dz,reach);
    return h?{pointX:h.point.x,pointY:h.point.y,pointZ:h.point.z,distance:h.distance,
      normalX:h.normal.x,normalY:h.normal.y,normalZ:h.normal.z,rockId:h.rockId,climbable:h.climbable}:null;
  },
  solidTop:(x,z,origin,max,id)=>{
    const h=generated.querySolidTop(x,z,origin,max,id);
    return h?{height:h.height,normalX:h.normal.x,normalZ:h.normal.z,
      rockId:h.rockId,centerX:h.centerX,centerZ:h.centerZ}:null;
  },headroom:(...args)=>generated.hasOverheadClearance(...args)};
for(const motion of ['walk','sprint','roll','double-jump']){
  const player=new CharacterTraversalController();player.teleport(-12,0,0);
  if(motion==='roll')player.beginActionMotion('roll',1,0,30,1);
  for(let i=0;i<120;i++)player.step(1/60,input({moveX:1,horizontal:1,
    run:motion==='sprint',sprint:motion==='sprint',jumpPressed:motion==='double-jump'&&(i===0||i===20)}),collisionWorld);
  assert.ok(player.position.x< -3,`${motion} cannot pass through the rock`);
}
const swimmer=new CharacterTraversalController();swimmer.teleport(-12,5,0);
const wetWorld={...collisionWorld,waterLevel:()=>10};
for(let i=0;i<240;i++){
  swimmer.step(1/60,input({moveX:1,horizontal:1,run:true}),wetWorld);
  const p=swimmer.position;
  const enclosed=[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>
    generated.queryWall(p.x,p.y+1.15,p.z,dx,dz,12)!==null);
  assert.equal(enclosed,false,'swimmer never enters the closed rock shell');
}
assert.equal(swimmer.mode,'swimming');
assert.ok(swimmer.position.x<0,'swimming into the rock is blocked instead of crossing it');
const startX=swimmer.position.x;
for(let i=0;i<240;i++)swimmer.step(1/60,input({moveX:-1,horizontal:-1}),wetWorld);
assert.ok(swimmer.position.x<startX-10,'swimmer can steer away from the obstacle');
swimmer.teleport(35,25,0);
for(let i=0;i<240;i++)swimmer.step(1/60,input({swimVertical:-1}),{...wetWorld,waterLevel:()=>30});
assert.ok(swimmer.position.y>=generated.querySolidTop(35,0,30,30).height+.29,
  'diving stops above a submerged rock cap');
swimmer.teleport(70,2,0);
for(let i=0;i<240;i++)swimmer.step(1/60,input({swimVertical:1}),{...wetWorld,waterLevel:()=>20});
assert.ok(swimmer.position.y<5,'surfacing cannot pass through a rock vault');

root.setEnabled(false);
assert.equal(generated.queryWall(-12,2,0,1,0,20),null,'disabled exterior does not collide inside the cave');
assert.equal(generated.queryCameraObstruction(eye,desired,.45),null);
root.setEnabled(true);
assert.equal(generated.queryCameraObstruction(eye,desired,.45),beforeMerge);
root.dispose();
assert.equal(generated.activeColliderCount,0,'stream unload unregisters all generated shells');
const meshes=scene.meshes.length,geometries=scene.geometries.length;
for(let i=0;i<12;i++){
  const streamed=new TransformNode('reload',scene);
  lagoon.rock(streamed,0,-2,0,5,40,5,13);lagoon.rock(streamed,35,-2,0,4,18,4,9);
  lagoon.merge(streamed);streamed.dispose();
  assert.equal(generated.activeColliderCount,0);
  assert.equal(scene.meshes.length,meshes,'no proxy mesh retained after reloading');
  assert.equal(scene.geometries.length,geometries,'no geometry retained after reloading');
}
generated.dispose();scene.dispose();engine.dispose();
console.log('✓ Generated rock collision: exact walls/caps/arches, camera, walk/sprint/roll/jump/swim, merge and stream cleanup');
