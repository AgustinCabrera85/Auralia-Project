/** Auralia Update 5C: movement constraints, kept independent of Babylon.js.
 * WorldView must wire these rules to a real collider/ground-query implementation.
 */
export const TRAVERSAL = {
  gravity: 24,                 // m/s², downward
  initialJumpSpeed: 10.5,     // m/s, about 2.3 m max rise
  playerRadius: 0.6,          // meters
  playerHeight: 3.8,         // match the visual character
  stepHeight: 0.4,
  groundSnap: 0.35,
  maxWalkSlopeDeg: 42,
  mantleMaxHeight: 1.65,      // separate from long rock climbing
  climbUpSpeed: 3.1,
  climbSideSpeed: 2.2,
  climbReach: 1.15,
  climbWallMinNormalY: -0.3,  // steep face; exact check in collider system
  climbWallMaxNormalY: 0.6,
  maxFallResetHeight: 140,
} as const;
export type LocomotionMode='grounded'|'airborne'|'climbing'|'mantling';
export type GroundHit={height:number;normalY:number;rockId?:string};
export function slopeAllowed(normalY:number):boolean {
  return Number.isFinite(normalY)&&normalY>=Math.cos(TRAVERSAL.maxWalkSlopeDeg*Math.PI/180);
}
export function canMantleRise(rise:number,spaceClear:boolean):boolean {
  return spaceClear&&Number.isFinite(rise)&&rise>0&&rise<=TRAVERSAL.mantleMaxHeight;
}
export function canBeginClimb(faceNormalY:number,taggedClimbable:boolean,withinReach:boolean):boolean {
  return taggedClimbable&&withinReach&&Number.isFinite(faceNormalY)&&
    faceNormalY>=TRAVERSAL.climbWallMinNormalY&&faceNormalY<=TRAVERSAL.climbWallMaxNormalY;
}
export function integrateAirborneVertical(velocityY:number,dt:number):{deltaY:number;velocityY:number}{
  const step=Math.max(0,Math.min(dt,.05));
  const next=velocityY-TRAVERSAL.gravity*step;
  return {deltaY:(velocityY+next)*.5*step,velocityY:next};
}
