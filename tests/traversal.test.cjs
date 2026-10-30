const assert=require('node:assert/strict');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {slopeAllowed,TRAVERSAL}=require('../.test-build/game/traversalRules.js');
const {cameraRelativeMovement}=require('../.test-build/game/movement.js');

const input=(overrides={})=>({
  moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,
  run:false,jumpPressed:false,...overrides
});
const flat={
  ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?{height:0,normalY:1}:null,
  solidTop:()=>null,
  wall:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0
};

const jumper=new CharacterTraversalController();
jumper.teleport(0,0,0);
jumper.step(.02,input({jumpPressed:true}),flat);
assert.equal(jumper.mode,'airborne');
let apex=jumper.position.y;
for(let i=0;i<100;i++){jumper.step(.02,input(),flat);apex=Math.max(apex,jumper.position.y);}
assert.ok(apex>2&&apex<2.6,'jump reaches roughly 2.3 meters');
assert.equal(jumper.mode,'grounded');
assert.ok(Math.abs(jumper.position.y)<1e-6,'lands without sinking or jitter');

const platform={
  ...flat,
  ground:(x,z,origin,max)=>{
    const height=x<2?3:0;
    return origin>=height&&origin-max<=height
      ?{height,normalY:1,...(height?{rockId:'platform'}:{})}:null;
  }
};
const walker=new CharacterTraversalController();
walker.teleport(0,3,0);
for(let i=0;i<4;i++)walker.step(.02,input({moveX:1,vertical:1}),platform);
assert.equal(walker.mode,'grounded','stable on a rock top');
assert.equal(walker.position.y,3);
for(let i=0;i<8;i++)walker.step(.02,input({moveX:1,vertical:1}),platform);
assert.equal(walker.mode,'airborne','walking off a ledge starts a fall');
for(let i=0;i<55;i++)walker.step(.02,input(),platform);
assert.equal(walker.mode,'grounded','lands on terrain below');
assert.equal(walker.position.y,0);

const nearbyLedge={
  ...flat,
  ground:(x,z,origin,max)=>{
    const height=x<.5?3:x>=1&&x<3?1.8:0;
    return origin>=height&&origin-max<=height
      ?{height,normalY:1,...(height?{rockId:height===3?'upper':'lower'}:{})}:null;
  },
  solidTop:(x,z,origin,max)=>x>=.5&&x<1&&origin>=2.9&&origin-max<=2.9
    ?{height:2.9,normalX:1,normalZ:0,rockId:'upper',centerX:0,centerZ:0}:null
};
const descender=new CharacterTraversalController();
descender.teleport(.4,3,0);descender.supportRockId='upper';
descender.step(.02,input({moveX:1,vertical:1}),nearbyLedge);
assert.equal(descender.mode,'airborne','a lower ledge starts a real fall');
for(let i=0;i<120&&descender.mode!=='grounded';i++)descender.step(.02,input(),nearbyLedge);
assert.equal(descender.mode,'grounded','lands on a nearby rock ledge');
assert.ok(Math.abs(descender.position.y-1.8)<.01);

assert.equal(slopeAllowed(Math.cos(35*Math.PI/180)),true);
assert.equal(slopeAllowed(Math.cos(60*Math.PI/180)),false);
const slope=(angle)=>({
  ...flat,
  ground:(x,z,origin,max)=>{
    const height=x*Math.tan(angle*Math.PI/180);
    return origin>=height&&origin-max<=height
      ?{height,normalY:Math.cos(angle*Math.PI/180)}:null;
  },
  fallbackHeight:(x)=>x*Math.tan(angle*Math.PI/180)
});
const gentle=new CharacterTraversalController();
gentle.teleport(0,0,0);
gentle.step(.02,input({moveX:1,vertical:1}),slope(35));
assert.equal(gentle.mode,'grounded');
assert.ok(gentle.position.y>0);
const steep=new CharacterTraversalController();
steep.teleport(0,0,0);
steep.step(.02,input({moveX:1,vertical:1}),slope(60));
assert.equal(steep.mode,'grounded','a 60-degree rise blocks horizontal movement');
assert.equal(steep.position.x,0,'the capsule does not enter the steep terrain');

