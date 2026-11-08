import type { TraversalWall } from './CharacterTraversalController';

/** A bounded horizontal ray against the same height field used by character support.
 * No extra meshes, physics bodies or persistent per-sector allocations are needed.
 */
export function terrainWallAt(height:(x:number,z:number)=>number,
  x:number,y:number,z:number,dx:number,dz:number,reach:number):TraversalWall|null {
  const length=Math.hypot(dx,dz);
  if(length<1e-6||reach<=0||height(x,z)>y+.03)return null;
  dx/=length;dz/=length;
  const steps=Math.max(1,Math.ceil(reach/.3));
  let previous=0;
  for(let i=1;i<=steps;i++){
    const distance=reach*i/steps;
    if(height(x+dx*distance,z+dz*distance)<y){previous=distance;continue;}
    let lo=previous,hi=distance;
    for(let n=0;n<7;n++){
      const mid=(lo+hi)*.5;
      if(height(x+dx*mid,z+dz*mid)<y)lo=mid;else hi=mid;
    }
    const hit=(lo+hi)*.5,px=x+dx*hit,pz=z+dz*hit,d=.3;
    const gx=(height(px+d,pz)-height(px-d,pz))/(2*d);
    const gz=(height(px,pz+d)-height(px,pz-d))/(2*d);
    const norm=Math.hypot(gx,1,gz);
    return {pointX:px,pointY:y,pointZ:pz,distance:hit,
      normalX:-gx/norm,normalY:1/norm,normalZ:-gz/norm,
      rockId:'terrain:mainland',climbable:true,terrain:true};
  }
  return null;
}
