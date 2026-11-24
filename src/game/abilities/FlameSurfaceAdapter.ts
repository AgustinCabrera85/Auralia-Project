import type {FlameHit} from '../../domain/abilities/igneoFire';
import type {Point} from '../../domain/abilities/types';
import type {TraversalWorld} from '../CharacterTraversalController';
/** Short bounded ray against the same spatial collision providers as traversal.
 * No scene-wide mesh picking and no particle-by-particle collision. */
export class FlameSurfaceAdapter {
  constructor(private readonly world:()=>TraversalWorld,private readonly offset:()=>Point,
    private readonly blocks:(from:Point,to:Point)=>boolean=()=>false){}
  trace(origin:Point,direction:Point,length:number):FlameHit|null{
    const w=this.world(),o=this.offset();let range=Math.min(12,Math.max(0,length)),nearest:FlameHit|null=null;
    let previous={x:origin.x-o.x,y:origin.y-o.y,z:origin.z-o.z};
    const level=Math.abs(direction.y)<.001;
    if(level){
      const hit=w.wall(previous.x,previous.y,previous.z,direction.x,direction.z,range);
      if(hit&&hit.distance<=range){range=hit.distance;nearest={distance:range,normal:{x:hit.normalX,y:hit.normalY,z:hit.normalZ}};}
    }
    const steps=Math.ceil(range/.35),horizontal=Math.hypot(direction.x,direction.z);
    for(let i=1;i<=steps;i++){
      const a=(i-1)*range/steps,b=i*range/steps;
      const next={x:origin.x-o.x+direction.x*b,y:origin.y-o.y+direction.y*b,z:origin.z-o.z+direction.z*b};
      if(!level&&horizontal>.001){
        const hit=w.wall(previous.x,(previous.y+next.y)*.5,previous.z,direction.x/horizontal,direction.z/horizontal,(b-a)*horizontal);
        if(hit&&hit.distance<=(b-a)*horizontal)return {distance:a+hit.distance/horizontal,
          normal:{x:hit.normalX,y:hit.normalY,z:hit.normalZ}};
      }
      const water=w.waterLevel?.(next.x,next.z);
      const ground=w.ground(next.x,next.z,next.y+.05,.1,0);
      if(ground||water!=null&&next.y<=water||this.blocks(previous,next)||!w.headroom(next.x,next.y-.1,next.z,.2))
        return {distance:a,normal:{x:-direction.x,y:-direction.y,z:-direction.z}};
      previous=next;
    }
    return nearest;
  }
}
