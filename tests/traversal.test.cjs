const assert=require('node:assert/strict');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {DoubleTapSprint}=require('../.test-build/game/DoubleTapSprint.js');
const {slopeAllowed,TRAVERSAL}=require('../.test-build/game/traversalRules.js');
const {terrainWallAt}=require('../.test-build/game/TerrainTraversal.js');
const {cameraRelativeMovement}=require('../.test-build/game/movement.js');

const input=(overrides={})=>({
  moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,
  run:false,sprint:false,jumpPressed:false,...overrides
});
const flat={
  ground:(x,z,origin,max)=>origin>=0&&origin-max<=0?{height:0,normalY:1}:null,
  solidTop:()=>null,
  wall:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:()=>0
};

const shift=new DoubleTapSprint();
shift.press(1000);assert.equal(shift.active,false);
shift.release();shift.press(1240);assert.equal(shift.active,true,'double Shift enables sprint');
shift.press(1250);assert.equal(shift.active,true,'key repeat does not cancel sprint');
shift.release();assert.equal(shift.active,false,'release ends sprint');
shift.press(2000);shift.release();shift.press(2400);
assert.equal(shift.active,false,'slow second press stays at normal run');
shift.reset();shift.press(2500);
assert.equal(shift.active,false,'focus loss clears the double-tap window');
const distanceFor=(run,sprint)=>{
  const avatar=new CharacterTraversalController();avatar.teleport(0,0,0);
  avatar.step(.1,input({moveX:1,vertical:1,run,sprint}),flat);
  return avatar.position.x;
};
assert.ok(distanceFor(false,false)<distanceFor(true,false));
assert.ok(distanceFor(true,false)<distanceFor(true,true),
  'double Shift increases traversal speed');

const jumper=new CharacterTraversalController();
jumper.teleport(0,0,0);
jumper.step(.02,input({jumpPressed:true}),flat);
assert.equal(jumper.mode,'airborne');
let apex=jumper.position.y;
for(let i=0;i<100;i++){jumper.step(.02,input(),flat);apex=Math.max(apex,jumper.position.y);}
assert.ok(apex>2&&apex<2.6,'jump reaches roughly 2.3 meters');
assert.equal(jumper.mode,'grounded');
assert.ok(Math.abs(jumper.position.y)<1e-6,'lands without sinking or jitter');

const doubleJumper=new CharacterTraversalController();
doubleJumper.teleport(0,0,0);
doubleJumper.step(.02,input({jumpPressed:true}),flat);
assert.equal(doubleJumper.jumpCount,1);
for(let i=0;i<10;i++)doubleJumper.step(.02,input(),flat);
const beforeSecondJump=doubleJumper.position.y;
doubleJumper.step(.02,input({jumpPressed:true}),flat);
assert.equal(doubleJumper.jumpCount,2,'second Space press spends the air jump');
assert.ok(doubleJumper.position.y>beforeSecondJump,'second impulse lifts the player');
doubleJumper.step(.02,input({jumpPressed:true}),flat);
assert.equal(doubleJumper.jumpCount,2,'a third jump is rejected');
for(let i=0;i<200&&doubleJumper.mode!=='grounded';i++)
  doubleJumper.step(.02,input(),flat);
assert.equal(doubleJumper.mode,'grounded');
assert.equal(doubleJumper.jumpCount,0,'landing restores both jumps');

const leap=(run,sprint)=>{
  const avatar=new CharacterTraversalController();avatar.teleport(0,0,0);
  let apex=0;
  for(let i=0;i<160;i++){
    avatar.step(.02,input({moveX:1,vertical:1,run,sprint,jumpPressed:i===0}),flat);
    apex=Math.max(apex,avatar.position.y);
    if(i>0&&avatar.mode==='grounded')break;
  }
  return {distance:avatar.position.x,apex};
};
const walkingLeap=leap(false,false),runningLeap=leap(true,false);
assert.ok(runningLeap.apex>walkingLeap.apex+.7,'running jump rises higher');
assert.ok(runningLeap.distance>walkingLeap.distance*1.4,'running jump travels farther');

