const assert=require('node:assert/strict');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const input=(overrides={})=>({moveX:0,moveZ:0,forwardX:1,forwardZ:0,
  horizontal:0,vertical:0,run:false,sprint:false,jumpPressed:false,...overrides});
const waterWorld=(level=(x,z)=>100-x,overrides={})=>({
  ground:()=>null,solidTop:()=>null,wall:()=>null,headroom:()=>true,canMove:()=>true,
  fallbackHeight:(x,z)=>level(x,z)-30,waterLevel:level,...overrides
});
const swimmer=(world,depth=1.8)=>{
  const c=new CharacterTraversalController();c.teleport(0,world.waterLevel(0,0)-depth,0);
  return c;
};
const advance=(c,world,seconds=3,controls=input(),fps=60)=>{
  for(let i=0;i<seconds*fps;i++)c.step(1/fps,controls,world);
};
const near=(a,b,tolerance=.01)=>assert.ok(Math.abs(a-b)<tolerance,`${a} should be near ${b}`);

// Only the water slope drives gravity, not the terrain under a level lake.
const flat=waterWorld(()=>100,{fallbackHeight:(x,z)=>50-x*.8+z*.3});
const idle=swimmer(flat);advance(idle,flat);
near(idle.position.x,0);near(idle.position.z,0);near(idle.swimPitch,0);
const lake=swimmer(flat);advance(lake,flat,3,input({moveX:1}));
assert.ok(lake.position.x>15&&lake.position.x<17,'flat-water stroke speed is preserved');
near(lake.position.y,98.35);

const slope=waterWorld(),drift=swimmer(slope);
advance(drift,slope,4);
assert.ok(drift.position.x>25,'gravity carries an idle swimmer downhill');
near(slope.waterLevel(drift.position.x,0)-drift.position.y,1.65);
near(drift.swimPitch,Math.PI/4,.015);
assert.ok(drift.swimTravelDirection.x>.99,'facing follows the actual downhill motion');
const upstream=swimmer(slope);advance(upstream,slope,4,input({moveX:-1,run:true}));
assert.ok(upstream.position.x>6,'fast upstream strokes cannot hover on a 45-degree drop');
const cross=swimmer(slope);advance(cross,slope,3,input({moveZ:1}));
assert.ok(cross.position.x>15&&cross.position.z>14,'lateral steering still works in the current');
const gentle=waterWorld(x=>100-x*.1),up=swimmer(gentle);
advance(up,gentle,3,input({moveX:-1}));
assert.ok(up.position.x<-9,'gentle currents remain swimmable upstream');
assert.ok(up.swimPitch<-.08,'the body points up when actually swimming uphill');

// Submerged swimmers keep depth as well as surface swimmers, and can still dive.
const deep=swimmer(slope,8);advance(deep,slope,3);
near(slope.waterLevel(deep.position.x,0)-deep.position.y,8);
advance(deep,slope,1,input({swimVertical:-1}));
near(slope.waterLevel(deep.position.x,0)-deep.position.y,12);
deep.step(1/60,input({jumpPressed:true}),slope);
advance(deep,slope,5);
near(slope.waterLevel(deep.position.x,0)-deep.position.y,1.65);
const falling=swimmer(waterWorld(x=>100-4*x));
advance(falling,waterWorld(x=>100-4*x),5);
assert.ok(Number.isFinite(falling.swimPitch)&&falling.swimPitch>1.2);
assert.ok(Math.hypot(falling.swimTravel.x,falling.swimTravel.y,falling.swimTravel.z)<=18.01,
  'steep-flow speed is bounded in 3D, not just horizontally');

// A wall across the current blocks it, but not travel along the wall.
const wallWorld=waterWorld(undefined,{wall:(x,y,z,dx,dz,reach)=>{
  const distance=dx>0?(4-x)/dx:Infinity;
  return distance>=0&&distance<=reach?{pointX:4,pointY:y,pointZ:z+dz*distance,
    distance,normalX:-1,normalY:0,normalZ:0,rockId:'wall',climbable:false}:null;
}});
const blocked=swimmer(wallWorld);advance(blocked,wallWorld,5,input({moveZ:1}));
assert.ok(blocked.position.x<3.41,'flow cannot push through the solid shell');
assert.ok(blocked.position.z>24,'flow slides along the wall');
assert.ok(blocked.swimFlowX<.01,'blocked gravity does not accumulate a hidden impulse');
const closed=waterWorld(undefined,{canMove:()=>false}),stopped=swimmer(closed);
advance(stopped,closed,3);near(stopped.position.x,0);near(stopped.swimFlowX,0);
const cave=waterWorld(()=>100,{
  headroom:(x,y,z,height)=>y+height<=95,
  solidTop:(x,z,origin,distance)=>origin>=90&&origin-distance<=90?
    {height:90,normalX:0,normalZ:0,rockId:'floor',centerX:x,centerZ:z}:null
});
const diver=swimmer(cave,8);advance(diver,cave,2,input({swimVertical:-1}));
assert.ok(diver.position.y>=90.3,'diving still respects submerged solid floors');
advance(diver,cave,3,input({swimVertical:1}));
assert.ok(diver.position.y<=93.21,'surfacing still respects a submerged ceiling');

// A shoreline with no sample is not a waterfall; one valid side preserves grade.
const edge=waterWorld((x,z)=>z<0?null:100-x,{fallbackHeight:()=>50});
const bank=swimmer(edge);advance(bank,edge,2);
assert.ok(bank.position.x>10);near(bank.position.z,0);

// Downstream momentum fades on a level reach, and cannot survive a teleport.
const reach=waterWorld(x=>100-Math.min(x,10)),settled=swimmer(reach);
advance(settled,reach,10);const atRest=settled.position.x;advance(settled,reach,2);
assert.ok(settled.position.x-atRest<.01,'a flat reach removes residual flow with drag');
drift.teleport(0,98.2,0);advance(drift,flat,2);near(drift.position.x,0);
const lip=swimmer(slope);advance(lip,slope,2);
lip.step(1/60,input(),{...slope,waterLevel:()=>null});
assert.equal(lip.mode,'airborne');assert.ok(lip.airTravelDirection.x>.99,
  'leaving the water retains downstream momentum rather than suspending the swimmer');

// Gravity remains a time-based motion at slow and fast render rates.
const endpoints=[30,60,120].map(fps=>{
  const c=swimmer(slope);advance(c,slope,4,input(),fps);return c.position.x;
});
assert.ok(Math.max(...endpoints)-Math.min(...endpoints)<.15,'30/60/120 FPS stay within 15 cm');
console.log('Swimming slopes: downhill gravity, posture, depth, controls, walls, shores and frame rates passed.');
