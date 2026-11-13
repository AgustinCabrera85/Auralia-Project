export type CameraPoint = {x:number;y:number;z:number};

/** Shared physical framing for the game and terrain comparison tool. */
export const THIRD_PERSON_CAMERA={distance:11.5,minDistance:5.5,maxDistance:28,
  targetHeight:2.05,sprintDistance:2.5,alpha:-Math.PI/2,beta:1.22,fov:.8} as const;

/** A diver's orbit follows the body, staying under the surface once submerged.
 * Terrain clearance is still resolved separately along this orbit. */
export function swimmingCameraOrbit(targetY:number,waterY:number|null,beta:number,radius:number){
  const distance=Math.min(radius,8);
  const submerged=waterY!==null&&targetY<waterY-1.2;
  const surfaceBeta=submerged?Math.acos(Math.max(-1,Math.min(1,(waterY!-.55-targetY)/distance))):0;
  return {radius:distance,beta:Math.max(beta,surfaceBeta),targetHeight:1.25};
}

export const CAMERA_TERRAIN = {
  minRadius:1.4,
  clearance:.85,
  sampleStep:.75,
  skyViewRadius:8
} as const;

/** Keep the camera above the ground and stop before terrain blocks the view. */
export function cameraTerrainView(target:CameraPoint,direction:CameraPoint,
  preferredRadius:number,groundAt:(x:number,z:number)=>number,focusY:number):
  {targetY:number;maxRadius:number}{
  const {minRadius,clearance,sampleStep,skyViewRadius}=CAMERA_TERRAIN;
  let targetY=Math.max(target.y,
    focusY+Math.max(0,-direction.y)*Math.min(skyViewRadius,preferredRadius));
  for(let distance=0;distance<=minRadius;distance+=sampleStep){
    const x=target.x+direction.x*distance,z=target.z+direction.z*distance;
    targetY=Math.max(targetY,groundAt(x,z)+clearance-direction.y*distance);
  }
  const nearX=target.x+direction.x*minRadius,nearZ=target.z+direction.z*minRadius;
  targetY=Math.max(targetY,groundAt(nearX,nearZ)+clearance-direction.y*minRadius);

  let previous:number=minRadius;
  for(let distance=minRadius+sampleStep;distance<=preferredRadius+sampleStep;distance+=sampleStep){
    const current=Math.min(distance,preferredRadius);
    const x=target.x+direction.x*current,z=target.z+direction.z*current;
    if(targetY+direction.y*current<groundAt(x,z)+clearance)
      return {targetY,maxRadius:previous};
    if(current===preferredRadius)break;
    previous=current;
  }
  return {targetY,maxRadius:preferredRadius};
}
