import type {AbilityBehavior,AbilityContext,AbilityExecution,AbilityPlan,Point} from './types';
import type {AbilityTargets} from './forestRoots';
export type FlameEmitter={origin:Point;direction:Point};
export type FlameHit={distance:number;normal?:Point};
export interface FlameWorld {
  emitter():FlameEmitter|null;
  trace(origin:Point,direction:Point,length:number):FlameHit|null;
}
export const FLAME_WIDTH=.62;
/** Initial fire balance is independent of sword damage and sword progression. */
export class IgneoFireBehavior implements AbilityBehavior {
  constructor(private readonly world:FlameWorld,private readonly targets:AbilityTargets){}
  plan(_context:AbilityContext):AbilityPlan|null{
    const emitter=this.world.emitter();return emitter?{center:{...emitter.origin},placements:[]}:null;
  }
  impact(e:AbilityExecution,index:number):void{
    const emitter=this.world.emitter();if(!emitter)return;
    const {origin,direction}=emitter;
    const length=Math.min(e.profile.radius,Math.max(0,(e.timeline.impacts[index]-e.timeline.commit)*15));
    const hit=this.world.trace(origin,direction,length),range=Math.min(length,hit?.distance??length);
    this.targets.impactCone(e,index,origin,direction,range,FLAME_WIDTH,2,(from,to)=>{
      const x=to.x-from.x,y=to.y-from.y,z=to.z-from.z,d=Math.hypot(x,y,z);
      if(d<.001)return true;
      const obstruction=this.world.trace(from,{x:x/d,y:y/d,z:z/d},d);
      return !obstruction||obstruction.distance>=d-.03;
    });
  }
}
