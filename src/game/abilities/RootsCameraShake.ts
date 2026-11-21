import type { AbilityExecution } from '../../domain/abilities/types';

type CameraOffset={x:number;y:number};

/** Simulation-clock tremor: one decaying pulse per emerging ring, no timers or queued impulses. */
export function sampleRootsShake(e:AbilityExecution,out:CameraOffset):void{
  out.x=0;out.y=0;
  const spec=e.profile.cameraShake;
  if(!spec||!e.committed||!e.plan||spec.duration<=0)return;
  const rings=e.profile.rings;
  for(let i=0;i<(rings?.length??1);i++){
    if(!e.plan.placements.some(p=>(p.ring??0)===i))continue;
    const age=e.elapsed-(e.timeline.fx[0]??0)-(rings?.[i].delay??0);
    if(age<0||age>=spec.duration)continue;
    const envelope=Math.min(1,age/.015)*(1-age/spec.duration)**2;
    const amplitude=spec.amplitude*(1+i*.15)*envelope;
    const phase=age*spec.frequency*Math.PI*2+i*1.4;
    out.x+=Math.sin(phase*1.13+.7)*amplitude*.65;
    out.y+=Math.cos(phase)*amplitude;
  }
  // Even overlapping pulses cannot shift the view beyond this presentation-only limit.
  const length=Math.hypot(out.x,out.y),limit=.16;
  if(length>limit){out.x*=limit/length;out.y*=limit/length;}
}

/** Adds only a screen offset. Never changes the orbit, player or attack coordinates. */
export class RootsCameraShake {
  private target:CameraOffset|null=null;
  private readonly applied:CameraOffset={x:0,y:0};
  apply(e:AbilityExecution,target:CameraOffset|null):void{
    this.clear();if(!target)return;
    sampleRootsShake(e,this.applied);this.target=target;
    target.x+=this.applied.x;target.y+=this.applied.y;
  }
  clear():void{
    if(this.target){this.target.x-=this.applied.x;this.target.y-=this.applied.y;}
    this.target=null;this.applied.x=0;this.applied.y=0;
  }
}