const wallWorld=(top,climbable)=>({
  ...flat,
  ground:(x,z,origin,max)=>{
    const height=x>1.3?top:0;
    return origin>=height&&origin-max<=height
      ?{height,normalY:1,...(height?{rockId:'column'}:{})}:null;
  },
  wall:(x,y,z,dx,dz,reach)=>dx>0&&x<1&&y<top&&1-x<=reach
    ?{pointX:1,pointY:y,pointZ:0,distance:1-x,normalX:-1,normalY:0,
      normalZ:0,rockId:'column',climbable}:null
});
const blocked=new CharacterTraversalController();
blocked.teleport(0,0,0);
for(let i=0;i<10;i++)blocked.step(.02,input({moveX:1,vertical:1}),wallWorld(30,false));
assert.ok(blocked.position.x<.5,'untagged wall blocks the capsule');
assert.notEqual(blocked.mode,'climbing');
const climber=new CharacterTraversalController();
climber.teleport(0,0,0);
climber.step(.02,input({moveX:1,vertical:1}),wallWorld(30,true));
assert.equal(climber.mode,'climbing','W starts only on a tagged face');
assert.equal(climber.supportRockId,'column');
for(let i=0;i<650&&climber.position.y<30;i++)
  climber.step(.02,input({moveX:1,vertical:1}),wallWorld(30,true));
for(let i=0;i<20&&climber.mode==='mantling';i++)climber.step(.02,input(),wallWorld(30,true));
assert.equal(climber.mode,'grounded','30m column is climbed gradually and mantled');
assert.ok(Math.abs(climber.position.y-30)<.01);
assert.equal(climber.canInteract,true);
const offsetTopWorld={...wallWorld(4,true),ground:(x,z,origin,max)=>{
  const height=x>2.7?4:0;
  return origin>=height&&origin-max<=height
    ?{height,normalY:1,...(height?{rockId:'column'}:{})}:null;
}};
const narrowClimber=new CharacterTraversalController();
narrowClimber.teleport(0,0,0);
for(let i=0;i<150&&narrowClimber.mode!=='mantling';i++)
  narrowClimber.step(.02,input({moveX:1,vertical:1}),offsetTopWorld);
assert.equal(narrowClimber.mode,'mantling','finds a valid ledge beyond a jagged near edge');
const budgetBase=wallWorld(30,true);
let groundQueries=0,wallQueries=0;
const budgetWorld={...budgetBase,
  ground:(...args)=>{groundQueries++;return budgetBase.ground(...args);},
  wall:(...args)=>{wallQueries++;return budgetBase.wall(...args);}
};
const steadyClimber=new CharacterTraversalController();
steadyClimber.teleport(0,0,0);
steadyClimber.step(.02,input({moveX:1,vertical:1}),budgetWorld);
groundQueries=0;wallQueries=0;
for(let i=0;i<60;i++)steadyClimber.step(.02,input({vertical:1}),budgetWorld);
assert.equal(steadyClimber.mode,'climbing');
assert.ok(groundQueries<200,'mantle probes do not run on every climbing frame');
assert.ok(wallQueries<90,'a vertical climb does not raycast for sideways movement');
climber.teleport(0,0,0);
climber.step(.02,input({moveX:1,vertical:1}),wallWorld(30,true));
climber.step(.02,input({jumpPressed:true}),wallWorld(30,true));
assert.equal(climber.mode,'airborne','Space detaches from a wall');

const left=cameraRelativeMovement({x:.6,z:.8},-1,0);
const right=cameraRelativeMovement({x:.6,z:.8},1,0);
assert.ok(left.x===-right.x&&left.z===-right.z,'A and D remain opposite with rotated camera');
assert.equal(TRAVERSAL.maxWalkSlopeDeg,42);
console.log('✓ Traversal: jump, landing, ledge, slopes, walls, 30m climb and controls');