const directedDouble=new CharacterTraversalController();
directedDouble.teleport(0,0,0);
directedDouble.step(.02,input({jumpPressed:true}),flat);
for(let i=0;i<8;i++)directedDouble.step(.02,input(),flat);
directedDouble.step(.02,input({moveZ:1,forwardX:1,jumpPressed:true}),flat);
const dashStart=directedDouble.position.z;
for(let i=0;i<8;i++)directedDouble.step(.02,input({moveX:-1}),flat);
assert.ok(directedDouble.position.z>dashStart+3,'double jump launches strongly in chosen direction');
assert.ok(directedDouble.position.x>-.1,'initial dash resists immediate side steering');
assert.ok(directedDouble.airTravelDirection.z>.99,'facing can follow real air velocity');

const verticalDouble=new CharacterTraversalController();verticalDouble.teleport(0,0,0);
verticalDouble.step(.02,input({jumpPressed:true}),flat);
for(let i=0;i<8;i++)verticalDouble.step(.02,input(),flat);
verticalDouble.step(.02,input({jumpPressed:true}),flat);
for(let i=0;i<8;i++)verticalDouble.step(.02,input(),flat);
assert.ok(Math.abs(verticalDouble.position.x)<1e-6&&
  Math.abs(verticalDouble.position.z)<1e-6,
  'double jump without movement input stays vertical');

const sweep=new CharacterTraversalController();sweep.teleport(0,0,0);
assert.equal(sweep.beginActionMotion('sweep',1,0,1.5,.9),true);
for(let i=0;i<45;i++)sweep.step(.02,input({moveZ:1,vertical:1}),flat);
assert.ok(sweep.position.x>.1&&sweep.position.x<1,
  'standing sweep advances a little with inertia');
assert.ok(Math.abs(sweep.position.z)<1e-6,'sweep does not follow free steering');
assert.equal(sweep.actionMotionActive,false);
sweep.step(.02,input({moveZ:1,vertical:1}),flat);
assert.ok(sweep.position.z>0,'steering resumes after the sweep');

const landingRoll=new CharacterTraversalController();landingRoll.teleport(0,0,0);
landingRoll.beginActionMotion('landingRoll',1,0,8,1);
for(let i=0;i<38;i++)landingRoll.step(.02,input({moveZ:1,vertical:1,run:true}),flat);
const standingX=landingRoll.position.x;
assert.equal(landingRoll.actionMotionActive,true);
for(let i=0;i<11;i++)landingRoll.step(.02,input({moveZ:1,vertical:1,run:true}),flat);
assert.ok(Math.abs(landingRoll.position.x-standingX)<1e-6,
  'landing roll stops translating when Santi stands up');
assert.ok(Math.abs(landingRoll.position.z)<1e-6,
  'running remains blocked until the roll finishes');
landingRoll.step(.02,input({moveZ:1,vertical:1,run:true}),flat);
landingRoll.step(.02,input({moveZ:1,vertical:1,run:true}),flat);
assert.ok(landingRoll.position.z>0,'running resumes after the complete roll');

const landingHold=new CharacterTraversalController();landingHold.teleport(0,0,0);
landingHold.beginActionMotion('landingHold',1,0,0,.55);
for(let i=0;i<27;i++)landingHold.step(.02,input({moveX:1,vertical:1}),flat);
assert.ok(Math.abs(landingHold.position.x)<1e-6,
  'double jump landing recovery cannot slide on a static pose');
landingHold.step(.02,input({moveX:1,vertical:1}),flat);
landingHold.step(.02,input({moveX:1,vertical:1}),flat);
assert.ok(landingHold.position.x>0,'movement returns when landing recovery ends');

const kick=new CharacterTraversalController();kick.teleport(0,0,0);
kick.beginActionMotion('attackHold',1,0,0,.6);
for(let i=0;i<30;i++)kick.step(.02,input({moveX:1,vertical:1,run:true}),flat);
assert.ok(Math.abs(kick.position.x)<1e-6,
  'kick animation prevents physical translation despite movement input');
kick.step(.02,input({moveX:1,vertical:1}),flat);
assert.ok(kick.position.x>0,'movement resumes after the kick');

const rolling=new CharacterTraversalController();rolling.teleport(0,0,0);
rolling.step(.02,input({moveX:1,vertical:1,run:true}),flat);
const travel=rolling.groundTravelVelocity;
assert.ok(Math.abs(travel.speed-19)<.1,'roll can read the actual pre-action run speed');
const rollStart=rolling.position.x;
rolling.beginActionMotion('roll',travel.x,travel.z,travel.speed,.9);
for(let i=0;i<20;i++)rolling.step(.02,input({moveZ:1,vertical:1}),flat);
assert.ok(rolling.position.x>rollStart+1,
  'moving roll retains substantial forward inertia');
