import type { Point, SurfacePoint } from '../../domain/abilities/types';
import type { RootsWorld } from '../../domain/abilities/forestRoots';
import type { TraversalWorld } from '../CharacterTraversalController';

const MIN_NORMAL_Y=.7;
const MAX_GRADE=Math.sqrt(1-MIN_NORMAL_Y*MIN_NORMAL_Y)/MIN_NORMAL_Y;
const GROUND_TOLERANCE=.12;

/** Traversal coordinates are zone-local; effects/targets use world coordinates. */
export class RootsSurfaceAdapter implements RootsWorld {
  constructor(private readonly traversal:()=>TraversalWorld,private readonly offset:()=>Point,
    private readonly admitted:(x:number,z:number,y:number)=>boolean,
    readonly baseDamage:()=>number){}
  surface(x:number,z:number,nearY:number,horizontalReach=0):SurfacePoint|null{
    const world=this.traversal(),offset=this.offset(),lx=x-offset.x,lz=z-offset.z,ly=nearY-offset.y;
    // Remote roots can be several metres above/below the caster on a valid slope.
    // Bound the search by that slope; clear() verifies connected ground afterwards.
    const elevation=Math.max(0,horizontalReach)*MAX_GRADE+GROUND_TOLERANCE;
    const rise=Math.max(1.8,elevation),drop=Math.max(4.2,elevation);
    const hit=world.ground(lx,lz,ly+rise,rise+drop,.12);
    if(!hit||hit.normalY<MIN_NORMAL_Y||!Number.isFinite(hit.height)||!this.admitted(lx,lz,hit.height))return null;
    const water=world.waterLevel?.(lx,lz);
    if(water!=null&&hit.height<=water+.05)return null;
    if(!world.canMove(lx,lz,lx,lz,hit.height)||!world.headroom(lx,hit.height+.06,lz,3.9,hit.rockId))return null;
    // Query the actual neighboring collider triangles, not a smooth terrain approximation.
    const dx=world.ground(lx+.08,lz,hit.height+.3,.65,0);
    const dz=world.ground(lx,lz+.08,hit.height+.3,.65,0);
    if(!dx||!dz||Math.abs(dx.height-hit.height)>.12||Math.abs(dz.height-hit.height)>.12)return null;
    const nx=-(dx.height-hit.height)/.08,nz=-(dz.height-hit.height)/.08,len=Math.hypot(nx,1,nz);
    if(1/len<MIN_NORMAL_Y)return null;
    return {x,y:hit.height+offset.y,z,normal:{x:nx/len,y:1/len,z:nz/len}};
  }
  clear(from:Point,to:Point,requireGroundContact=false):boolean{
    const w=this.traversal(),o=this.offset(),dx=to.x-from.x,dz=to.z-from.z,distance=Math.hypot(dx,dz);
    if(distance<.001)return true;
    // Follow the actual support in short segments. A single horizontal ray at the
    // caster's height intersects uphill terrain and incorrectly treats it as a wall.
    const steps=Math.ceil(distance/.35),stepDistance=distance/steps;
    const heightRange=stepDistance*MAX_GRADE+GROUND_TOLERANCE;
    let px=from.x-o.x,py=from.y-o.y,pz=from.z-o.z;
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=from.x-o.x+dx*t,z=from.z-o.z+dz*t;
      const ground=w.ground(x,z,py+heightRange,2*heightRange,.1),water=w.waterLevel?.(x,z);
      if(!ground||!Number.isFinite(ground.height)||ground.normalY<MIN_NORMAL_Y||
        Math.abs(ground.height-py)>heightRange||water!=null&&ground.height<=water+.05)return false;
      const wall=w.wall(px,py+.8,pz,dx/distance,dz/distance,stepDistance);
      if(wall&&wall.distance<=stepDistance)return false;
      // Includes buildings/trees and scene-specific obstacles absent from wall queries.
      if(!w.canMove(x,z,px,pz,ground.height))return false;
      px=x;py=ground.height;pz=z;
    }
    // A broad candidate ray may hit an overhead platform while the trace stays
    // on the floor below it. Root anchors must reach the same support layer.
    return !requireGroundContact||Math.abs(py-(to.y-o.y))<=GROUND_TOLERANCE;
  }
}
