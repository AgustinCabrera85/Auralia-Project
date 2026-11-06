const assert=require('node:assert/strict');
const {cameraTerrainView,CAMERA_TERRAIN}=require('../.test-build/game/cameraTerrain.js');

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
