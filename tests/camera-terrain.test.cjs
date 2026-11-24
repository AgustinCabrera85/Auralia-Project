const assert=require('node:assert/strict');
const {cameraTerrainView,CAMERA_TERRAIN,THIRD_PERSON_CAMERA,swimmingCameraOrbit,cameraRadiusAfterCollision}=require('../.test-build/game/cameraTerrain.js');

const target={x:0,y:1.85,z:0};
const back={x:1,y:0,z:0};
const flat=()=>0;
const unobstructed=cameraTerrainView(target,back,29,flat,target.y);
assert.equal(unobstructed.maxRadius,29);
assert.equal(unobstructed.targetY,target.y);

const ridge=(x)=>x>=8&&x<=12?5:0;
const blocked=cameraTerrainView(target,back,29,ridge,target.y);
assert(blocked.maxRadius<8,'the camera stops in front of a ridge');
assert(blocked.maxRadius>CAMERA_TERRAIN.minRadius,'the camera keeps useful distance');

const uphill=(x)=>x*1.6;
const closeSlope=cameraTerrainView(target,back,29,uphill,target.y);
assert(closeSlope.targetY>target.y,'the target lifts above nearby rising ground');
assert(closeSlope.maxRadius>=CAMERA_TERRAIN.minRadius);

const skyDirection={x:Math.sqrt(1-.35**2),y:-.35,z:0};
const sky=cameraTerrainView(target,skyDirection,29,flat,target.y);
assert(sky.targetY>target.y,'looking at the sky raises the camera pivot');
assert(sky.maxRadius<29,'the camera moves closer before dipping into the ground');
const repeated=cameraTerrainView({...target,y:sky.targetY},skyDirection,29,flat,target.y);
assert.equal(repeated.targetY,sky.targetY,'the sky lift does not accumulate each frame');

console.log('Camera terrain clearance checks passed');
for(const depth of [1.3,2,5,12])for(const beta of [.4,.9,1.3,1.9]){
  const y=24-depth,view=swimmingCameraOrbit(y,24,beta,20);
  assert.ok(view.radius<=8,'swimming frames the player at a useful distance');
  assert.ok(y+Math.cos(view.beta)*view.radius<=23.45+.001,'diving orbit cannot separate from the body across the surface');
}
assert.equal(swimmingCameraOrbit(23.6,24,1,11).beta,1,'surface swimming preserves the orbit');
assert.equal(swimmingCameraOrbit(2,null,1,11).beta,1,'absent water never forces an underwater orbit');

for(let beta=THIRD_PERSON_CAMERA.minBeta;beta<=THIRD_PERSON_CAMERA.maxBeta;beta+=.03){
  const direction={x:Math.sin(beta),y:Math.cos(beta),z:0};
  const view=cameraTerrainView(target,direction,28,flat,target.y);
  assert.ok(view.targetY+direction.y*view.maxRadius>=CAMERA_TERRAIN.clearance-1e-6,
    'the complete expanded orbit keeps the camera above the ground');
}
const almostUp={x:Math.sin(THIRD_PERSON_CAMERA.maxBeta),y:Math.cos(THIRD_PERSON_CAMERA.maxBeta),z:0};
const underRoof=cameraTerrainView(target,almostUp,28,flat,target.y,3.4);
assert.ok(underRoof.targetY<=3.4,'looking up cannot lift the pivot through a roof');
assert.ok(underRoof.targetY+almostUp.y*underRoof.maxRadius>=CAMERA_TERRAIN.clearance-1e-6);
assert.equal(cameraRadiusAfterCollision(11.5,.4,1/60),.4,'contact pulls in immediately, even closer than the old minimum');
let at30=2,at120=2;
for(let i=0;i<30;i++)at30=cameraRadiusAfterCollision(at30,11.5,1/30);
for(let i=0;i<120;i++)at120=cameraRadiusAfterCollision(at120,11.5,1/120);
assert.ok(Math.abs(at30-at120)<1e-10,'return easing is independent of frame rate');
console.log('Expanded camera orbit, roof clearance and smooth recovery checks passed');
