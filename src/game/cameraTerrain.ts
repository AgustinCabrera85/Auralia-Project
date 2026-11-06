export type CameraPoint = {x:number;y:number;z:number};

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
