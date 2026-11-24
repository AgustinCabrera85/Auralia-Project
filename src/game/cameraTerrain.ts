export type CameraPoint = {x:number;y:number;z:number};

/** Shared physical framing for the game and terrain comparison tool. */
export const THIRD_PERSON_CAMERA={distance:11.5,minDistance:5.5,maxDistance:28,
  targetHeight:2.05,sprintDistance:2.5,alpha:-Math.PI/2,beta:1.22,fov:.8,
  minBeta:.14,maxBeta:2.90,angularSensitivity:650} as const;

/** A diver's orbit follows the body, staying under the surface once submerged.
 * Terrain clearance is still resolved separately along this orbit. */
export function swimmingCameraOrbit(targetY:number,waterY:number|null,beta:number,radius:number){
  const distance=Math.min(radius,8);
  const submerged=waterY!==null&&targetY<waterY-1.2;
  const surfaceBeta=submerged?Math.acos(Math.max(-1,Math.min(1,(waterY!-.55-targetY)/distance))):0;
  return {radius:distance,beta:Math.max(beta,surfaceBeta),targetHeight:1.25};
}

export const CAMERA_TERRAIN = {
  minRadius:.25,
  pivotProbeRadius:1.4,
  clearance:.85,
  sampleStep:.75,
  skyViewRadius:8
} as const;

/** Keep the camera above the ground and stop before terrain blocks the view. */
export function cameraTerrainView(target:CameraPoint,direction:CameraPoint,
  preferredRadius:number,groundAt:(x:number,z:number)=>number,focusY:number,maxTargetY=Infinity):
  {targetY:number;maxRadius:number}{
  const {minRadius,clearance,sampleStep,skyViewRadius}=CAMERA_TERRAIN;
  const pivotRadius=Math.min(preferredRadius,CAMERA_TERRAIN.pivotProbeRadius);
  let targetY=Math.max(target.y,
    focusY+Math.max(0,-direction.y)*Math.min(skyViewRadius,preferredRadius));
  for(let distance=0;distance<=pivotRadius;distance+=sampleStep){
    const x=target.x+direction.x*distance,z=target.z+direction.z*distance;
    targetY=Math.max(targetY,groundAt(x,z)+clearance-direction.y*distance);
  }
  const nearX=target.x+direction.x*pivotRadius,nearZ=target.z+direction.z*pivotRadius;
  targetY=Math.max(targetY,groundAt(nearX,nearZ)+clearance-direction.y*pivotRadius);
  targetY=Math.min(targetY,maxTargetY);

  let previous:number=minRadius;
  for(let distance=minRadius+sampleStep;distance<=preferredRadius+sampleStep;distance+=sampleStep){
    const current=Math.min(distance,preferredRadius);
    const x=target.x+direction.x*current,z=target.z+direction.z*current;
    if(targetY+direction.y*current<groundAt(x,z)+clearance){
      // Refine the first contact instead of jumping in .75 m increments.
      let lo=previous,hi=current;
      for(let i=0;i<5;i++){
        const mid=(lo+hi)/2;
        if(targetY+direction.y*mid<groundAt(target.x+direction.x*mid,target.z+direction.z*mid)+clearance)hi=mid;
        else lo=mid;
      }
      return {targetY,maxRadius:lo};
    }
    if(current===preferredRadius)break;
    previous=current;
  }
  return {targetY,maxRadius:preferredRadius};
}

/** Cache only an unchanged sight line. A turn, zoom or moving pivot must check
 * its new path immediately; the idle refresh also picks up streamed geometry. */
export class CameraObstructionProbe {
  private from={x:NaN,y:NaN,z:NaN};
  private to={x:NaN,y:NaN,z:NaN};
  private age=Infinity;
  private hit:number|null=null;
  resolve(from:CameraPoint,to:CameraPoint,dt:number,query:()=>number|null):number|null{
    this.age+=Math.max(0,dt);
    const same=(a:CameraPoint,b:CameraPoint)=>Math.abs(a.x-b.x)<1e-5&&Math.abs(a.y-b.y)<1e-5&&Math.abs(a.z-b.z)<1e-5;
    if(this.age>=.12||!same(from,this.from)||!same(to,this.to)){
      this.hit=query();this.age=0;
      this.from.x=from.x;this.from.y=from.y;this.from.z=from.z;
      this.to.x=to.x;this.to.y=to.y;this.to.z=to.z;
    }
    return this.hit;
  }
}

/** Contact is immediate; returning to the chosen zoom is frame-rate independent. */
export function cameraRadiusAfterCollision(current:number,safe:number,dt:number):number{
  return safe<current?safe:current+(safe-current)*(1-Math.exp(-6*Math.max(0,dt)));
}