assert.ok(Math.abs(rolling.position.z)<1e-6,
  'moving roll ignores direction changes during its animation');
for(let i=20;i<45;i++)rolling.step(.02,input({moveZ:1,vertical:1}),flat);
const rollEndX=rolling.position.x;
assert.equal(rolling.actionMotionActive,false);
assert.ok(Math.abs(rolling.position.z)<1e-6,
  'the roll direction stays locked through its final frame');
rolling.step(.02,input(),flat);
assert.ok(rolling.position.x>rollEndX,
  'roll momentum continues briefly instead of stopping instantly');
const carryX=rolling.position.x;
rolling.step(.02,input({moveZ:1,vertical:1}),flat);
assert.ok(rolling.position.x>carryX&&rolling.position.z>0,
  'new steering blends in after the roll ends');

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

for(const fps of [30,60,144])for(const angle of [35,55,60]){
  const runner=new CharacterTraversalController();runner.teleport(0,0,0);
  for(let i=0;i<fps;i++)runner.step(1/fps,input({moveX:1,vertical:1,run:true,sprint:true}),slope(angle));
  assert.equal(runner.mode,'grounded',`${fps} FPS: sprint stays on the ${angle}-degree hill`);
  assert.ok(Math.abs(Math.hypot(runner.position.x,runner.position.y)-27)<.02,
    'surface speed and ascent do not depend on frame rate');
  assert.ok(Math.abs(runner.groundGrade-Math.tan(angle*Math.PI/180))<.001);
}
const tooSteep=new CharacterTraversalController();tooSteep.teleport(0,0,0);
for(let i=0;i<60;i++)tooSteep.step(1/60,input({moveX:1,vertical:1,run:true,sprint:true}),slope(70));
assert.equal(tooSteep.position.x,0,'2X sprint cannot run through a nearly vertical face');
const restingOnSlope=new CharacterTraversalController();restingOnSlope.teleport(0,0,0);
restingOnSlope.step(.02,input(),slope(55));
assert.equal(restingOnSlope.mode,'airborne','stopping a sprint on a steep slope starts a slide');
assert.ok(restingOnSlope.position.x<0,'the character slides downhill instead of standing across the slope');
assert.ok(restingOnSlope.slopeSlideDirection?.x<-.99,
  'the slide reports its downhill heading without movement input');
assert.ok(Math.abs(restingOnSlope.slopeSlideDirection.grade-Math.tan(55*Math.PI/180))<.01,
  'the slide reports the measured terrain grade for visual alignment');
for(let i=0;i<90;i++){
  restingOnSlope.step(1/60,input(),slope(55));
  assert.ok(restingOnSlope.slopeSlideDirection?.x<-.99,
    'a sustained slide keeps the same downhill heading');
}
restingOnSlope.teleport(0,0,0);
assert.equal(restingOnSlope.slopeSlideDirection,null,'teleport clears slide state');
const diagonalGrade=Math.tan(55*Math.PI/180)/Math.SQRT2;
const diagonalSlope={...flat,
  ground:(x,z,origin,max)=>{
    const height=(x+z)*diagonalGrade;
    return origin>=height&&origin-max<=height?
      {height,normalY:Math.cos(55*Math.PI/180)}:null;
  },
  fallbackHeight:(x,z)=>(x+z)*diagonalGrade
};
const diagonalSlide=new CharacterTraversalController();diagonalSlide.teleport(0,0,0);
diagonalSlide.step(.02,input(),diagonalSlope);
assert.ok(diagonalSlide.slopeSlideDirection?.x<-.7&&
  diagonalSlide.slopeSlideDirection.z<-.7,
  'diagonal terrain slopes face the slide across both horizontal axes');
assert.ok(Math.abs(diagonalSlide.slopeSlideDirection.grade-Math.tan(55*Math.PI/180))<.01);

