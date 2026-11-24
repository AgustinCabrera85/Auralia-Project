import type { AbilityBehavior, AbilityContext, AbilityExecution, AbilityPlacement, AbilityPlan, AbilityProfile, Point, SurfacePoint } from './types';
/** Checkout has no damage system yet. Provisional base for the target contract; replace when combat owns it. */
export const PROVISIONAL_SWORD_DAMAGE=10;
export type AbilityImpact={executionId:string;abilityId:string;impactIndex:number;damage:number;
  origin:Point;push:number;immobilize:number};
export interface AffectableTarget {
  readonly id:string;readonly position:Point;readonly radius:number;
  valid():boolean;
  receive(impact:AbilityImpact):void;
}
/** Registered targets only. No global scene scans; one bounded query at each impact. */
export class AbilityTargets {
  private readonly targets=new Map<string,AffectableTarget>();
  register(target:AffectableTarget):()=>void{
    this.targets.set(target.id,target);
    return ()=>{if(this.targets.get(target.id)===target)this.targets.delete(target.id);};
  }
  impact(e:AbilityExecution,index:number,baseDamage:number,clear:(from:Point,to:Point)=>boolean,
    area?:{innerRadius:number;outerRadius:number;hitGroup:string}):void{
    if(!e.plan)return;
    const origin=e.plan.center;
    for(const target of this.targets.values()){
      const key=`${area?.hitGroup??index}:${target.id}`,p=target.position;
      if(e.hits.has(key)||!target.valid()||!Number.isFinite(target.radius)||target.radius<0||
        ![p.x,p.y,p.z].every(Number.isFinite))continue;
      const distance=Math.hypot(p.x-origin.x,p.z-origin.z);
      if(distance>(area?.outerRadius??e.profile.radius)+target.radius||
        distance+target.radius<(area?.innerRadius??0)||
        Math.abs(p.y-origin.y)>3+target.radius||!clear(origin,p))continue;
      e.hits.add(key);
      target.receive({executionId:e.id,abilityId:e.definition.id,impactIndex:index,
        damage:baseDamage*e.profile.damageMultiplier,origin,push:e.profile.push,immobilize:e.profile.immobilize});
    }
  }
  clear():void{this.targets.clear();}
  /** Fixed timeline pulses, with independent line-of-sight for each target. */
  impactCone(e:AbilityExecution,index:number,origin:Point,direction:Point,length:number,width:number,
    damage:number,clear:(from:Point,to:Point)=>boolean):void{
    for(const target of this.targets.values()){
      const key=`${index}:${target.id}`,p=target.position,r=target.radius;
      if(e.hits.has(key)||!target.valid()||!Number.isFinite(r)||r<0||![p.x,p.y,p.z].every(Number.isFinite))continue;
      const x=p.x-origin.x,y=p.y-origin.y,z=p.z-origin.z;
      const along=x*direction.x+y*direction.y+z*direction.z;
      if(along<0||along>length+r)continue;
      const radius=.065+width*Math.pow(Math.min(1,along/Math.max(.01,e.profile.radius)),.66);
      if(x*x+y*y+z*z-along*along>(radius+r)**2||!clear(origin,p))continue;
      e.hits.add(key);target.receive({executionId:e.id,abilityId:e.definition.id,impactIndex:index,
        damage:damage*e.profile.damageMultiplier,origin:{...origin},push:0,immobilize:0});
    }
  }
}
export interface RootsWorld {
  surface(x:number,z:number,nearY:number,horizontalReach?:number):SurfacePoint|null;
  clear(from:Point,to:Point,requireGroundContact?:boolean):boolean;
  baseDamage():number;
}
/** Concentric rings, with local angular retries near obstacles; fixed at commitment. */
export function planRoots(context:AbilityContext,profile:Readonly<AbilityProfile>,world:RootsWorld):AbilityPlan|null{
  const c=context.position,center=world.surface(c.x,c.z,c.y);
  if(!center)return null;
  const placements:AbilityPlacement[]=[];
  const rings=profile.rings??[{radius:profile.radius,roots:profile.roots,scale:profile.rootScale,delay:0}];
  for(let ring=0;ring<rings.length;ring++){
    const spec=rings[ring],radius=Math.max(1.1,spec.radius-.6),step=Math.PI*2/spec.roots;
    for(let slot=0;slot<spec.roots;slot++)for(const shift of [0,.18,-.18,.35]){
      const angle=(slot+(ring%2)*.5+shift)*step;
      const x=center.x+Math.cos(angle)*radius,z=center.z+Math.sin(angle)*radius;
      const hit=world.surface(x,z,center.y,radius);
      if(hit&&world.clear(center,hit,true)&&placements.every(p=>Math.hypot(p.x-x,p.z-z)>.45)){
        placements.push(Object.freeze({...hit,normal:Object.freeze({...hit.normal}),ring,delay:spec.delay,
          scale:spec.scale,lean:spec.lean??0}));
        break;
      }
    }
  }
  return placements.length?{center:Object.freeze({...center}),placements:Object.freeze(placements)}:null;
}
export class ForestRootsBehavior implements AbilityBehavior {
  constructor(private readonly world:RootsWorld,private readonly targets:AbilityTargets){}
  plan(context:AbilityContext,profile:Readonly<AbilityProfile>):AbilityPlan|null{return planRoots(context,profile,this.world);}
  impact(execution:AbilityExecution,index:number):void{
    const rings=execution.profile.rings,ring=rings?.[index];
    if(rings&&!ring)return;
    this.targets.impact(execution,index,this.world.baseDamage(),(a,b)=>this.world.clear(a,b),
      ring?{innerRadius:index?rings![index-1].radius:0,outerRadius:ring.radius,hitGroup:'roots'}:undefined);
  }
}