// The new large landscape is a height field, not a tagged GLB rock.
const cliffHeight=(x,z)=>Math.abs(z)>2?0:Math.max(0,Math.min(x,8))*Math.tan(75*Math.PI/180);
const terrainCliff={...flat,fallbackHeight:cliffHeight,
  ground:(x,z,origin,max)=>{
    const h=cliffHeight(x,z),d=.05;
    const nx=(cliffHeight(x+d,z)-cliffHeight(x-d,z))/(2*d);
    const nz=(cliffHeight(x,z+d)-cliffHeight(x,z-d))/(2*d);
    return h<=origin&&h>=origin-max?{height:h,normalY:1/Math.hypot(nx,1,nz)}:null;
  },
  wall:(...args)=>terrainWallAt(cliffHeight,...args),
  headroom:(x,y,z)=>cliffHeight(x,z)<=y+.08
};
const terrainClimber=new CharacterTraversalController();terrainClimber.teleport(-.8,0,0);
terrainClimber.step(.02,input({moveX:1,vertical:1}),terrainCliff);
assert.equal(terrainClimber.mode,'climbing','W catches the landscape itself');
for(let i=0;i<80;i++)terrainClimber.step(.02,input({vertical:1}),terrainCliff);
assert.ok(terrainClimber.position.y>4);
assert.ok(terrainClimber.climbMotion.vertical>.9);
assert.ok(terrainClimber.climbFacing.x>.99,'the avatar faces into the wall');
const hangY=terrainClimber.position.y;
terrainClimber.step(.02,input(),terrainCliff);
assert.equal(terrainClimber.position.y,hangY,'no input hangs without climbing');
assert.equal(terrainClimber.climbMotion.vertical,0);
for(let i=0;i<15;i++)terrainClimber.step(.02,input({horizontal:1}),terrainCliff);
assert.ok(terrainClimber.position.z<-.5,'D traverses the wall to camera right');
assert.ok(terrainClimber.climbMotion.side>.9,'motion reports the character-right shimmy');
for(let i=0;i<15;i++)terrainClimber.step(.02,input({horizontal:-1}),terrainCliff);
assert.ok(Math.abs(terrainClimber.position.z)<.02);
assert.ok(terrainClimber.climbMotion.side<-.9);
for(let i=0;i<500&&terrainClimber.mode!=='grounded';i++)
  terrainClimber.step(.02,input({vertical:1}),terrainCliff);
assert.equal(terrainClimber.mode,'grounded','the terrain cliff can be climbed and mantled');
assert.ok(Math.abs(terrainClimber.position.y-cliffHeight(9,0))<.01);
assert.equal(terrainClimber.supportRockId,null,'terrain mantle restores ordinary terrain support');
terrainClimber.teleport(.4,5,0);terrainClimber.mode='airborne';
terrainClimber.step(.02,input({vertical:1}),terrainCliff);
assert.equal(terrainClimber.mode,'climbing','an airborne approach can catch a reachable face');
terrainClimber.step(.02,input({jumpPressed:true,vertical:1}),terrainCliff);
terrainClimber.step(.02,input({vertical:1}),terrainCliff);
assert.equal(terrainClimber.mode,'airborne','detaching does not instantly regrab the same wall');

// A mountain shoulder changes from a climbable face to a rising, walkable
// surface. It must not fall/regrab or require a perfectly horizontal plateau.
for(const faceAngle of [50,75])for(const shoulderAngle of [35,41.8]){
  const rise=Math.tan(faceAngle*Math.PI/180),shoulder=Math.tan(shoulderAngle*Math.PI/180);
  const height=(x)=>x<0?0:x<8?x*rise:8*rise+(x-8)*shoulder;
  const shoulderWorld={...flat,fallbackHeight:height,
    wall:(...args)=>terrainWallAt(height,...args),
    headroom:(x,y)=>height(x)<=y+.08,
    ground:(x,z,origin,max)=>{
      const y=height(x),normalY=1/Math.hypot(1,x<0?0:x<8?rise:shoulder);
      return y<=origin&&y>=origin-max?{height:y,normalY}:null;
    }
  };
  const avatar=new CharacterTraversalController();avatar.teleport(-.8,0,0);
  const modes=new Set();
  for(let i=0;i<1100&&avatar.position.x<11;i++){
    avatar.step(.02,input({moveX:1,vertical:1}),shoulderWorld);modes.add(avatar.mode);
  }
  assert.ok(modes.has('climbing'));
  assert.equal(modes.has('airborne'),false,'a shoulder does not drop and immediately regrab');
  assert.equal(avatar.mode,'grounded');
  assert.ok(avatar.position.x>=11,'walking continues beyond the crest');
}

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
